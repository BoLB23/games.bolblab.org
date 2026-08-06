from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class GameSessionResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    user_id: uuid.UUID
    game_id: uuid.UUID
    game_slug: str
    started_at: datetime
    last_heartbeat_at: datetime
    ended_at: datetime | None
    credited_playtime_seconds: float
