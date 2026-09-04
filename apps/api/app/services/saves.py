from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.core.config import Settings
from app.models.common import utc_now
from app.models.game import Game
from app.models.game_save import GameSave, PlayerGameProfile
from app.models.user import User

SLOT_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")

class SaveError(Exception):
    def __init__(self, message: str, *, status_code: int = 400, detail: object | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail if detail is not None else message


def _save_metadata(save: GameSave) -> dict[str, object]:
    return {
        "id": save.id,
        "slot_key": save.slot_key,
        "game_version": save.game_version,
        "schema_version": save.schema_version,
        "revision": save.revision,
        "byte_size": save.byte_size,
        "created_at": save.created_at,
        "updated_at": save.updated_at,
    }


def _save_response(save: GameSave) -> dict[str, object]:
    return {**_save_metadata(save), "data": save.data_json}


def _enabled_game(session: Session, game_slug: str) -> Game:
    game = session.scalar(select(Game).where(Game.slug == game_slug))
    if game is None or game.status != "playable" or not game.supports_cloud_saves:
        raise SaveError("Game is not enabled for cloud saves")
    return game


def _validate_slot_key(slot_key: str) -> None:
    if not SLOT_KEY_PATTERN.fullmatch(slot_key):
        raise SaveError(
            "Slot key must be 1-100 characters using letters, numbers, dots, underscores, or hyphens",
            status_code=422,
        )


def _serialized_size(data: Any) -> int:
    try:
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise SaveError("Save data must be JSON data", status_code=422) from error
    return len(encoded.encode("utf-8"))


def _profile(session: Session, *, user: User, game: Game) -> PlayerGameProfile | None:
    return session.scalar(
        select(PlayerGameProfile).where(
            PlayerGameProfile.user_id == user.id,
            PlayerGameProfile.game_id == game.id,
        )
    )


def _revision_conflict(session: Session, *, profile_id: object, slot_key: str) -> SaveError:
    current = session.scalar(
        select(GameSave).where(GameSave.profile_id == profile_id, GameSave.slot_key == slot_key)
    )
    return SaveError(
        "Save revision conflict",
        status_code=409,
        detail={"message": "Save revision conflict", "current": _save_metadata(current) if current else None},
    )


def list_saves(session: Session, *, game_slug: str, user: User) -> list[dict[str, object]]:
    game = _enabled_game(session, game_slug)
    profile = _profile(session, user=user, game=game)
    if profile is None:
        return []
    saves = list(
        session.scalars(
            select(GameSave)
            .where(GameSave.profile_id == profile.id)
            .order_by(GameSave.updated_at.desc(), GameSave.slot_key.asc())
        )
    )
    return [_save_metadata(save) for save in saves]


def get_save(session: Session, *, game_slug: str, slot_key: str, user: User) -> dict[str, object]:
    _validate_slot_key(slot_key)
    game = _enabled_game(session, game_slug)
    profile = _profile(session, user=user, game=game)
    save = (
        session.scalar(select(GameSave).where(GameSave.profile_id == profile.id, GameSave.slot_key == slot_key))
        if profile is not None
        else None
    )
    if save is None:
        raise SaveError("Save slot not found", status_code=404)
    return _save_response(save)


def put_save(
    session: Session,
    *,
    game_slug: str,
    slot_key: str,
    user: User,
    data: Any,
    game_version: str,
    schema_version: int,
    expected_revision: int | None,
    settings: Settings,
) -> dict[str, object]:
    _validate_slot_key(slot_key)
    byte_size = _serialized_size(data)
    if byte_size > settings.cloud_save_max_bytes:
        raise SaveError("Save data exceeds the per-save size limit", status_code=422)

    game = _enabled_game(session, game_slug)
    session.execute(update(User).where(User.id == user.id).values(id=User.id))
    return _put_save_locked(
        session, game=game, slot_key=slot_key, user=user, data=data,
        byte_size=byte_size, game_version=game_version, schema_version=schema_version,
        expected_revision=expected_revision, settings=settings,
    )


def _put_save_locked(
    session: Session, *, game: Game, slot_key: str, user: User, data: Any,
    byte_size: int,
    game_version: str, schema_version: int, expected_revision: int | None, settings: Settings,
) -> dict[str, object]:
    profile = _profile(session, user=user, game=game)
    if profile is None:
        profile = PlayerGameProfile(user_id=user.id, game_id=game.id)
        session.add(profile)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            profile = _profile(session, user=user, game=game)
            if profile is None:
                raise
    profile_id = profile.id
    save = session.scalar(
        select(GameSave).where(GameSave.profile_id == profile_id, GameSave.slot_key == slot_key)
    )
    if save is not None and expected_revision != save.revision:
        raise _revision_conflict(session, profile_id=profile_id, slot_key=slot_key)
    if save is None and expected_revision is not None:
        raise _revision_conflict(session, profile_id=profile_id, slot_key=slot_key)

    total_bytes = session.scalar(
        select(func.coalesce(func.sum(GameSave.byte_size), 0)).where(GameSave.profile_id == profile_id)
    )
    next_total_bytes = int(total_bytes or 0) - (save.byte_size if save is not None else 0) + byte_size
    if next_total_bytes > settings.cloud_save_total_max_bytes:
        raise SaveError("Save data exceeds the per-game total size limit", status_code=422)

    timestamp = utc_now()
    if save is None:
        save = GameSave(
            profile_id=profile_id,
            slot_key=slot_key,
            game_version=game_version,
            schema_version=schema_version,
            data_json=data,
            revision=1,
            byte_size=byte_size,
        )
        session.add(save)
    else:
        save.game_version = game_version
        save.schema_version = schema_version
        save.data_json = data
        save.revision += 1
        save.byte_size = byte_size
    profile.updated_at = timestamp
    try:
        session.commit()
    except (StaleDataError, IntegrityError) as error:
        session.rollback()
        raise _revision_conflict(session, profile_id=profile_id, slot_key=slot_key) from error
    session.refresh(save)
    return _save_response(save)


def delete_save(
    session: Session, *, game_slug: str, slot_key: str, user: User, expected_revision: int
) -> None:
    _validate_slot_key(slot_key)
    game = _enabled_game(session, game_slug)
    session.execute(update(User).where(User.id == user.id).values(id=User.id))
    _delete_save_locked(session, game=game, slot_key=slot_key, user=user, expected_revision=expected_revision)


def _delete_save_locked(
    session: Session, *, game: Game, slot_key: str, user: User, expected_revision: int
) -> None:
    profile = _profile(session, user=user, game=game)
    save = (
        session.scalar(select(GameSave).where(GameSave.profile_id == profile.id, GameSave.slot_key == slot_key))
        if profile is not None
        else None
    )
    if save is None:
        raise SaveError("Save slot not found", status_code=404)
    assert profile is not None
    if save.revision != expected_revision:
        raise _revision_conflict(session, profile_id=profile.id, slot_key=slot_key)
    session.delete(save)
    profile.updated_at = utc_now()
    session.commit()
