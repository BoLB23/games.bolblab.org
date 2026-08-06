from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.player import ALLOWED_HAIRCUTS, PALETTES, normalize_nickname


class PlayerAppearanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    nickname: str
    haircut: str
    hair_color: str
    tshirt_color: str
    pants_color: str
    shoe_color: str


class PlayerResponse(PlayerAppearanceResponse):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PlayerUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nickname: str | None = None
    haircut: str | None = None
    hair_color: str | None = None
    tshirt_color: str | None = None
    pants_color: str | None = None
    shoe_color: str | None = None

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_nickname(value)

    @field_validator("haircut")
    @classmethod
    def validate_haircut(cls, value: str | None) -> str | None:
        if value is not None and value not in ALLOWED_HAIRCUTS:
            raise ValueError("Invalid haircut option")
        return value

    @field_validator("hair_color", "tshirt_color", "pants_color", "shoe_color")
    @classmethod
    def validate_color(cls, value: str | None, info: object) -> str | None:
        if value is None:
            return None
        field_name = getattr(info, "field_name", "")
        if field_name not in PALETTES or value not in PALETTES[field_name]:
            raise ValueError(f"Invalid {field_name.replace('_', ' ')} option")
        return value
