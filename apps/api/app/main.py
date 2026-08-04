from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import auth, games, system
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Game Platform API", version="0.1.0", docs_url="/docs" if settings.app_env == "development" else None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.catalog_origin, settings.sample_game_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"error": "validation_error", "detail": exc.errors()})

    api = FastAPI()
    api.include_router(system.router)
    api.include_router(auth.router)
    api.include_router(games.router)
    app.mount("/api/v1", api)
    return app


app = create_app()
