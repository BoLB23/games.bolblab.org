from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.development import DevelopmentAuthProvider
from app.models.common import utc_now
from app.models.game import Game
from app.models.game_session import GameSession
from app.models.leaderboard import LeaderboardDefinition, LeaderboardEntry
from app.models.player import PlayerProfile
from app.models.user import ClanRole, ExternalIdentity, User

MILTON_ESTATES_LEADERBOARDS = (
    (
        "milton-estates.mushroom-hunt.fastest-completion-ms",
        "Mushroom Hunt: fastest completion",
        "Fastest Mushroom Hunt completion, from acceptance through Andrew's final handoff.",
    ),
    (
        "milton-estates.chase-ryan.fastest-catch-ms",
        "Chase Ryan: fastest catch",
        "Fastest successful catch after Ryan begins the Reidenbaugh chase.",
    ),
    (
        "milton-estates.mickey-drag-race.fastest-win-ms",
        "Mickey Drag Race: fastest win",
        "Fastest winning Mickey drag-race run.",
    ),
    (
        "milton-estates.bad-trip.longest-survival-ms",
        "Bad Trip: longest survival",
        "Longest completed Don Rossi survival run (submitted as an inverse-encoded duration).",
    ),
)


def _upsert_development_user(
    session: Session,
    *,
    subject: str,
    display_name: str,
    email: str,
    role: ClanRole,
    last_seen_offset: int,
) -> User:
    identity = session.scalar(
        select(ExternalIdentity)
        .where(
            ExternalIdentity.issuer == DevelopmentAuthProvider.issuer,
            ExternalIdentity.subject == subject,
        )
    )
    timestamp = utc_now() - timedelta(seconds=last_seen_offset)
    if identity is not None:
        user = identity.user
        user.display_name = display_name
        user.email = email
        user.role = role.value
        user.is_admin = role == ClanRole.OVERLORD
        user.is_active = True
        user.last_seen_at = timestamp
        user.player_setup_completed_at = utc_now()
        return user
    user = User(
        display_name=display_name,
        email=email,
        is_admin=role == ClanRole.OVERLORD,
        role=role.value,
        is_active=True,
        last_seen_at=timestamp,
        player_setup_completed_at=utc_now(),
    )
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
    return user


def _upsert_player(session: Session, user: User, **values: str) -> None:
    profile = session.scalar(select(PlayerProfile).where(PlayerProfile.user_id == user.id))
    if profile is None:
        session.add(PlayerProfile(user_id=user.id, **values))
        return
    for key, value in values.items():
        setattr(profile, key, value)


def _upsert_game(
    session: Session,
    slug: str,
    *,
    preserve_existing_state: bool = False,
    **values: object,
) -> Game:
    game = session.scalar(select(Game).where(Game.slug == slug))
    if game is None:
        game = Game(slug=slug, **values)
        session.add(game)
        session.flush()
        return game
    if preserve_existing_state:
        return game
    for key, value in values.items():
        setattr(game, key, value)
    session.flush()
    return game


def _remove_development_users(session: Session) -> None:
    """Remove only seeded development identities from a production database."""
    users = session.scalars(
        select(User)
        .join(User.external_identities)
        .where(ExternalIdentity.issuer == DevelopmentAuthProvider.issuer)
    ).all()
    for user in users:
        session.delete(user)
    session.flush()


def _upsert_leaderboard(
    session: Session,
    *,
    game: Game,
    key: str,
    display_name: str,
    description: str,
    unit: str,
    sort_direction: str,
    aggregation: str,
) -> LeaderboardDefinition:
    board = session.scalar(
        select(LeaderboardDefinition).where(
            LeaderboardDefinition.game_id == game.id,
            LeaderboardDefinition.key == key,
        )
    )
    values = {
        "display_name": display_name,
        "description": description,
        "mission_key": None,
        "unit": unit,
        "sort_direction": sort_direction,
        "aggregation": aggregation,
        "is_active": True,
    }
    if board is None:
        board = LeaderboardDefinition(game_id=game.id, key=key, **values)
        session.add(board)
        session.flush()
        return board
    for field, value in values.items():
        setattr(board, field, value)
    session.flush()
    return board


def _upsert_milton_estates_leaderboards(session: Session, *, game: Game) -> None:
    for key, display_name, description in MILTON_ESTATES_LEADERBOARDS:
        _upsert_leaderboard(
            session,
            game=game,
            key=key,
            display_name=display_name,
            description=description,
            unit="milliseconds",
            sort_direction="asc",
            aggregation="min",
        )


def _upsert_session(
    session: Session,
    *,
    user: User,
    game: Game,
    started_offset: int,
    credited_seconds: float,
) -> None:
    existing = session.scalar(
        select(GameSession).where(GameSession.user_id == user.id, GameSession.game_id == game.id).limit(1)
    )
    if existing is not None:
        return
    started_at = utc_now() - timedelta(seconds=started_offset)
    session.add(
        GameSession(
            user_id=user.id,
            game_id=game.id,
            started_at=started_at,
            last_heartbeat_at=started_at + timedelta(seconds=credited_seconds),
            ended_at=started_at + timedelta(seconds=credited_seconds),
            credited_playtime_seconds=credited_seconds,
        )
    )


def _upsert_entry(
    session: Session,
    *,
    board: LeaderboardDefinition,
    user: User,
    value: float,
) -> None:
    entry = session.scalar(
        select(LeaderboardEntry).where(
            LeaderboardEntry.leaderboard_id == board.id,
            LeaderboardEntry.user_id == user.id,
        )
    )
    timestamp = utc_now() - timedelta(days=1)
    if entry is None:
        session.add(
            LeaderboardEntry(
                leaderboard_id=board.id,
                user_id=user.id,
                value=value,
                metadata_json={"seeded": True},
                achieved_at=timestamp,
                submitted_at=timestamp,
            )
        )
        return
    entry.value = value
    entry.metadata_json = {"seeded": True}
    entry.achieved_at = timestamp
    entry.submitted_at = timestamp


def _seed_catalog(
    session: Session,
    *,
    sample_game_origin: str,
    flappy_mike_origin: str,
    milton_estates_origin: str | None,
    milton_estates_launch_url: str | None,
    milton_estates_enabled: bool,
    milton_estates_cloud_saves_enabled: bool,
    preserve_existing_game_state: bool = False,
) -> tuple[Game, Game, Game]:
    sample_game = _upsert_game(
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
        supports_leaderboards=True,
        supports_multiplayer=False,
        is_featured=False,
        sort_order=10,
        preserve_existing_state=preserve_existing_game_state,
    )
    flappy_mike = _upsert_game(
        session,
        "flappy-mike",
        title="FlappyMike",
        short_description="Mike is stuck in Philadelphia—help him escape to his new home in Lancaster County.",
        description=(
            "Mike has been stuck in Philadelphia for far too long. Guide the bespectacled, mustachioed FlappyMike "
            "through the city, escape toward the outskirts, and help him reach his new home in Lancaster County—"
            "with your farthest distance saved on the crew leaderboard."
        ),
        cover_image_url="/assets/flappy-mike-cover.png",
        launch_url=flappy_mike_origin,
        status="playable",
        version="0.1.0",
        minimum_players=1,
        maximum_players=1,
        supports_cloud_saves=False,
        supports_leaderboards=True,
        supports_multiplayer=False,
        is_featured=False,
        sort_order=15,
        preserve_existing_state=preserve_existing_game_state,
    )
    milton_estates = _upsert_game(
        session,
        "milton-estates",
        title="Milton Estates",
        short_description="Welcome to Milton Estates! Meet your new friends and see what quests are in store.",
        description=(
            "Welcome to Milton Estates! Meet your new friends, settle into the neighborhood, and see what quests "
            "are in store."
        ),
        cover_image_url="/assets/milton-estates-cover.png",
        launch_url=(milton_estates_launch_url or milton_estates_origin or "") if milton_estates_enabled else "",
        status="playable" if milton_estates_enabled else "coming_soon",
        version="Platform integration" if milton_estates_enabled else "Not integrated",
        minimum_players=1,
        maximum_players=1,
        supports_cloud_saves=milton_estates_cloud_saves_enabled,
        supports_leaderboards=milton_estates_enabled,
        supports_multiplayer=False,
        is_featured=True,
        sort_order=20,
    )
    _upsert_leaderboard(
        session, game=sample_game, key="orb-touches", display_name="Orb touches",
        description="Highest orb-touch total in a single sample-game run.", unit="points",
        sort_direction="desc", aggregation="max",
    )
    _upsert_leaderboard(
        session, game=sample_game, key="orb-speedrun", display_name="Orb speedrun",
        description="Fastest recorded time to finish a sample-game run.", unit="seconds",
        sort_direction="asc", aggregation="min",
    )
    _upsert_leaderboard(
        session, game=flappy_mike, key="distance", display_name="Farthest flight",
        description="Greatest distance traveled in a single FlappyMike run.", unit="points",
        sort_direction="desc", aggregation="max",
    )
    if milton_estates_enabled:
        _upsert_milton_estates_leaderboards(session, game=milton_estates)
    return sample_game, flappy_mike, milton_estates


def seed_database(
    session: Session,
    sample_game_origin: str,
    *,
    flappy_mike_origin: str = "http://localhost:6185",
    milton_estates_origin: str | None = None,
    milton_estates_launch_url: str | None = None,
    milton_estates_enabled: bool = False,
    milton_estates_cloud_saves_enabled: bool = False,
    include_development_data: bool = True,
) -> None:
    """Upsert deterministic development data and optional game integrations.

    Milton Estates is deliberately opt-in.  Keeping both switches in the seed
    call means a production seed cannot expose a partially integrated game
    merely because an origin was configured for another purpose.
    """
    if milton_estates_enabled and not milton_estates_origin:
        raise ValueError("MILTON_ESTATES_ORIGIN is required when MILTON_ESTATES_ENABLED is true")
    if milton_estates_cloud_saves_enabled and not milton_estates_enabled:
        raise ValueError("MILTON_ESTATES_ENABLED must be true when cloud saves are enabled")
    if not include_development_data:
        _remove_development_users(session)
        _seed_catalog(
            session,
            sample_game_origin=sample_game_origin,
            flappy_mike_origin=flappy_mike_origin,
            milton_estates_origin=milton_estates_origin,
            milton_estates_launch_url=milton_estates_launch_url,
            milton_estates_enabled=milton_estates_enabled,
            milton_estates_cloud_saves_enabled=milton_estates_cloud_saves_enabled,
            preserve_existing_game_state=True,
        )
        session.commit()
        return

    users = {
        "admin": _upsert_development_user(
            session,
            subject="admin",
            display_name="Ada Admin",
            email="ada@example.test",
            role=ClanRole.OVERLORD,
            last_seen_offset=25,
        ),
        "player": _upsert_development_user(
            session,
            subject="player",
            display_name="Pat Player",
            email="pat@example.test",
            role=ClanRole.MEMBER,
            last_seen_offset=420,
        ),
        "peon": _upsert_development_user(
            session,
            subject="peon",
            display_name="Penny Peon",
            email="penny@example.test",
            role=ClanRole.PEON,
            last_seen_offset=55,
        ),
        "staff": _upsert_development_user(
            session,
            subject="staff",
            display_name="Sage Staff",
            email="sage@example.test",
            role=ClanRole.STAFF,
            last_seen_offset=1_200,
        ),
        "member": _upsert_development_user(
            session,
            subject="member",
            display_name="Mara Member",
            email="mara@example.test",
            role=ClanRole.MEMBER,
            last_seen_offset=172_800,
        ),
    }

    _upsert_player(
        session,
        users["admin"],
        nickname="Ada",
        haircut="fade",
        hair_color="#bd742c",
        tshirt_color="#ffbd3f",
        pants_color="#2f4c43",
        shoe_color="#f5efe4",
    )
    _upsert_player(
        session,
        users["player"],
        nickname="Pat",
        haircut="short",
        hair_color="#2b1d13",
        tshirt_color="#f05a28",
        pants_color="#1b2330",
        shoe_color="#ffbd3f",
    )
    _upsert_player(
        session,
        users["peon"],
        nickname="Penny",
        haircut="long",
        hair_color="#efe0b6",
        tshirt_color="#3c7468",
        pants_color="#6c4931",
        shoe_color="#27231f",
    )
    _upsert_player(
        session,
        users["staff"],
        nickname="Sage",
        haircut="mohawk",
        hair_color="#5a3521",
        tshirt_color="#ddd2bd",
        pants_color="#2f4c43",
        shoe_color="#f05a28",
    )
    _upsert_player(
        session,
        users["member"],
        nickname="Mara",
        haircut="fade",
        hair_color="#2b1d13",
        tshirt_color="#3c7468",
        pants_color="#1b2330",
        shoe_color="#f5efe4",
    )

    sample_game = _upsert_game(
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
        supports_leaderboards=True,
        supports_multiplayer=False,
        is_featured=False,
        sort_order=10,
    )
    flappy_mike = _upsert_game(
        session,
        "flappy-mike",
        title="FlappyMike",
        short_description="Mike is stuck in Philadelphia—help him escape to his new home in Lancaster County.",
        description=(
            "Mike has been stuck in Philadelphia for far too long. Guide the bespectacled, mustachioed FlappyMike "
            "through the city, escape toward the outskirts, and help him reach his new home in Lancaster County—"
            "with your farthest distance saved on the crew leaderboard."
        ),
        cover_image_url="/assets/flappy-mike-cover.png",
        launch_url=flappy_mike_origin,
        status="playable",
        version="0.1.0",
        minimum_players=1,
        maximum_players=1,
        supports_cloud_saves=False,
        supports_leaderboards=True,
        supports_multiplayer=False,
        is_featured=False,
        sort_order=15,
    )
    milton_estates = _upsert_game(
        session,
        "milton-estates",
        title="Milton Estates",
        short_description="Welcome to Milton Estates! Meet your new friends and see what quests are in store.",
        description=(
            "Welcome to Milton Estates! Meet your new friends, settle into the neighborhood, and see what quests "
            "are in store."
        ),
        cover_image_url="/assets/milton-estates-cover.png",
        launch_url=(milton_estates_launch_url or milton_estates_origin or "") if milton_estates_enabled else "",
        status="playable" if milton_estates_enabled else "coming_soon",
        version="Platform integration" if milton_estates_enabled else "Not integrated",
        minimum_players=1,
        maximum_players=1,
        supports_cloud_saves=milton_estates_cloud_saves_enabled,
        supports_leaderboards=milton_estates_enabled,
        supports_multiplayer=False,
        is_featured=True,
        sort_order=20,
    )

    orb_touches = _upsert_leaderboard(
        session,
        game=sample_game,
        key="orb-touches",
        display_name="Orb touches",
        description="Highest orb-touch total in a single sample-game run.",
        unit="points",
        sort_direction="desc",
        aggregation="max",
    )
    orb_speedrun = _upsert_leaderboard(
        session,
        game=sample_game,
        key="orb-speedrun",
        display_name="Orb speedrun",
        description="Fastest recorded time to finish a sample-game run.",
        unit="seconds",
        sort_direction="asc",
        aggregation="min",
    )
    flappy_distance = _upsert_leaderboard(
        session,
        game=flappy_mike,
        key="distance",
        display_name="Farthest flight",
        description="Greatest distance traveled in a single FlappyMike run.",
        unit="points",
        sort_direction="desc",
        aggregation="max",
    )
    if milton_estates_enabled:
        _upsert_milton_estates_leaderboards(session, game=milton_estates)

    for user, offset, playtime in (
        (users["admin"], 86_400 * 4, 4_620.0),
        (users["player"], 86_400 * 2, 2_460.0),
        (users["peon"], 86_400 * 8, 1_180.0),
        (users["staff"], 86_400 * 3, 7_240.0),
        (users["member"], 86_400 * 12, 780.0),
    ):
        _upsert_session(
            session,
            user=user,
            game=sample_game,
            started_offset=offset,
            credited_seconds=playtime,
        )
    _upsert_session(
        session,
        user=users["staff"],
        game=milton_estates,
        started_offset=86_400 * 20,
        credited_seconds=3_600.0,
    )

    for user, value in (
        (users["admin"], 48.0),
        (users["staff"], 39.0),
        (users["player"], 31.0),
        (users["peon"], 24.0),
        (users["member"], 18.0),
    ):
        _upsert_entry(session, board=orb_touches, user=user, value=value)
    for user, value in (
        (users["staff"], 9.8),
        (users["admin"], 12.4),
        (users["player"], 15.2),
    ):
        _upsert_entry(session, board=orb_speedrun, user=user, value=value)
    for user, value in (
        (users["staff"], 2_119.0),
        (users["admin"], 1_842.0),
        (users["player"], 1_482.0),
    ):
        _upsert_entry(session, board=flappy_distance, user=user, value=value)

    session.commit()
