from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import ClanRole
from app.schemas.player import PlayerAppearanceResponse

SortDirection = Literal["asc", "desc"]
Aggregation = Literal["max", "min", "latest", "sum"]


class LeaderboardDefinitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    game_id: uuid.UUID
    game_slug: str
    game_title: str
    key: str
    display_name: str
    description: str
    mission_key: str | None
    unit: str
    sort_direction: SortDirection
    aggregation: Aggregation
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RankedLeaderboardEntryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    rank: int
    nickname: str
    display_name: str
    role: ClanRole
    appearance: PlayerAppearanceResponse
    value: float
    metadata: dict[str, Any] | None
    achieved_at: datetime
    submitted_at: datetime


class LeaderboardResponse(BaseModel):
    definition: LeaderboardDefinitionResponse
    entries: list[RankedLeaderboardEntryResponse]
    current_user_entry: RankedLeaderboardEntryResponse | None
    current_user_rank: int | None


class LeaderboardEntrySubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: float = Field(...)
    metadata: dict[str, Any] | None = None

    @field_validator("value")
    @classmethod
    def validate_finite_value(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Leaderboard value must be finite")
        return value


class LeaderboardSubmissionResponse(BaseModel):
    entry: RankedLeaderboardEntryResponse
    rank: int
