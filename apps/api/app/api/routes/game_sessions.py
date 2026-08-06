from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.game_session import GameSessionResponse
from app.services.game_sessions import (
    GameSessionError,
    end_game_session,
    get_owned_session,
    heartbeat_game_session,
    session_response,
    start_game_session,
)

router = APIRouter(tags=["game sessions"])


def _handle_error(error: GameSessionError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=str(error))


@router.post("/games/{game_slug}/sessions", response_model=GameSessionResponse)
def start_session(
    game_slug: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        game_session = start_game_session(session, user=user, game_slug=game_slug, settings=settings)
    except GameSessionError as error:
        raise _handle_error(error) from error
    return session_response(game_session)


@router.post("/game-sessions/{session_id}/heartbeat", response_model=GameSessionResponse)
def heartbeat_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        game_session = get_owned_session(session, session_id=session_id, user=user)
        game_session = heartbeat_game_session(session, game_session=game_session, settings=settings)
    except GameSessionError as error:
        raise _handle_error(error) from error
    return session_response(game_session)


@router.post("/game-sessions/{session_id}/end", response_model=GameSessionResponse)
def end_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        game_session = get_owned_session(session, session_id=session_id, user=user)
        game_session = end_game_session(session, game_session=game_session, settings=settings)
    except GameSessionError as error:
        raise _handle_error(error) from error
    return session_response(game_session)
