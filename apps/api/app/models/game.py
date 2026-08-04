from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.base import Base
from app.models.common import utc_now


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint("status IN ('development', 'playable', 'coming_soon', 'hidden')", name="ck_games_status"),
        CheckConstraint("minimum_players >= 1", name="ck_games_minimum_players"),
        CheckConstraint("maximum_players >= minimum_players", name="ck_games_player_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    short_description: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(String(5000), nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    launch_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    minimum_players: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    maximum_players: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    supports_cloud_saves: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supports_leaderboards: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supports_multiplayer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
