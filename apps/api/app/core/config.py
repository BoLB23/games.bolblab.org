from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = API_DIR.parents[1] if API_DIR.parent.name == "apps" else API_DIR


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")
    app_env: Literal["development", "test", "production"] = "development"
    auth_mode: Literal["development", "oidc"] = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8001
    database_url: str = "sqlite:///../../data/game-platform.db"
    session_secret: str = Field(min_length=16)
    session_cookie_name: str = "game_platform_session"
    session_cookie_secure: bool = False
    session_ttl_seconds: int = Field(default=28_800, ge=300, le=604_800)
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None
    oidc_callback_url: str | None = None
    oidc_transaction_secret: str | None = None
    oidc_transaction_ttl_seconds: int = Field(default=600, ge=60, le=3600)
    # A single, optional bootstrap administrator.  This is deliberately an
    # email rather than an allowlist: Google identities are always linked by
    # issuer + subject, and this value only controls the initial clan role.
    overlord_email: str | None = None
    catalog_origin: str = "http://localhost:6183"
    sample_game_origin: str = "http://localhost:6184"
    sample_game_launch_url: str | None = None
    flappy_mike_origin: str = "http://localhost:6185"
    flappy_mike_launch_url: str | None = None
    game_cors_allowed_origins: str = ""
    milton_estates_origin: str | None = None
    milton_estates_enabled: bool = False
    milton_estates_cloud_saves_enabled: bool = False
    presence_window_seconds: int = Field(default=120, ge=30, le=3600)
    game_session_max_gap_seconds: int = Field(default=120, ge=30, le=3600)
    leaderboard_max_value: float = Field(default=1_000_000_000, gt=0)
    leaderboard_max_metadata_bytes: int = Field(default=2048, ge=256, le=16_384)
    cloud_save_max_bytes: int = Field(default=524_288, ge=1_024, le=8_388_608)
    cloud_save_total_max_bytes: int = Field(default=2_097_152, ge=1_024, le=67_108_864)

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith(("sqlite://", "postgresql://", "postgresql+")):
            raise ValueError("DATABASE_URL must use SQLite or PostgreSQL")
        return value

    @field_validator("overlord_email")
    @classmethod
    def normalize_overlord_email(cls, value: str | None) -> str | None:
        """Return a comparison-safe email or disable the bootstrap rule.

        Google treats account email addresses case-insensitively.  We retain
        the provider's original claim in the database, but casefold the
        configured value and the claim only for this equality check.
        """
        if value is None:
            return None
        normalized = value.strip().casefold()
        if not normalized:
            return None
        if (
            len(normalized) > 320
            or normalized.count("@") != 1
            or normalized.startswith("@")
            or normalized.endswith("@")
            or any(character.isspace() or ord(character) < 32 for character in normalized)
        ):
            raise ValueError("OVERLORD_EMAIL must be a single email address")
        return normalized

    @field_validator("catalog_origin", "sample_game_origin", "flappy_mike_origin")
    @classmethod
    def validate_required_cors_origin(cls, value: str) -> str:
        return cls._validate_origin(value)

    @field_validator("game_cors_allowed_origins")
    @classmethod
    def validate_extra_cors_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        return ",".join(cls._validate_origin(origin) for origin in origins)

    @field_validator("milton_estates_origin")
    @classmethod
    def validate_milton_estates_origin(cls, value: str | None) -> str | None:
        return cls._validate_origin(value) if value else None

    @field_validator("sample_game_launch_url", "flappy_mike_launch_url")
    @classmethod
    def validate_game_launch_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlparse(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Game launch URLs must be absolute http(s) URLs without credentials, queries, or fragments")
        return value

    @model_validator(mode="after")
    def validate_runtime_configuration(self) -> Settings:
        if self.milton_estates_enabled and not self.milton_estates_origin:
            raise ValueError("MILTON_ESTATES_ORIGIN is required when MILTON_ESTATES_ENABLED is true")
        if self.milton_estates_cloud_saves_enabled and not self.milton_estates_enabled:
            raise ValueError("MILTON_ESTATES_ENABLED must be true when cloud saves are enabled")
        if self.auth_mode == "oidc":
            required = {
                "OIDC_ISSUER": self.oidc_issuer,
                "OIDC_CLIENT_ID": self.oidc_client_id,
                "OIDC_CLIENT_SECRET": self.oidc_client_secret,
                "OIDC_CALLBACK_URL": self.oidc_callback_url,
                "OIDC_TRANSACTION_SECRET": self.oidc_transaction_secret,
            }
            missing = [name for name, value in required.items() if not value]
            if missing:
                raise ValueError(f"OIDC mode requires: {', '.join(missing)}")
            assert self.oidc_issuer is not None and self.oidc_callback_url is not None
            self._validate_url(self.oidc_issuer, "OIDC_ISSUER")
            self._validate_url(self.oidc_callback_url, "OIDC_CALLBACK_URL")
            if self.app_env == "production":
                if not (self.oidc_issuer.startswith("https://") and self.oidc_callback_url.startswith("https://")):
                    raise ValueError("OIDC issuer and callback must use HTTPS in production")
                if not self.catalog_origin.startswith("https://"):
                    raise ValueError("CATALOG_ORIGIN must use HTTPS in production OIDC mode")
                if not self.session_cookie_secure:
                    raise ValueError("SESSION_COOKIE_SECURE must be true in production OIDC mode")
                if not self.session_cookie_name.startswith("__Host-"):
                    raise ValueError("SESSION_COOKIE_NAME must start with __Host- in production OIDC mode")
        return self

    @staticmethod
    def _validate_origin(value: str) -> str:
        parsed = urlparse(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("CORS origins must be absolute http(s) origins without paths, credentials, queries, or fragments")
        return f"{parsed.scheme}://{parsed.netloc}"

    @staticmethod
    def _validate_url(value: str, variable_name: str) -> None:
        parsed = urlparse(value)
        if not parsed.scheme or not parsed.netloc or parsed.fragment or parsed.username or parsed.password:
            raise ValueError(f"{variable_name} must be an absolute URL without credentials or fragments")

    @property
    def cors_allowed_origins(self) -> list[str]:
        """Exact browser origins permitted to make credentialed API requests."""
        origins = [self.catalog_origin, self.sample_game_origin, self.flappy_mike_origin]
        origins.extend(origin for origin in self.game_cors_allowed_origins.split(",") if origin)
        if self.app_env == "development":
            origins.extend(self._loopback_alias(origin) for origin in list(origins))
        return list(dict.fromkeys(origins))

    @staticmethod
    def _loopback_alias(origin: str) -> str:
        """Accept either common loopback hostname during local development."""
        parsed = urlparse(origin)
        if parsed.hostname not in {"localhost", "127.0.0.1"}:
            return origin
        host = "127.0.0.1" if parsed.hostname == "localhost" else "localhost"
        port = f":{parsed.port}" if parsed.port is not None else ""
        return f"{parsed.scheme}://{host}{port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # populated from environment/.env
