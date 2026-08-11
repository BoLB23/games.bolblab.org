from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.models.game import Game
from app.models.game_session import GameSession
from app.models.user import ClanRole, User
from app.services.game_sessions import finalize_abandoned_sessions
from app.services.player import default_appearance
from app.services.presence import is_online


def _appearance_dict(user: User) -> dict[str, str]:
    profile = user.player_profile
    if profile is not None:
        return {
            "nickname": profile.nickname,
            "haircut": profile.haircut,
            "hair_color": profile.hair_color,
            "tshirt_color": profile.tshirt_color,
            "pants_color": profile.pants_color,
            "shoe_color": profile.shoe_color,
        }
    return default_appearance(user).__dict__


def _member_response(
    user: User,
    game_sessions: list[GameSession],
    *,
    settings: Settings,
) -> dict[str, object]:
    appearance = _appearance_dict(user)
    by_game: dict[str, dict[str, object]] = {}
    most_recent: GameSession | None = None
    total = 0.0
    for game_session in game_sessions:
        total += game_session.credited_playtime_seconds
        game_data = by_game.setdefault(
            game_session.game.slug,
            {"game_slug": game_session.game.slug, "game_title": game_session.game.title, "playtime_seconds": 0.0},
        )
        current_playtime = game_data["playtime_seconds"]
        if not isinstance(current_playtime, (int, float)):
            current_playtime = 0.0
        game_data["playtime_seconds"] = current_playtime + game_session.credited_playtime_seconds
        if most_recent is None or game_session.started_at > most_recent.started_at:
            most_recent = game_session
    games = sorted(by_game.values(), key=lambda value: str(value["game_title"]))
    return {
        "user_id": user.id,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "nickname": appearance["nickname"],
        "appearance": appearance,
        "role": user.role,
        "is_online": is_online(user, settings=settings),
        "last_seen_at": user.last_seen_at,
        "total_playtime_seconds": total,
        "games": games,
        "most_recent_game": (
            {
                "game_slug": most_recent.game.slug,
                "game_title": most_recent.game.title,
                "played_at": most_recent.started_at,
            }
            if most_recent is not None
            else None
        ),
    }


def list_clan_members(session: Session, *, settings: Settings) -> list[dict[str, object]]:
    finalize_abandoned_sessions(session, settings=settings)
    users = list(
        session.scalars(
            select(User)
            .where(User.is_active.is_(True))
            .options(selectinload(User.player_profile))
            .order_by(User.display_name.asc())
        )
    )
    if not users:
        return []
    user_ids = [user.id for user in users]
    game_sessions = list(
        session.scalars(
            select(GameSession)
            .join(Game)
            .where(GameSession.user_id.in_(user_ids))
            .options(selectinload(GameSession.game))
            .order_by(GameSession.started_at.desc())
        )
    )
    grouped: dict[uuid.UUID, list[GameSession]] = defaultdict(list)
    for game_session in game_sessions:
        grouped[game_session.user_id].append(game_session)
    members = [_member_response(user, grouped[user.id], settings=settings) for user in users]
    # Presence is the primary organizing signal on the clan board. Keep the
    # alphabetical order as a stable, predictable tie-breaker within each group.
    return sorted(
        members,
        key=lambda member: (
            not bool(member["is_online"]),
            str(member["display_name"]).casefold(),
        ),
    )


def get_clan_member(session: Session, *, user_id: uuid.UUID, settings: Settings) -> dict[str, object] | None:
    members = list_clan_members(session, settings=settings)
    return next((member for member in members if member["user_id"] == user_id), None)


def update_role(session: Session, *, target: User, role: ClanRole) -> User:
    target.role = role.value
    target.is_admin = role == ClanRole.OVERLORD
    session.commit()
    session.refresh(target)
    return target
