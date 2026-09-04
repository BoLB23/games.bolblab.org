from __future__ import annotations

import hmac
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_development
from app.auth.oidc import OidcError, complete_login, start_login
from app.auth.session import create_session, get_session, revoke_session
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.common import utc_now
from app.models.user import User
from app.repositories.users import get_user, list_active_users
from app.schemas.auth import (
    DevelopmentUserResponse,
    DevLoginRequest,
    SessionStatusResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
_OIDC_TRANSACTION_COOKIE = "game_platform_oidc_tx"


def _oidc_transaction_cookie(settings: Settings) -> str:
    return "__Host-game_platform_oidc_tx" if settings.session_cookie_secure else _OIDC_TRANSACTION_COOKIE


def _safe_return_path(value: str | None) -> str:
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value or len(value) > 2048:
        return "/"
    if any(ord(character) < 32 for character in value):
        return "/"
    return value


def _login_error_redirect(settings: Settings) -> RedirectResponse:
    return RedirectResponse(f"{settings.catalog_origin}/login?error=google_login_failed", status_code=status.HTTP_303_SEE_OTHER)


@router.get("/login")
def oidc_login(
    next_path: str | None = Query(default=None, alias="next"),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if settings.auth_mode != "oidc":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC authentication is disabled")
    try:
        location = start_login(session, settings, _safe_return_path(next_path))
        state = parse_qs(urlparse(location).query).get("state", [""])[0]
        if not state:
            raise OidcError("OIDC provider did not return state")
        redirect = RedirectResponse(location, status_code=status.HTTP_303_SEE_OTHER)
        redirect.set_cookie(
            _oidc_transaction_cookie(settings), state, httponly=True, secure=settings.session_cookie_secure,
            samesite="lax", max_age=settings.oidc_transaction_ttl_seconds, path="/",
        )
        return redirect
    except OidcError:
        return _login_error_redirect(settings)


@router.get("/callback")
def oidc_callback(
    request: Request,
    code: str | None = None,
    state_value: str | None = Query(default=None, alias="state"),
    _error: str | None = Query(default=None, alias="error"),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    def failure() -> RedirectResponse:
        redirect = _login_error_redirect(settings)
        redirect.delete_cookie(_oidc_transaction_cookie(settings), path="/", secure=settings.session_cookie_secure)
        return redirect

    if settings.auth_mode != "oidc":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC authentication is disabled")
    if not code or not state_value:
        return failure()
    browser_state = request.cookies.get(_oidc_transaction_cookie(settings))
    if not browser_state:
        return failure()
    try:
        state_matches = hmac.compare_digest(
            browser_state.encode("ascii"), state_value.encode("ascii")
        )
    except UnicodeEncodeError:
        state_matches = False
    if not state_matches:
        return failure()
    try:
        user, return_path, _subject = complete_login(session, settings, code, state_value)
        session_token = create_session(session, settings, user.id)
        session.commit()
    except OidcError:
        return failure()
    redirect = RedirectResponse(f"{settings.catalog_origin}{return_path}", status_code=status.HTTP_303_SEE_OTHER)
    redirect.set_cookie(
        key=settings.session_cookie_name, value=session_token, httponly=True, samesite="lax",
        secure=settings.session_cookie_secure, max_age=settings.session_ttl_seconds, path="/",
    )
    redirect.headers["Cache-Control"] = "no-store"
    redirect.headers["Referrer-Policy"] = "no-referrer"
    redirect.delete_cookie(_oidc_transaction_cookie(settings), path="/", secure=settings.session_cookie_secure)
    return redirect


@router.get("/me", response_model=UserResponse)
def current_user(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/session", response_model=SessionStatusResponse)
def session_status(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    """Revalidate the HTTP-only-cookie session without triggering an OIDC flow."""
    current = get_session(session, request.cookies.get(settings.session_cookie_name))
    if current is None:  # Defensive: get_current_user has already checked this.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return {"user": user, "expires_at": current.expires_at, "is_sliding": False}


@router.get("/dev/users", response_model=list[DevelopmentUserResponse])
def development_users(
    session: Session = Depends(get_db_session), _settings: Settings = Depends(require_development)
) -> list[User]:
    return list_active_users(session)


@router.post("/dev/login", response_model=UserResponse)
def development_login(
    payload: DevLoginRequest,
    response: Response,
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(require_development),
) -> User:
    user = get_user(session, payload.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Development user is unavailable")
    timestamp = utc_now()
    user.last_login_at = timestamp
    user.last_seen_at = timestamp
    session.commit()
    session.refresh(user)
    session_token = create_session(session, settings, user.id)
    session.commit()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> None:
    revoke_session(session, request.cookies.get(settings.session_cookie_name))
    session.commit()
    response.delete_cookie(key=settings.session_cookie_name, path="/")
