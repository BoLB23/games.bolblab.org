from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class GameSaveMetadataResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slot_key: str
    game_version: str
    schema_version: int
    revision: int
    byte_size: int
    created_at: datetime
    updated_at: datetime


class GameSaveResponse(GameSaveMetadataResponse):
    data: Any


class GameSavePutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: JsonValue
    game_version: str = Field(min_length=1, max_length=64)
    schema_version: int = Field(ge=1, le=1_000_000)
    expected_revision: int | None = Field(default=None, ge=1)
