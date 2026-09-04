from __future__ import annotations

import json
import math
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.models.common import utc_now
from app.models.game import Game
from app.models.leaderboard import LeaderboardDefinition, LeaderboardEntry, LeaderboardSubmission
from app.models.user import User
from app.services.player import default_appearance

AGGREGATION_ALIASES = {
    "best_maximum": "max",
    "best_minimum": "min",
    "cumulative_sum": "sum",
}
SORT_DIRECTION_ALIASES = {"ascending": "asc", "descending": "desc"}
MILTON_ESTATES_MILLISECOND_BOARDS = {
    "milton-estates.mushroom-hunt.fastest-completion-ms",
    "milton-estates.chase-ryan.fastest-catch-ms",
    "milton-estates.mickey-drag-race.fastest-win-ms",
    "milton-estates.bad-trip.longest-survival-ms",
}
MICKEY_DRAG_RACE_BOARD = "milton-estates.mickey-drag-race.fastest-win-ms"


class LeaderboardError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code



def canonical_aggregation(value: str) -> str:
    return AGGREGATION_ALIASES.get(value, value)


def canonical_sort_direction(value: str) -> str:
    return SORT_DIRECTION_ALIASES.get(value, value)


def _definition_response(board: LeaderboardDefinition) -> dict[str, object]:
    return {
        "id": board.id,
        "game_id": board.game_id,
        "game_slug": board.game.slug,
        "game_title": board.game.title,
        "key": board.key,
        "display_name": board.display_name,
        "description": board.description,
        "mission_key": board.mission_key,
        "unit": board.unit,
        "sort_direction": canonical_sort_direction(board.sort_direction),
        "aggregation": canonical_aggregation(board.aggregation),
        "is_active": board.is_active,
        "created_at": board.created_at,
        "updated_at": board.updated_at,
    }


def list_leaderboards(session: Session, *, game_slug: str | None = None) -> list[dict[str, object]]:
    statement = (
        select(LeaderboardDefinition)
        .join(Game)
        .where(LeaderboardDefinition.is_active.is_(True), Game.status != "hidden")
        .options(selectinload(LeaderboardDefinition.game))
        .order_by(Game.sort_order.asc(), LeaderboardDefinition.display_name.asc())
    )
    if game_slug is not None:
        statement = statement.where(Game.slug == game_slug)
    boards = list(session.scalars(statement))
    return [_definition_response(board) for board in boards]


def get_leaderboard_definition(
    session: Session, *, leaderboard_key: str, game_slug: str | None = None
) -> LeaderboardDefinition:
    statement = (
        select(LeaderboardDefinition)
        .join(Game)
        .where(
            LeaderboardDefinition.key == leaderboard_key,
            LeaderboardDefinition.is_active.is_(True),
            Game.status != "hidden",
        )
        .options(selectinload(LeaderboardDefinition.game))
    )
    if game_slug is not None:
        statement = statement.where(Game.slug == game_slug)
    boards = list(session.scalars(statement))
    if not boards:
        raise LeaderboardError("Leaderboard not found", status_code=404)
    if len(boards) > 1:
        raise LeaderboardError("A game slug is required for this leaderboard key", status_code=409)
    return boards[0]


def _entry_appearance(user: User) -> dict[str, str]:
    if user.player_profile is not None:
        return {
            "nickname": user.player_profile.nickname,
            "haircut": user.player_profile.haircut,
            "hair_color": user.player_profile.hair_color,
            "tshirt_color": user.player_profile.tshirt_color,
            "pants_color": user.player_profile.pants_color,
            "shoe_color": user.player_profile.shoe_color,
        }
    return default_appearance(user).__dict__


def _ranked_entry(entry: LeaderboardEntry, *, rank: int) -> dict[str, object]:
    appearance = _entry_appearance(entry.user)
    return {
        "id": entry.id,
        "user_id": entry.user_id,
        "rank": rank,
        "nickname": appearance["nickname"],
        "display_name": entry.user.display_name,
        "role": entry.user.role,
        "appearance": appearance,
        "value": entry.value,
        "metadata": entry.metadata_json,
        "achieved_at": entry.achieved_at,
        "submitted_at": entry.submitted_at,
    }


def get_leaderboard_response(
    session: Session,
    *,
    board: LeaderboardDefinition,
    current_user: User,
    limit: int,
) -> dict[str, object]:
    descending = canonical_sort_direction(board.sort_direction) == "desc"
    value_order = LeaderboardEntry.value.desc() if descending else LeaderboardEntry.value.asc()
    ranked_rows = (
        select(
            LeaderboardEntry.id,
            LeaderboardEntry.user_id,
            func.row_number()
            .over(order_by=(value_order, func.lower(User.display_name).asc(), LeaderboardEntry.user_id.asc()))
            .label("rank"),
        )
        .join(User, User.id == LeaderboardEntry.user_id)
        .where(LeaderboardEntry.leaderboard_id == board.id)
        .subquery()
    )
    selected = list(
        session.execute(
            select(ranked_rows.c.id, ranked_rows.c.user_id, ranked_rows.c.rank)
            .where((ranked_rows.c.rank <= limit) | (ranked_rows.c.user_id == current_user.id))
            .order_by(ranked_rows.c.rank)
        )
    )
    ids = [row.id for row in selected]
    entries_by_id = {
        entry.id: entry
        for entry in session.scalars(
            select(LeaderboardEntry)
            .where(LeaderboardEntry.id.in_(ids))
            .options(selectinload(LeaderboardEntry.user).selectinload(User.player_profile))
        )
    }
    ranked = [_ranked_entry(entries_by_id[row.id], rank=row.rank) for row in selected]
    visible = ranked[:limit]
    current_entry = next((entry for entry in ranked if entry["user_id"] == current_user.id), None)
    return {
        "definition": _definition_response(board),
        "entries": visible,
        "current_user_entry": current_entry,
        "current_user_rank": current_entry["rank"] if current_entry is not None else None,
    }


def _validate_metadata(metadata: dict[str, Any] | None, settings: Settings) -> None:
    if metadata is None:
        return
    if len(metadata) > 20:
        raise LeaderboardError("Leaderboard metadata has too many fields", status_code=422)
    try:
        encoded = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise LeaderboardError("Leaderboard metadata must be JSON data", status_code=422) from error
    if len(encoded.encode("utf-8")) > settings.leaderboard_max_metadata_bytes:
        raise LeaderboardError("Leaderboard metadata is too large", status_code=422)


def _validate_board_value(board: LeaderboardDefinition, value: float) -> None:
    if board.game.slug != "milton-estates" or board.key not in MILTON_ESTATES_MILLISECOND_BOARDS:
        return
    if value <= 0 or not value.is_integer():
        raise LeaderboardError("Milton Estates leaderboard values must be positive integer milliseconds", status_code=422)
    if board.key == MICKEY_DRAG_RACE_BOARD and value > 60_000:
        raise LeaderboardError("Mickey Drag Race results must be between 1 and 60000 milliseconds", status_code=422)


def submit_leaderboard_entry(
    session: Session,
    *,
    game_slug: str,
    leaderboard_key: str,
    user: User,
    value: float,
    metadata: dict[str, Any] | None,
    idempotency_key: str | None,
    settings: Settings,
) -> dict[str, object]:
    if not math.isfinite(value) or abs(value) > settings.leaderboard_max_value:
        raise LeaderboardError("Leaderboard value is outside the allowed range", status_code=422)
    _validate_metadata(metadata, settings)
    game = session.scalar(select(Game).where(Game.slug == game_slug))
    if game is None or game.status != "playable" or not game.supports_leaderboards:
        raise LeaderboardError("Game is not enabled for leaderboard submissions", status_code=400)
    board = session.scalar(
        select(LeaderboardDefinition).where(
            LeaderboardDefinition.game_id == game.id,
            LeaderboardDefinition.key == leaderboard_key,
            LeaderboardDefinition.is_active.is_(True),
        )
    )
    if board is None:
        raise LeaderboardError("Leaderboard not found for this game", status_code=404)
    board.game = game
    _validate_board_value(board, value)
    # Lock the durable user row before reading the per-user entry. This works
    # across workers and replicas (and SQLite's writer lock protects its local
    # development database), including first-entry and idempotency inserts.
    session.execute(update(User).where(User.id == user.id).values(id=User.id))
    return _submit_locked(
        session, board=board, game_slug=game_slug, leaderboard_key=leaderboard_key,
        user=user, value=value, metadata=metadata, idempotency_key=idempotency_key, settings=settings,
    )


def _submit_locked(
    session: Session, *, board: LeaderboardDefinition, game_slug: str, leaderboard_key: str,
    user: User, value: float, metadata: dict[str, Any] | None, idempotency_key: str | None,
    settings: Settings,
) -> dict[str, object]:
    if idempotency_key is not None:
        previous = session.scalar(
            select(LeaderboardSubmission).where(
                LeaderboardSubmission.leaderboard_id == board.id,
                LeaderboardSubmission.user_id == user.id,
                LeaderboardSubmission.idempotency_key == idempotency_key,
            )
        )
        if previous is not None:
            if previous.value != value or previous.metadata_json != metadata:
                raise LeaderboardError("Idempotency key was already used for a different submission", status_code=409)
            response = get_leaderboard_response(session, board=board, current_user=user, limit=100)
            current_entry = response["current_user_entry"]
            if not isinstance(current_entry, dict):
                raise LeaderboardError("Leaderboard entry could not be ranked", status_code=500)
            return {"entry": current_entry, "rank": current_entry["rank"]}
    existing = session.scalar(
        select(LeaderboardEntry).where(
            LeaderboardEntry.leaderboard_id == board.id,
            LeaderboardEntry.user_id == user.id,
        )
    )
    timestamp = utc_now()
    aggregation = canonical_aggregation(board.aggregation)
    if existing is None:
        existing = LeaderboardEntry(
            leaderboard_id=board.id,
            user_id=user.id,
            value=value,
            metadata_json=metadata,
            achieved_at=timestamp,
            submitted_at=timestamp,
        )
        session.add(existing)
    else:
        next_value = existing.value
        is_improvement = True
        if aggregation == "max":
            is_improvement = value > existing.value
            next_value = max(existing.value, value)
        elif aggregation == "min":
            is_improvement = value < existing.value
            next_value = min(existing.value, value)
        elif aggregation == "latest":
            next_value = value
        elif aggregation == "sum":
            next_value = existing.value + value
        else:
            raise LeaderboardError("Leaderboard has an invalid aggregation rule", status_code=500)
        if not math.isfinite(next_value) or abs(next_value) > settings.leaderboard_max_value:
            raise LeaderboardError("Aggregated leaderboard value is outside the allowed range", status_code=422)
        existing.value = next_value
        existing.submitted_at = timestamp
        if is_improvement or aggregation in {"latest", "sum"}:
            existing.achieved_at = timestamp
            existing.metadata_json = metadata
    if idempotency_key is not None:
        session.add(
            LeaderboardSubmission(
                leaderboard_id=board.id,
                user_id=user.id,
                idempotency_key=idempotency_key,
                value=value,
                metadata_json=metadata,
            )
        )
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        if idempotency_key is None:
            raise
        previous = session.scalar(
            select(LeaderboardSubmission).where(
                LeaderboardSubmission.leaderboard_id == board.id,
                LeaderboardSubmission.user_id == user.id,
                LeaderboardSubmission.idempotency_key == idempotency_key,
            )
        )
        if previous is None:
            raise
        if previous.value != value or previous.metadata_json != metadata:
            raise LeaderboardError("Idempotency key was already used for a different submission", status_code=409) from error
        board = get_leaderboard_definition(session, leaderboard_key=leaderboard_key, game_slug=game_slug)
        response = get_leaderboard_response(session, board=board, current_user=user, limit=100)
        current_entry = response["current_user_entry"]
        if not isinstance(current_entry, dict):
            raise LeaderboardError("Leaderboard entry could not be ranked", status_code=500) from error
        return {"entry": current_entry, "rank": current_entry["rank"]}
    session.refresh(existing)
    board = get_leaderboard_definition(session, leaderboard_key=leaderboard_key, game_slug=game_slug)
    response = get_leaderboard_response(session, board=board, current_user=user, limit=100)
    current_entry = response["current_user_entry"]
    if not isinstance(current_entry, dict):
        raise LeaderboardError("Leaderboard entry could not be ranked", status_code=500)
    return {"entry": current_entry, "rank": current_entry["rank"]}
