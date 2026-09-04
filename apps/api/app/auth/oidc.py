from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import UTC, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from authlib.jose import jwt
from authlib.jose.errors import JoseError
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.auth import OidcLoginTransaction
from app.models.common import utc_now
from app.models.user import ClanRole, ExternalIdentity, User

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_GOOGLE_ISSUER = "https://accounts.google.com"


class OidcError(Exception):
    """An expected OIDC failure that must not disclose provider details to the browser."""


def _normalized_email(value: object) -> str | None:
    """Normalize an email only for matching the configured bootstrap account."""
    if not isinstance(value, str):
        return None
    normalized = value.strip().casefold()
    if not normalized or len(normalized) > 320 or any(character.isspace() or ord(character) < 32 for character in normalized):
        return None
    return normalized


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _url_token(size: int = 32) -> str:
    return secrets.token_urlsafe(size)


def _pkce_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")


def _fernet(settings: Settings) -> Fernet:
    assert settings.oidc_transaction_secret is not None
    try:
        return Fernet(settings.oidc_transaction_secret.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise OidcError("Invalid OIDC transaction secret") from exc


def _discovery(settings: Settings) -> dict[str, str]:
    assert settings.oidc_issuer is not None
    issuer = settings.oidc_issuer.rstrip("/")
    try:
        response = httpx.get(f"{issuer}/.well-known/openid-configuration", timeout=_TIMEOUT, follow_redirects=False)
        response.raise_for_status()
        raw_document = response.json()
        if not isinstance(raw_document, dict):
            raise OidcError("Invalid Google discovery document")
        document: dict[str, Any] = raw_document
    except (httpx.HTTPError, ValueError) as exc:
        raise OidcError("Google discovery is unavailable") from exc
    required = ("issuer", "authorization_endpoint", "token_endpoint", "jwks_uri")
    if any(not isinstance(document.get(key), str) for key in required) or document["issuer"] != _GOOGLE_ISSUER:
        raise OidcError("Invalid Google discovery document")
    return {key: str(document[key]) for key in required}


def start_login(session: Session, settings: Settings, return_path: str) -> str:
    discovery = _discovery(settings)
    state, nonce, verifier = _url_token(), _url_token(), _url_token(72)
    now = utc_now()
    session.add(
        OidcLoginTransaction(
            state_digest=_digest(state), nonce=nonce,
            encrypted_code_verifier=_fernet(settings).encrypt(verifier.encode("ascii")).decode("ascii"),
            return_path=return_path, expires_at=now + timedelta(seconds=settings.oidc_transaction_ttl_seconds),
        )
    )
    session.commit()
    assert settings.oidc_client_id is not None and settings.oidc_callback_url is not None
    params = {
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_callback_url,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
        "code_challenge": _pkce_challenge(verifier),
        "code_challenge_method": "S256",
    }
    return f"{discovery['authorization_endpoint']}?{urlencode(params)}"


def _consume_transaction(session: Session, settings: Settings, state: str) -> OidcLoginTransaction:
    transaction = session.scalar(select(OidcLoginTransaction).where(OidcLoginTransaction.state_digest == _digest(state)))
    if transaction is None or transaction.consumed_at is not None:
        raise OidcError("Invalid or expired OIDC state")
    expires_at = transaction.expires_at if transaction.expires_at.tzinfo else transaction.expires_at.replace(tzinfo=UTC)
    if expires_at <= utc_now():
        raise OidcError("Invalid or expired OIDC state")
    # Consume state with a compare-and-set so two callbacks racing with the
    # same state cannot both exchange the authorization code.
    consumed_at = utc_now()
    result = session.execute(
        update(OidcLoginTransaction)
        .where(
            OidcLoginTransaction.id == transaction.id,
            OidcLoginTransaction.consumed_at.is_(None),
            OidcLoginTransaction.expires_at > consumed_at,
        )
        .values(consumed_at=consumed_at)
    )
    if result.rowcount != 1:  # type: ignore[attr-defined]
        session.rollback()
        raise OidcError("Invalid or expired OIDC state")
    session.commit()
    session.refresh(transaction)
    try:
        _fernet(settings).decrypt(transaction.encrypted_code_verifier.encode("ascii"))
    except InvalidToken as exc:
        raise OidcError("Invalid OIDC transaction") from exc
    return transaction


def _tokens(settings: Settings, code: str, verifier: str, token_endpoint: str) -> dict[str, Any]:
    assert settings.oidc_client_id is not None and settings.oidc_client_secret is not None and settings.oidc_callback_url is not None
    try:
        response = httpx.post(
            token_endpoint,
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": settings.oidc_callback_url, "client_id": settings.oidc_client_id, "code_verifier": verifier},
            auth=(settings.oidc_client_id, settings.oidc_client_secret), timeout=_TIMEOUT, follow_redirects=False,
        )
        response.raise_for_status()
        raw_payload = response.json()
        if not isinstance(raw_payload, dict):
            raise OidcError("Google token exchange failed")
        payload: dict[str, Any] = raw_payload
    except (httpx.HTTPError, ValueError) as exc:
        raise OidcError("Google token exchange failed") from exc
    if not isinstance(payload.get("id_token"), str):
        raise OidcError("Google did not issue an ID token")
    return payload


def _identity_claims(settings: Settings, id_token: str, nonce: str, jwks_uri: str) -> dict[str, Any]:
    assert settings.oidc_client_id is not None
    try:
        jwks_response = httpx.get(jwks_uri, timeout=_TIMEOUT, follow_redirects=False)
        jwks_response.raise_for_status()
        claims = jwt.decode(
            id_token,
            jwks_response.json(),
            claims_options={
                "iss": {"essential": True, "value": _GOOGLE_ISSUER},
                "aud": {"essential": True, "value": settings.oidc_client_id},
                "exp": {"essential": True},
                "nonce": {"essential": True, "value": nonce},
                "sub": {"essential": True},
            },
        )
        claims.validate(leeway=60)
    except (httpx.HTTPError, JoseError, ValueError, KeyError) as exc:
        raise OidcError("Google ID token validation failed") from exc
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise OidcError("Google did not provide a subject")
    return dict(claims)


def complete_login(session: Session, settings: Settings, code: str, state: str) -> tuple[User, str, str]:
    transaction = _consume_transaction(session, settings, state)
    try:
        verifier = _fernet(settings).decrypt(transaction.encrypted_code_verifier.encode("ascii")).decode("ascii")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise OidcError("Invalid OIDC transaction") from exc
    discovery = _discovery(settings)
    token_response = _tokens(settings, code, verifier, discovery["token_endpoint"])
    claims = _identity_claims(settings, str(token_response["id_token"]), transaction.nonce, discovery["jwks_uri"])
    assert settings.oidc_issuer is not None
    subject = str(claims["sub"])
    identity = session.scalar(select(ExternalIdentity).where(ExternalIdentity.issuer == settings.oidc_issuer, ExternalIdentity.subject == subject))
    email = claims.get("email") if isinstance(claims.get("email"), str) else None
    email_verified = claims.get("email_verified") if isinstance(claims.get("email_verified"), bool) else None
    display_name = claims.get("name") if isinstance(claims.get("name"), str) else None
    avatar_url = claims.get("picture") if isinstance(claims.get("picture"), str) else None
    if identity is None:
        # A concurrent first login can lose the unique (issuer, subject) race.
        # Keep the user and identity insert in a savepoint so the losing user
        # row is discarded, then resolve the winner by the durable identity.
        try:
            with session.begin_nested():
                user = User(
                    display_name=(display_name or email or "Google user")[:100],
                    email=email,
                    email_verified=email_verified,
                    avatar_url=avatar_url,
                    role=ClanRole.PEON.value,
                )
                session.add(user)
                session.flush()
                identity = ExternalIdentity(
                    user_id=user.id, issuer=settings.oidc_issuer, subject=subject, email_at_login=email
                )
                session.add(identity)
                session.flush()
        except IntegrityError as exc:
            identity = session.scalar(
                select(ExternalIdentity).where(
                    ExternalIdentity.issuer == settings.oidc_issuer,
                    ExternalIdentity.subject == subject,
                )
            )
            if identity is None:
                raise OidcError("Could not create Google identity") from exc
        assert identity is not None
    user = identity.user
    user.display_name = (display_name or email or user.display_name)[:100]
    user.email, user.email_verified, user.avatar_url, identity.email_at_login = (
        email,
        email_verified,
        avatar_url,
        email,
    )
    if (
        settings.overlord_email is not None
        and email_verified is True
        and _normalized_email(email) == settings.overlord_email
    ):
        user.role = ClanRole.OVERLORD.value
        user.is_admin = True
    if not user.is_active:
        session.rollback()
        raise OidcError("Account is disabled")
    now = utc_now()
    user.last_login_at = user.last_seen_at = now
    identity.last_login_at = now
    session.commit()
    session.refresh(user)
    return user, transaction.return_path, subject
