from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy.orm import Session

from app.models.user import User


class AuthProvider(Protocol):
    def resolve_user(self, session: Session, subject: uuid.UUID) -> User | None: ...
