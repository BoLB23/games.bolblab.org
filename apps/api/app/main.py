from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import (
    auth,
    clan,
    game_sessions,
    games,
    leaderboards,
    multiplayer,
    player,
    presence,
    saves,
    system,
)
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Game Platform API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env == "development" else None,
        redoc_url="/redoc" if settings.app_env == "development" else None,
        openapi_url="/openapi.json" if settings.app_env == "development" else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic may include a ValueError instance in ``ctx`` for validator
        # failures; encode it explicitly so malformed requests always get a
        # JSON 422 instead of an internal serialization error.
        detail = jsonable_encoder(exc.errors(), custom_encoder={ValueError: str})
        return JSONResponse(status_code=422, content={"error": "validation_error", "detail": detail})

    # The mounted application has its own OpenAPI/docs defaults. Explicitly
    # disable them outside development so /api/v1/docs cannot bypass the
    # parent application's production setting.
    api = FastAPI(
        docs_url="/docs" if settings.app_env == "development" else None,
        redoc_url="/redoc" if settings.app_env == "development" else None,
        openapi_url="/openapi.json" if settings.app_env == "development" else None,
    )

    @api.exception_handler(RequestValidationError)
    async def mounted_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        detail = jsonable_encoder(exc.errors(), custom_encoder={ValueError: str})
        return JSONResponse(status_code=422, content={"error": "validation_error", "detail": detail})
    api.include_router(system.router)
    api.include_router(auth.router)
    api.include_router(player.router)
    api.include_router(clan.router)
    api.include_router(presence.router)
    api.include_router(game_sessions.router)
    api.include_router(leaderboards.router)
    api.include_router(multiplayer.router)
    api.include_router(saves.router)
    api.include_router(games.router)
    app.mount("/api/v1", api)
    return app


app = create_app()
