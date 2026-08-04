from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.auth.provider import AuthProvider
from app.models.user import User
from app.repositories.users import get_user


class DevelopmentAuthProvider(AuthProvider):
    issuer = "urn:game-platform:development"

    def resolve_user(self, session: Session, subject: uuid.UUID) -> User | None:
        return get_user(session, subject)
