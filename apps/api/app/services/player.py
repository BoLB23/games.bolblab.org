from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.common import utc_now
from app.models.player import PlayerProfile
from app.models.user import User

ALLOWED_HAIRCUTS = ("short", "fade", "long", "mohawk")
PALETTES: dict[str, tuple[str, ...]] = {
    "hair_color": ("#2b1d13", "#5a3521", "#bd742c", "#efe0b6"),
    "tshirt_color": ("#f05a28", "#ffbd3f", "#3c7468", "#ddd2bd"),
    "pants_color": ("#1b2330", "#2f4c43", "#6c4931", "#3a3430"),
    "shoe_color": ("#f5efe4", "#f05a28", "#27231f", "#ffbd3f"),
}
DEFAULT_PLAYER_VALUES = {
    "haircut": "short",
    "hair_color": "#2b1d13",
    "tshirt_color": "#f05a28",
    "pants_color": "#1b2330",
    "shoe_color": "#f5efe4",
}


@dataclass(frozen=True)
class PlayerAppearance:
    nickname: str
    haircut: str
    hair_color: str
    tshirt_color: str
    pants_color: str
    shoe_color: str


def normalize_nickname(value: str, *, fallback: str | None = None) -> str:
    nickname = " ".join(value.strip().split())
    if not nickname:
        if fallback is None:
            raise ValueError("Nickname is required")
        nickname = fallback
    if len(nickname) >= 10:
        raise ValueError("Nickname must contain fewer than 10 characters")
    return nickname


def validate_player_option(field: str, value: str) -> str:
    allowed: tuple[str, ...] = ALLOWED_HAIRCUTS if field == "haircut" else PALETTES[field]
    if value not in allowed:
        raise ValueError(f"Invalid {field.replace('_', ' ')} option")
    return value


def default_nickname(user: User) -> str:
    first_word = next(iter(user.display_name.strip().split()), "Player")
    return normalize_nickname(first_word[:9] or "Player")


def default_appearance(user: User) -> PlayerAppearance:
    return PlayerAppearance(nickname=default_nickname(user), **DEFAULT_PLAYER_VALUES)


def get_or_create_player(session: Session, user: User) -> PlayerProfile:
    profile = session.scalar(select(PlayerProfile).where(PlayerProfile.user_id == user.id))
    if profile is not None:
        return profile
    appearance = default_appearance(user)
    profile = PlayerProfile(user_id=user.id, **appearance.__dict__)
    session.add(profile)
    try:
        session.flush()
    except IntegrityError:
        # Another request may provision the one-profile-per-user row between
        # our read and insert. Reuse that row instead of surfacing a 500.
        session.rollback()
        profile = session.scalar(select(PlayerProfile).where(PlayerProfile.user_id == user.id))
        if profile is None:
            raise
    return profile


def update_player(session: Session, user: User, values: dict[str, str | None]) -> PlayerProfile:
    profile = get_or_create_player(session, user)
    for field, value in values.items():
        if value is None:
            continue
        if field == "nickname":
            value = normalize_nickname(value)
        else:
            value = validate_player_option(field, value)
        setattr(profile, field, value)
    # Reading /me/player may provision a default profile for compatibility;
    # setup is complete only after the player explicitly saves it.
    if user.player_setup_completed_at is None:
        user.player_setup_completed_at = utc_now()
    session.commit()
    session.refresh(profile)
    return profile
