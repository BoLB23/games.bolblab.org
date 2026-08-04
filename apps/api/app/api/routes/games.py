from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db_session
from app.models.game import Game
from app.schemas.game import GameResponse
from app.services.catalog import get_game, list_games

router = APIRouter(prefix="/games", tags=["games"])


@router.get("", response_model=list[GameResponse])
def games(
    _user: object = Depends(get_current_user), session: Session = Depends(get_db_session)
) -> list[Game]:
    return list_games(session)


@router.get("/{game_slug}", response_model=GameResponse)
def game_detail(
    game_slug: str,
    _user: object = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> Game:
    game = get_game(session, game_slug)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return game
