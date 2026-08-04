from __future__ import annotations

import uuid

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import Settings


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="game-platform-session-v1")


def create_session_value(settings: Settings, user_id: uuid.UUID) -> str:
    return _serializer(settings).dumps(str(user_id))


def read_session_value(settings: Settings, value: str) -> uuid.UUID | None:
    try:
        raw_id = _serializer(settings).loads(value, max_age=60 * 60 * 24 * 7)
        return uuid.UUID(raw_id)
    except (BadSignature, SignatureExpired, ValueError):
        return None
