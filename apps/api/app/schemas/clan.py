from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.user import ClanRole
from app.schemas.player import PlayerAppearanceResponse


class ClanGamePlaytime(BaseModel):
    game_slug: str
    game_title: str
    playtime_seconds: float


class MostRecentGame(BaseModel):
    game_slug: str
    game_title: str
    played_at: datetime


class ClanMemberResponse(BaseModel):
    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None
    nickname: str
    appearance: PlayerAppearanceResponse
    role: ClanRole
    is_online: bool
    last_seen_at: datetime | None
    total_playtime_seconds: float
    games: list[ClanGamePlaytime]
    most_recent_game: MostRecentGame | None


class ClanRoleUpdateRequest(BaseModel):
    role: ClanRole
