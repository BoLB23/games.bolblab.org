from typing import Literal

from pydantic import BaseModel, Field

RoomPhase = Literal["lobby", "playing", "finished"]


class MultiplayerPlayerResponse(BaseModel):
    user_id: str
    display_name: str
    connected: bool
    strokes: int
    holed: bool


class MultiplayerRoomResponse(BaseModel):
    code: str
    version: int
    phase: RoomPhase
    host_user_id: str
    active_player_id: str | None
    hole_index: int
    hole_count: int = 3
    players: list[MultiplayerPlayerResponse] = Field(default_factory=list)
