from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.development import DevelopmentAuthProvider
from app.models.game import Game
from app.models.user import ExternalIdentity, User


def _upsert_development_user(
    session: Session, *, subject: str, display_name: str, email: str, is_admin: bool
) -> None:
    identity = session.scalar(
        select(ExternalIdentity).where(
            ExternalIdentity.issuer == DevelopmentAuthProvider.issuer, ExternalIdentity.subject == subject
        )
    )
    if identity:
        return
    user = User(display_name=display_name, email=email, is_admin=is_admin, is_active=True)
    session.add(user)
    session.flush()
    session.add(
        ExternalIdentity(
            user_id=user.id,
            issuer=DevelopmentAuthProvider.issuer,
            subject=subject,
            email_at_login=email,
        )
    )


def _upsert_game(session: Session, slug: str, **values: object) -> None:
    game = session.scalar(select(Game).where(Game.slug == slug))
    if game is None:
        session.add(Game(slug=slug, **values))
        return
    for key, value in values.items():
        setattr(game, key, value)


def seed_database(session: Session, sample_game_origin: str) -> None:
    _upsert_development_user(
        session, subject="admin", display_name="Ada Admin", email="ada@example.test", is_admin=True
    )
    _upsert_development_user(
        session, subject="player", display_name="Pat Player", email="pat@example.test", is_admin=False
    )
    _upsert_game(
        session,
        "sample-game",
        title="Sample Game",
        short_description="A tiny independent game that proves the platform connection.",
        description=(
            "Click the glowing orb to increase an in-memory score. This deliberately small game demonstrates "
            "that browser games can stay independent while sharing the platform client SDK."
        ),
        cover_image_url=None,
        launch_url=sample_game_origin,
        status="playable",
        version="0.1.0",
        minimum_players=1,
        maximum_players=1,
        supports_cloud_saves=False,
        supports_leaderboards=False,
        supports_multiplayer=False,
        is_featured=True,
        sort_order=10,
    )
    _upsert_game(
        session,
        "milton-estates",
        title="Milton Estates",
        short_description="A future addition to the collection.",
        description=(
            "Milton Estates is planned for a future integration. Its existing project and local saves remain "
            "untouched while this catalog foundation is established."
        ),
        cover_image_url=None,
        launch_url="",
        status="coming_soon",
        version="Not integrated",
        minimum_players=1,
        maximum_players=1,
        supports_cloud_saves=False,
        supports_leaderboards=False,
        supports_multiplayer=False,
        is_featured=False,
        sort_order=20,
    )
    session.commit()
