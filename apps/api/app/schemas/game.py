import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

GameStatus = Literal["development", "playable", "coming_soon", "hidden"]


class GameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str
    short_description: str
    description: str
    cover_image_url: str | None
    launch_url: str
    status: GameStatus
    version: str
    minimum_players: int
    maximum_players: int
    supports_cloud_saves: bool
    supports_leaderboards: bool
    supports_multiplayer: bool
    is_featured: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
