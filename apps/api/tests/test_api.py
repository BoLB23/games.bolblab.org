from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

import app.db.session as db_session
from app.models.game import Game
from app.models.user import ExternalIdentity
from app.services.seed import seed_database


def test_health_and_readiness(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/ready").json() == {"status": "ready"}


def test_unauthenticated_catalog_is_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/games").status_code == 401


def test_development_login_me_and_logout(client: TestClient) -> None:
    users = client.get("/api/v1/auth/dev/users").json()
    login = client.post("/api/v1/auth/dev/login", json={"user_id": users[0]["id"]})
    assert login.status_code == 200
    assert client.get("/api/v1/auth/me").json()["display_name"] == users[0]["display_name"]
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_development_login_is_disabled_outside_development(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    from app.core.config import get_settings
    get_settings.cache_clear()
    assert client.get("/api/v1/auth/dev/users").status_code == 404


def test_games_are_ordered_and_hidden_games_are_excluded(authenticated_client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        session.add(
            Game(
                slug="hidden-game",
                title="Hidden Game",
                short_description="Not listed",
                description="Not listed",
                launch_url="",
                status="hidden",
                version="0.0.0",
                minimum_players=1,
                maximum_players=1,
                supports_cloud_saves=False,
                supports_leaderboards=False,
                supports_multiplayer=False,
                is_featured=True,
                sort_order=0,
            )
        )
        session.commit()
    games = authenticated_client.get("/api/v1/games").json()
    assert [game["slug"] for game in games] == ["sample-game", "milton-estates"]
    assert authenticated_client.get("/api/v1/games/hidden-game").status_code == 404


def test_game_detail(authenticated_client: TestClient) -> None:
    game = authenticated_client.get("/api/v1/games/sample-game")
    assert game.status_code == 200
    assert game.json()["status"] == "playable"
    assert authenticated_client.get("/api/v1/games/nope").status_code == 404


def test_seed_is_idempotent(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        seed_database(session, "http://localhost:5174")
        seed_database(session, "http://localhost:5174")
        assert session.execute(text("SELECT count(*) FROM users")).scalar_one() == 5
        assert session.execute(text("SELECT count(*) FROM games")).scalar_one() == 2


def test_sqlite_foreign_keys_are_enforced(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        session.add(ExternalIdentity(user_id=uuid.uuid4(), issuer="test", subject="missing"))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
        else:
            raise AssertionError("SQLite foreign key enforcement was not enabled")
