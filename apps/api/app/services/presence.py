from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.common import utc_now
from app.models.user import User


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def is_online(user: User, *, settings: Settings, now: datetime | None = None) -> bool:
    if user.last_seen_at is None:
        return False
    current = as_utc(now or utc_now())
    return as_utc(user.last_seen_at) >= current - timedelta(seconds=settings.presence_window_seconds)


def record_heartbeat(session: Session, user: User) -> datetime:
    timestamp = utc_now()
    user.last_seen_at = timestamp
    session.commit()
    session.refresh(user)
    return timestamp
