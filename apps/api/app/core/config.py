from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = API_DIR.parents[1] if API_DIR.parent.name == "apps" else API_DIR


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")
    app_env: Literal["development", "test", "production"] = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8001
    database_url: str = "sqlite:///../../data/game-platform.db"
    session_secret: str = Field(min_length=16)
    session_cookie_name: str = "game_platform_session"
    session_cookie_secure: bool = False
    catalog_origin: str = "http://localhost:6183"
    sample_game_origin: str = "http://localhost:6184"
    presence_window_seconds: int = Field(default=120, ge=30, le=3600)
    game_session_max_gap_seconds: int = Field(default=120, ge=30, le=3600)
    leaderboard_max_value: float = Field(default=1_000_000_000, gt=0)
    leaderboard_max_metadata_bytes: int = Field(default=2048, ge=256, le=16_384)

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith(("sqlite://", "postgresql://", "postgresql+")):
            raise ValueError("DATABASE_URL must use SQLite or PostgreSQL")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # populated from environment/.env
