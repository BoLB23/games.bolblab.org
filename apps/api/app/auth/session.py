from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.auth import UserSession
from app.models.common import utc_now


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_session(session: Session, settings: Settings, user_id: uuid.UUID) -> str:
    token = secrets.token_urlsafe(32)
    now = utc_now()
    session.add(
        UserSession(
            token_digest=_digest(token), user_id=user_id, expires_at=now + timedelta(seconds=settings.session_ttl_seconds)
        )
    )
    return token


def get_session(session: Session, token: str | None) -> UserSession | None:
    if not token:
        return None
    current = session.scalar(select(UserSession).where(UserSession.token_digest == _digest(token)))
    if current is None or current.revoked_at is not None:
        return None
    expires_at = current.expires_at if current.expires_at.tzinfo else current.expires_at.replace(tzinfo=UTC)
    if expires_at <= utc_now():
        return None
    return current


def revoke_session(session: Session, token: str | None) -> None:
    current = get_session(session, token)
    if current is not None:
        current.revoked_at = utc_now()
