from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.db.base import Base
from app.models.common import utc_now

if TYPE_CHECKING:
    from app.models.user import User


class PlayerProfile(Base):
    __tablename__ = "player_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_player_profiles_user_id"),
        CheckConstraint(
            "length(nickname) >= 1 AND length(nickname) < 10",
            name="ck_player_profiles_nickname_length",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nickname: Mapped[str] = mapped_column(String(9), nullable=False)
    haircut: Mapped[str] = mapped_column(String(32), nullable=False)
    hair_color: Mapped[str] = mapped_column(String(16), nullable=False)
    tshirt_color: Mapped[str] = mapped_column(String(16), nullable=False)
    pants_color: Mapped[str] = mapped_column(String(16), nullable=False)
    shoe_color: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    user: Mapped[User] = relationship(back_populates="player_profile")
