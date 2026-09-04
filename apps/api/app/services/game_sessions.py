from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any, cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.common import utc_now
from app.models.game import Game
from app.models.game_session import GameSession
from app.models.user import User
from app.services.presence import as_utc


class GameSessionError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def session_response(game_session: GameSession) -> dict[str, object]:
    return {
        "id": game_session.id,
        "session_id": game_session.id,
        "user_id": game_session.user_id,
        "game_id": game_session.game_id,
        "game_slug": game_session.game.slug,
        "started_at": game_session.started_at,
        "last_heartbeat_at": game_session.last_heartbeat_at,
        "ended_at": game_session.ended_at,
        "credited_playtime_seconds": game_session.credited_playtime_seconds,
    }


def _credit_seconds(game_session: GameSession, now: datetime, max_gap_seconds: int) -> float:
    last_heartbeat = as_utc(game_session.last_heartbeat_at)
    elapsed = max(0.0, (as_utc(now) - last_heartbeat).total_seconds())
    return min(elapsed, float(max_gap_seconds))


def finalize_abandoned_sessions(session: Session, *, settings: Settings, now: datetime | None = None) -> int:
    current = as_utc(now or utc_now())
    stale_before = current - timedelta(seconds=settings.game_session_max_gap_seconds)
    active_sessions = list(
        session.scalars(
            select(GameSession).where(
                GameSession.ended_at.is_(None), GameSession.last_heartbeat_at < stale_before
            )
        )
    )
    finalized_count = 0
    for game_session in active_sessions:
        last_heartbeat = as_utc(game_session.last_heartbeat_at)
        ended_at = last_heartbeat + timedelta(
            seconds=settings.game_session_max_gap_seconds
        )
        # Guard the transition so two cleanup requests cannot credit the same
        # abandoned session twice.
        result = cast(CursorResult[Any], session.execute(
            update(GameSession)
            .where(
                GameSession.id == game_session.id,
                GameSession.ended_at.is_(None),
                GameSession.last_heartbeat_at == game_session.last_heartbeat_at,
            )
            .values(
                credited_playtime_seconds=GameSession.credited_playtime_seconds
                + float(settings.game_session_max_gap_seconds),
                ended_at=ended_at,
            )
        ))
        finalized_count += result.rowcount
    if active_sessions:
        session.commit()
    return finalized_count


def start_game_session(
    session: Session, *, user: User, game_slug: str, settings: Settings
) -> GameSession:
    game = session.scalar(select(Game).where(Game.slug == game_slug, Game.status == "playable"))
    if game is None:
        raise GameSessionError("Game is unavailable for play sessions", status_code=404)
    finalize_abandoned_sessions(session, settings=settings)
    timestamp = utc_now()
    game_session = GameSession(
        user_id=user.id,
        game_id=game.id,
        started_at=timestamp,
        last_heartbeat_at=timestamp,
        credited_playtime_seconds=0.0,
    )
    session.add(game_session)
    session.commit()
    session.refresh(game_session)
    return game_session


def get_owned_session(session: Session, *, session_id: uuid.UUID, user: User) -> GameSession:
    game_session = session.scalar(
        select(GameSession).where(GameSession.id == session_id, GameSession.user_id == user.id)
    )
    if game_session is None:
        raise GameSessionError("Game session not found", status_code=404)
    return game_session


def heartbeat_game_session(
    session: Session, *, game_session: GameSession, settings: Settings
) -> GameSession:
    if game_session.ended_at is not None:
        raise GameSessionError("Game session has ended", status_code=409)
    timestamp = utc_now()
    elapsed = (as_utc(timestamp) - as_utc(game_session.last_heartbeat_at)).total_seconds()
    if elapsed > settings.game_session_max_gap_seconds:
        old_heartbeat = game_session.last_heartbeat_at
        ended_at = as_utc(old_heartbeat) + timedelta(
            seconds=settings.game_session_max_gap_seconds
        )
        expired_result = cast(CursorResult[Any], session.execute(
            update(GameSession)
            .where(
                GameSession.id == game_session.id,
                GameSession.ended_at.is_(None),
                GameSession.last_heartbeat_at == old_heartbeat,
            )
            .values(
                credited_playtime_seconds=GameSession.credited_playtime_seconds
                + float(settings.game_session_max_gap_seconds),
                ended_at=ended_at,
            )
        ))
        if expired_result.rowcount == 1:
            session.commit()
        else:
            session.rollback()
        raise GameSessionError("Game session expired after missing heartbeats", status_code=409)
    old_heartbeat = game_session.last_heartbeat_at
    credited = _credit_seconds(game_session, timestamp, settings.game_session_max_gap_seconds)
    result = cast(CursorResult[Any], session.execute(
        update(GameSession)
        .where(
            GameSession.id == game_session.id,
            GameSession.ended_at.is_(None),
            GameSession.last_heartbeat_at == old_heartbeat,
        )
        .values(
            credited_playtime_seconds=GameSession.credited_playtime_seconds + credited,
            last_heartbeat_at=timestamp,
        )
    ))
    if result.rowcount != 1:
        session.rollback()
        raise GameSessionError("Game session changed; retry with the latest session", status_code=409)
    session.commit()
    session.refresh(game_session)
    return game_session


def end_game_session(
    session: Session, *, game_session: GameSession, settings: Settings, _attempt: int = 0
) -> GameSession:
    if game_session.ended_at is not None:
        return game_session
    timestamp = utc_now()
    elapsed = (as_utc(timestamp) - as_utc(game_session.last_heartbeat_at)).total_seconds()
    old_heartbeat = game_session.last_heartbeat_at
    credited = _credit_seconds(game_session, timestamp, settings.game_session_max_gap_seconds)
    if elapsed > settings.game_session_max_gap_seconds:
        ended_at = as_utc(old_heartbeat) + timedelta(
            seconds=settings.game_session_max_gap_seconds
        )
        values = {"credited_playtime_seconds": GameSession.credited_playtime_seconds + credited, "ended_at": ended_at}
    else:
        values = {
            "credited_playtime_seconds": GameSession.credited_playtime_seconds + credited,
            "last_heartbeat_at": timestamp,
            "ended_at": timestamp,
        }
    result = cast(CursorResult[Any], session.execute(
        update(GameSession).where(
            GameSession.id == game_session.id,
            GameSession.ended_at.is_(None),
            GameSession.last_heartbeat_at == old_heartbeat,
        ).values(**values)
    ))
    if result.rowcount != 1:
        session.rollback()
        session.refresh(game_session)
        if game_session.ended_at is not None:
            return game_session
        if _attempt < 3:
            return end_game_session(session, game_session=game_session, settings=settings, _attempt=_attempt + 1)
        raise GameSessionError("Game session changed; retry with the latest session", status_code=409)
    session.commit()
    session.refresh(game_session)
    return game_session
