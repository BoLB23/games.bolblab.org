from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from sqlalchemy import select

import app.db.session as db_session
from app.core.config import get_settings
from app.models.game import Game
from app.models.game_session import GameSession
from app.models.leaderboard import LeaderboardDefinition, LeaderboardEntry, LeaderboardSubmission
from app.models.user import User
from app.services.game_sessions import end_game_session, heartbeat_game_session, start_game_session
from app.services.leaderboards import submit_leaderboard_entry


def _parallel_submit(board_key: str, values: list[float], user_id: uuid.UUID, keys: list[str | None] | None = None) -> list[object]:
    with db_session.SessionLocal() as setup:
        board = setup.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == board_key))
        game = setup.scalar(select(Game).where(Game.id == board.game_id))
        game_slug = game.slug
        settings = get_settings()
        existing = setup.scalar(select(LeaderboardEntry).where(LeaderboardEntry.leaderboard_id == board.id, LeaderboardEntry.user_id == user_id))
        if existing is not None:
            setup.delete(existing)
            setup.commit()
    barrier = Barrier(len(values))

    def submit(item: tuple[float, str | None]) -> object:
        value, key = item
        with db_session.SessionLocal() as session:
            barrier.wait()
            return submit_leaderboard_entry(
                session, game_slug=game_slug, leaderboard_key=board_key, user=session.get(User, user_id),
                value=value, metadata=None, idempotency_key=key, settings=settings,
            )

    with ThreadPoolExecutor(max_workers=len(values)) as pool:
        return list(pool.map(submit, zip(values, keys or [None] * len(values), strict=True)))


def test_concurrent_max_submission_keeps_highest(client) -> None:
    user_id = uuid.UUID(client.get("/api/v1/auth/dev/users").json()[0]["id"])
    _parallel_submit("distance", [12, 99], user_id)
    with db_session.SessionLocal() as session:
        board = session.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == "distance"))
        entry = session.scalar(select(LeaderboardEntry).where(LeaderboardEntry.leaderboard_id == board.id, LeaderboardEntry.user_id == user_id))
        assert entry.value == 99


def test_concurrent_sum_submissions_are_not_lost(client) -> None:
    user_id = uuid.UUID(client.get("/api/v1/auth/dev/users").json()[0]["id"])
    with db_session.SessionLocal() as session:
        board = session.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == "orb-touches"))
        board.aggregation = "sum"
        existing = session.scalar(select(LeaderboardEntry).where(LeaderboardEntry.leaderboard_id == board.id, LeaderboardEntry.user_id == user_id))
        if existing is not None:
            session.delete(existing)
        session.commit()
    _parallel_submit("orb-touches", [3, 5], user_id)
    with db_session.SessionLocal() as session:
        board = session.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == "orb-touches"))
        entry = session.scalar(select(LeaderboardEntry).where(LeaderboardEntry.leaderboard_id == board.id, LeaderboardEntry.user_id == user_id))
        assert entry.value == 8


def test_concurrent_duplicate_idempotency_counts_once(client) -> None:
    user_id = uuid.UUID(client.get("/api/v1/auth/dev/users").json()[0]["id"])
    with db_session.SessionLocal() as session:
        board = session.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == "orb-touches"))
        board.aggregation = "sum"
        existing = session.scalar(select(LeaderboardEntry).where(LeaderboardEntry.leaderboard_id == board.id, LeaderboardEntry.user_id == user_id))
        if existing is not None:
            session.delete(existing)
        session.commit()
    _parallel_submit("orb-touches", [7, 7], user_id, ["same-key", "same-key"])
    with db_session.SessionLocal() as session:
        board = session.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == "orb-touches"))
        entry = session.scalar(select(LeaderboardEntry).where(
            LeaderboardEntry.leaderboard_id == board.id, LeaderboardEntry.user_id == user_id
        ))
        assert entry.value == 7
        assert session.query(LeaderboardSubmission).filter_by(
            leaderboard_id=board.id, user_id=user_id, idempotency_key="same-key"
        ).count() == 1


def test_concurrent_first_save_same_slot_has_one_conflict(authenticated_client, monkeypatch) -> None:
    from app.models.game import Game
    with db_session.SessionLocal() as session:
        game = session.scalar(select(Game).where(Game.slug == "sample-game"))
        game.supports_cloud_saves = True
        session.commit()
    barrier = Barrier(2)
    def put(value: int):
        barrier.wait()
        return authenticated_client.put("/api/v1/games/sample-game/saves/race", json={"data": {"v": value}, "game_version": "1", "schema_version": 1}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(put, [1, 2]))
    assert sorted(statuses) == [200, 409]


def test_concurrent_save_slots_respect_total_quota(authenticated_client, monkeypatch) -> None:
    from app.core.config import get_settings
    from app.models.game import Game
    settings = get_settings()
    monkeypatch.setattr(settings, "cloud_save_max_bytes", 2_000)
    monkeypatch.setattr(settings, "cloud_save_total_max_bytes", 1_000)
    with db_session.SessionLocal() as session:
        game = session.scalar(select(Game).where(Game.slug == "sample-game"))
        game.supports_cloud_saves = True
        session.commit()
    barrier = Barrier(2)
    def put(slot: str):
        barrier.wait()
        return authenticated_client.put(f"/api/v1/games/sample-game/saves/{slot}", json={"data": "x" * 600, "game_version": "1", "schema_version": 1}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(put, ["quota-a", "quota-b"]))
    assert sorted(statuses) == [200, 422]
    listed = authenticated_client.get("/api/v1/games/sample-game/saves").json()
    assert sum(item["byte_size"] for item in listed) <= 1_000


def test_end_retries_when_stale_session_loses_to_heartbeat(client) -> None:
    user_id = uuid.UUID(client.get("/api/v1/auth/dev/users").json()[0]["id"])
    settings = get_settings()
    with db_session.SessionLocal() as first:
        user = first.get(User, user_id)
        stale = start_game_session(first, user=user, game_slug="sample-game", settings=settings)
        stale_id = stale.id
    with db_session.SessionLocal() as heartbeat_session:
        current = heartbeat_session.get(GameSession, stale_id)
        heartbeat_game_session(heartbeat_session, game_session=current, settings=settings)
    with db_session.SessionLocal() as ending:
        current_stale = ending.get(GameSession, stale_id)
        ended = end_game_session(ending, game_session=current_stale, settings=settings)
        assert ended.ended_at is not None
