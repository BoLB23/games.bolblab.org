from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.game import Game
from app.models.user import User
from app.schemas.leaderboard import (
    LeaderboardDefinitionResponse,
    LeaderboardEntrySubmitRequest,
    LeaderboardResponse,
    LeaderboardSubmissionResponse,
)
from app.services.leaderboards import (
    LeaderboardError,
    get_leaderboard_definition,
    get_leaderboard_response,
    list_leaderboards,
    submit_leaderboard_entry,
)

router = APIRouter(tags=["leaderboards"])


def _handle_error(error: LeaderboardError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=str(error))


@router.get("/leaderboards", response_model=list[LeaderboardDefinitionResponse])
def leaderboards(
    _user: User = Depends(get_current_user), session: Session = Depends(get_db_session)
) -> list[dict[str, object]]:
    return list_leaderboards(session)


@router.get("/games/{game_slug}/leaderboards", response_model=list[LeaderboardDefinitionResponse])
def game_leaderboards(
    game_slug: str,
    _user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> list[dict[str, object]]:
    game = session.scalar(select(Game).where(Game.slug == game_slug, Game.status != "hidden"))
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return list_leaderboards(session, game_slug=game_slug)


@router.get("/leaderboards/{leaderboard_key}", response_model=LeaderboardResponse)
def leaderboard_detail(
    leaderboard_key: str,
    game_slug: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> dict[str, object]:
    try:
        board = get_leaderboard_definition(session, leaderboard_key=leaderboard_key, game_slug=game_slug)
    except LeaderboardError as error:
        raise _handle_error(error) from error
    return get_leaderboard_response(session, board=board, current_user=user, limit=limit)


@router.post(
    "/games/{game_slug}/leaderboards/{leaderboard_key}/entries",
    response_model=LeaderboardSubmissionResponse,
)
def submit_entry(
    game_slug: str,
    leaderboard_key: str,
    payload: LeaderboardEntrySubmitRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        return submit_leaderboard_entry(
            session,
            game_slug=game_slug,
            leaderboard_key=leaderboard_key,
            user=user,
            value=payload.value,
            metadata=payload.metadata,
            idempotency_key=payload.idempotency_key,
            settings=settings,
        )
    except LeaderboardError as error:
        raise _handle_error(error) from error
