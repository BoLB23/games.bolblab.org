import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    display_name: str
    email: str | None
    avatar_url: str | None
    is_admin: bool
    last_login_at: datetime | None


class DevelopmentUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    display_name: str
    email: str | None
    is_admin: bool


class DevLoginRequest(BaseModel):
    user_id: uuid.UUID
