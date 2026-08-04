from sqlalchemy.orm import Session

from app.models.game import Game
from app.repositories.games import get_visible_game, list_catalog_games


def list_games(session: Session) -> list[Game]:
    return list_catalog_games(session)


def get_game(session: Session, slug: str) -> Game | None:
    return get_visible_game(session, slug)
