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
    api_port: int = 8000
    database_url: str = "sqlite:///../../data/game-platform.db"
    session_secret: str = Field(min_length=16)
    session_cookie_name: str = "game_platform_session"
    session_cookie_secure: bool = False
    catalog_origin: str = "http://localhost:5173"
    sample_game_origin: str = "http://localhost:5174"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith(("sqlite://", "postgresql://", "postgresql+")):
            raise ValueError("DATABASE_URL must use SQLite or PostgreSQL")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # populated from environment/.env
