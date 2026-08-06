from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_development
from app.auth.session import create_session_value
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.common import utc_now
from app.models.user import User
from app.repositories.users import get_user, list_active_users
from app.schemas.auth import DevelopmentUserResponse, DevLoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
def current_user(user: User = Depends(get_current_user)) -> User:
    return user


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
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session_value(settings, user.id),
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: Settings = Depends(get_settings)) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/")
