from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.game import Game


def list_catalog_games(session: Session) -> list[Game]:
    statement = (
        select(Game)
        .where(Game.status != "hidden")
        .order_by(Game.is_featured.desc(), Game.sort_order.asc(), Game.title.asc())
    )
    return list(session.scalars(statement))


def get_visible_game(session: Session, slug: str) -> Game | None:
    return session.scalar(select(Game).where(Game.slug == slug, Game.status != "hidden"))
