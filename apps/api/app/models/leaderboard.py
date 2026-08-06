from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
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


class LeaderboardDefinition(Base):
    __tablename__ = "leaderboard_definitions"
    __table_args__ = (
        UniqueConstraint("game_id", "key", name="uq_leaderboard_definitions_game_key"),
        CheckConstraint(
            "sort_direction IN ('asc', 'desc', 'ascending', 'descending')",
            name="ck_leaderboard_definitions_sort_direction",
        ),
        CheckConstraint(
            "aggregation IN ('max', 'min', 'latest', 'sum', 'best_maximum', 'best_minimum', 'cumulative_sum')",
            name="ck_leaderboard_definitions_aggregation",
        ),
        Index("ix_leaderboard_definitions_game_key", "game_id", "key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    mission_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_direction: Mapped[str] = mapped_column(String(12), nullable=False)
    aggregation: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    game: Mapped[Game] = relationship(back_populates="leaderboards")
    entries: Mapped[list[LeaderboardEntry]] = relationship(
        back_populates="definition", cascade="all, delete-orphan"
    )


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard_entries"
    __table_args__ = (
        UniqueConstraint("leaderboard_id", "user_id", name="uq_leaderboard_entries_definition_user"),
        Index("ix_leaderboard_entries_definition_value", "leaderboard_id", "value"),
        Index("ix_leaderboard_entries_definition_user", "leaderboard_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    leaderboard_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("leaderboard_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    achieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    definition: Mapped[LeaderboardDefinition] = relationship(back_populates="entries")
    user: Mapped[User] = relationship(back_populates="leaderboard_entries")
