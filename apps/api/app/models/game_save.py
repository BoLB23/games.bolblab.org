from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.db.base import Base
from app.models.common import utc_now

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.user import User


class PlayerGameProfile(Base):
    __tablename__ = "player_game_profiles"
    __table_args__ = (UniqueConstraint("user_id", "game_id", name="uq_player_game_profiles_user_game"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    user: Mapped[User] = relationship(back_populates="game_profiles")
    game: Mapped[Game] = relationship(back_populates="player_game_profiles")
    saves: Mapped[list[GameSave]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class GameSave(Base):
    __tablename__ = "game_saves"
    __table_args__ = (
        UniqueConstraint("profile_id", "slot_key", name="uq_game_saves_profile_slot"),
        CheckConstraint("revision >= 1", name="ck_game_saves_revision_positive"),
        CheckConstraint("schema_version >= 1", name="ck_game_saves_schema_version_positive"),
        CheckConstraint("byte_size >= 0", name="ck_game_saves_byte_size_nonnegative"),
        Index("ix_game_saves_profile_updated", "profile_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("player_game_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slot_key: Mapped[str] = mapped_column(String(100), nullable=False)
    game_version: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    data_json: Mapped[Any] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": revision}
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    profile: Mapped[PlayerGameProfile] = relationship(back_populates="saves")
