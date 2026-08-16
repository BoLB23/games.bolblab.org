from __future__ import annotations

import uuid
from pathlib import Path
from typing import cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

import app.db.session as db_session
from app.db.base import Base
from app.models.auth import UserSession
from app.models.common import utc_now
from app.models.game import Game
from app.models.leaderboard import LeaderboardDefinition
from app.models.user import ExternalIdentity
from app.services.seed import seed_database


def _cors_preflight(client: TestClient, origin: str) -> Response:
    return cast(
        Response,
        client.options(
            "/api/v1/auth/me",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        ),
    )


def test_health_and_readiness(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/ready").json() == {"status": "ready"}


def test_unauthenticated_catalog_is_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/games").status_code == 401


def test_extra_game_origin_receives_credentialed_cors_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GAME_CORS_ALLOWED_ORIGINS", "http://localhost:5183")
    from app.core.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    with TestClient(create_app()) as cors_client:
        response = _cors_preflight(cors_client, "http://localhost:5183")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5183"
    assert response.headers["access-control-allow-credentials"] == "true"
    get_settings.cache_clear()


def test_loopback_alias_receives_credentialed_cors_headers(client: TestClient) -> None:
    response = _cors_preflight(client, "http://127.0.0.1:6183")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:6183"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_game_launch_url_can_include_a_path_while_its_cors_origin_stays_strict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FLAPPY_MIKE_ORIGIN", "http://games.example.test")
    monkeypatch.setenv("FLAPPY_MIKE_LAUNCH_URL", "http://games.example.test/games/flappy-mike/")
    from app.core.config import get_settings

    get_settings.cache_clear()
    settings = get_settings()
    assert settings.flappy_mike_origin == "http://games.example.test"
    assert settings.flappy_mike_launch_url == "http://games.example.test/games/flappy-mike/"
    get_settings.cache_clear()


def test_untrusted_origin_is_rejected_by_cors(client: TestClient) -> None:
    response = _cors_preflight(client, "http://localhost:9191")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_development_login_me_and_logout(client: TestClient) -> None:
    users = client.get("/api/v1/auth/dev/users").json()
    login = client.post("/api/v1/auth/dev/login", json={"user_id": users[0]["id"]})
    assert login.status_code == 200
    assert client.get("/api/v1/auth/me").json()["display_name"] == users[0]["display_name"]
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_session_revalidation_reports_fixed_expiry_and_rejects_an_expired_cookie(
    authenticated_client: TestClient,
) -> None:
    status = authenticated_client.get("/api/v1/auth/session")
    assert status.status_code == 200
    assert status.json()["is_sliding"] is False
    assert status.json()["expires_at"]
    with db_session.SessionLocal() as session:
        current = session.scalar(select(UserSession))
        assert current is not None
        current.expires_at = utc_now().replace(year=2020)
        session.commit()
    assert authenticated_client.get("/api/v1/auth/session").status_code == 401


def test_development_login_is_disabled_outside_development(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
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
    assert [game["slug"] for game in games] == ["milton-estates", "sample-game", "flappy-mike"]
    assert games[0]["is_featured"] is True
    assert games[0]["cover_image_url"] == "/assets/milton-estates-cover.png"
    assert authenticated_client.get("/api/v1/games/hidden-game").status_code == 404


def test_game_detail(authenticated_client: TestClient) -> None:
    game = authenticated_client.get("/api/v1/games/sample-game")
    assert game.status_code == 200
    assert game.json()["status"] == "playable"
    assert authenticated_client.get("/api/v1/games/nope").status_code == 404


def test_flappy_mike_is_playable_and_publishes_a_distance_board(
    authenticated_client: TestClient,
) -> None:
    game = authenticated_client.get("/api/v1/games/flappy-mike")
    assert game.status_code == 200
    assert game.json()["launch_url"] == "http://localhost:6185"
    assert game.json()["supports_leaderboards"] is True
    assert authenticated_client.post("/api/v1/games/flappy-mike/sessions").status_code == 200
    submitted = authenticated_client.post(
        "/api/v1/games/flappy-mike/leaderboards/distance/entries",
        json={"value": 2_500, "metadata": {"levelId": "level-1"}},
    )
    assert submitted.status_code == 200
    assert submitted.json()["entry"]["value"] == 2_500


def test_leaderboard_submission_idempotency_prevents_duplicate_mutation(
    authenticated_client: TestClient,
) -> None:
    with db_session.SessionLocal() as session:
        board = session.scalar(select(LeaderboardDefinition).where(LeaderboardDefinition.key == "distance"))
        assert board is not None
        board.aggregation = "sum"
        session.commit()
    payload = {"value": 2_500, "metadata": {"run": "one"}, "idempotency_key": "run-123"}
    first = authenticated_client.post("/api/v1/games/flappy-mike/leaderboards/distance/entries", json=payload)
    second = authenticated_client.post("/api/v1/games/flappy-mike/leaderboards/distance/entries", json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json()["entry"]["value"] == second.json()["entry"]["value"]
    changed = authenticated_client.post(
        "/api/v1/games/flappy-mike/leaderboards/distance/entries",
        json={**payload, "value": 2_501},
    )
    assert changed.status_code == 409


def test_milton_estates_is_disabled_by_default_and_rejects_platform_use(
    authenticated_client: TestClient,
) -> None:
    milton = authenticated_client.get("/api/v1/games/milton-estates")
    assert milton.status_code == 200
    game = milton.json()
    assert game["launch_url"] == ""
    assert game["status"] == "coming_soon"
    assert game["version"] == "Not integrated"
    assert game["supports_cloud_saves"] is False
    assert game["supports_leaderboards"] is False
    assert game["supports_multiplayer"] is False
    assert authenticated_client.post("/api/v1/games/milton-estates/sessions").status_code == 404
    assert (
        authenticated_client.post(
            "/api/v1/games/milton-estates/leaderboards/not-configured/entries", json={"value": 1}
        ).status_code
        == 400
    )


def test_seed_can_explicitly_enable_milton_estates_for_local_integration(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        seed_database(
            session,
            "http://localhost:5174",
            milton_estates_origin="http://localhost:5183",
            milton_estates_enabled=True,
        )

    users = client.get("/api/v1/auth/dev/users").json()
    assert client.post("/api/v1/auth/dev/login", json={"user_id": users[0]["id"]}).status_code == 200
    milton = client.get("/api/v1/games/milton-estates")
    assert milton.status_code == 200
    game = milton.json()
    assert game["launch_url"] == "http://localhost:5183"
    assert game["status"] == "playable"
    assert game["version"] == "Platform integration"
    assert game["supports_cloud_saves"] is False
    assert game["supports_leaderboards"] is True
    assert game["supports_multiplayer"] is False
    assert client.post("/api/v1/games/milton-estates/sessions").status_code == 200
    boards = client.get("/api/v1/games/milton-estates/leaderboards")
    assert boards.status_code == 200
    assert [(board["key"], board["sort_direction"], board["aggregation"]) for board in boards.json()] == [
        ("milton-estates.bad-trip.longest-survival-ms", "asc", "min"),
        ("milton-estates.chase-ryan.fastest-catch-ms", "asc", "min"),
        ("milton-estates.mickey-drag-race.fastest-win-ms", "asc", "min"),
        ("milton-estates.mushroom-hunt.fastest-completion-ms", "asc", "min"),
    ]
    assert client.post(
        "/api/v1/games/milton-estates/leaderboards/milton-estates.mickey-drag-race.fastest-win-ms/entries",
        json={"value": 42_000},
    ).status_code == 200
    assert client.post(
        "/api/v1/games/milton-estates/leaderboards/milton-estates.mickey-drag-race.fastest-win-ms/entries",
        json={"value": 60_001},
    ).status_code == 422


def test_enabling_milton_estates_without_an_origin_is_rejected(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        try:
            seed_database(
                session,
                "http://localhost:5174",
                milton_estates_enabled=True,
            )
        except ValueError as error:
            assert str(error) == "MILTON_ESTATES_ORIGIN is required when MILTON_ESTATES_ENABLED is true"
        else:
            raise AssertionError("Expected an enabled Milton Estates seed to require its origin")


def test_seed_is_idempotent(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        seed_database(session, "http://localhost:5174")
        seed_database(session, "http://localhost:5174")
        assert session.execute(text("SELECT count(*) FROM users")).scalar_one() == 5
        assert session.execute(text("SELECT count(*) FROM games")).scalar_one() == 3


def test_production_seed_upserts_catalog_without_development_users(tmp_path: Path) -> None:
    database_path = tmp_path / "production-catalog.db"
    db_session.configure_database(f"sqlite:///{database_path}")
    Base.metadata.create_all(db_session.engine)
    with db_session.SessionLocal() as session:
        seed_database(session, "https://games.example.test/games/sample-game/")
        sample = session.scalar(select(Game).where(Game.slug == "sample-game"))
        assert sample is not None
        sample.status = "hidden"
        session.commit()
        seed_database(
            session,
            "https://games.example.test/games/sample-game/",
            flappy_mike_origin="https://games.example.test/games/flappy-mike/",
            milton_estates_origin="https://games.example.test",
            milton_estates_launch_url="https://games.example.test/games/milton-estates/",
            milton_estates_enabled=True,
            milton_estates_cloud_saves_enabled=True,
            include_development_data=False,
        )
        flappy = session.scalar(select(Game).where(Game.slug == "flappy-mike"))
        milton = session.scalar(select(Game).where(Game.slug == "milton-estates"))
        assert session.execute(text("SELECT count(*) FROM users")).scalar_one() == 0
        assert sample.status == "hidden"
        assert flappy is not None and flappy.cover_image_url == "/assets/flappy-mike-cover.png"
        assert milton is not None and milton.launch_url == "https://games.example.test/games/milton-estates/"
        assert milton.status == "playable"
        assert milton.supports_cloud_saves is True
        assert milton.supports_leaderboards is True
        assert len(milton.leaderboards) == 4
    Base.metadata.drop_all(db_session.engine)


def test_sqlite_foreign_keys_are_enforced(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        session.add(ExternalIdentity(user_id=uuid.uuid4(), issuer="test", subject="missing"))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
        else:
            raise AssertionError("SQLite foreign key enforcement was not enabled")


def _enable_cloud_saves(game_slug: str = "sample-game") -> None:
    with db_session.SessionLocal() as session:
        game = session.scalar(select(Game).where(Game.slug == game_slug))
        assert game is not None
        game.supports_cloud_saves = True
        session.commit()


def test_cloud_saves_are_versioned_and_list_metadata_only(authenticated_client: TestClient) -> None:
    _enable_cloud_saves()
    created = authenticated_client.put(
        "/api/v1/games/sample-game/saves/campaign-1",
        json={
            "data": {"coins": 42, "quests": ["first-orb"]},
            "game_version": "1.2.0",
            "schema_version": 3,
            "expected_revision": None,
        },
    )
    assert created.status_code == 200
    assert created.json()["revision"] == 1
    assert created.json()["data"]["coins"] == 42

    listed = authenticated_client.get("/api/v1/games/sample-game/saves")
    assert listed.status_code == 200
    assert listed.json()[0]["slot_key"] == "campaign-1"
    assert "data" not in listed.json()[0]

    updated = authenticated_client.put(
        "/api/v1/games/sample-game/saves/campaign-1",
        json={
            "data": {"coins": 43},
            "game_version": "1.2.1",
            "schema_version": 3,
            "expected_revision": 1,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert authenticated_client.get("/api/v1/games/sample-game/saves/campaign-1").json()["data"] == {"coins": 43}


def test_cloud_save_conflicts_are_explicit_and_slots_are_isolated(authenticated_client: TestClient) -> None:
    _enable_cloud_saves()
    payload = {"data": {"day": 1}, "game_version": "1.0.0", "schema_version": 1, "expected_revision": None}
    assert authenticated_client.put("/api/v1/games/sample-game/saves/main", json=payload).status_code == 200
    conflict = authenticated_client.put(
        "/api/v1/games/sample-game/saves/main",
        json={**payload, "data": {"day": 2}, "expected_revision": None},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["current"]["revision"] == 1

    users = authenticated_client.get("/api/v1/auth/dev/users").json()
    assert authenticated_client.post("/api/v1/auth/dev/login", json={"user_id": users[1]["id"]}).status_code == 200
    assert authenticated_client.get("/api/v1/games/sample-game/saves").json() == []
    assert authenticated_client.get("/api/v1/games/sample-game/saves/main").status_code == 404


def test_cloud_save_limits_disabled_games_and_deletion(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    disabled = authenticated_client.get("/api/v1/games/sample-game/saves")
    assert disabled.status_code == 400

    _enable_cloud_saves()
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "cloud_save_max_bytes", 800)
    monkeypatch.setattr(settings, "cloud_save_total_max_bytes", 1_000)
    payload = {"game_version": "1.0.0", "schema_version": 1, "expected_revision": None}
    assert authenticated_client.put(
        "/api/v1/games/sample-game/saves/one", json={**payload, "data": "a" * 600}
    ).status_code == 200
    assert authenticated_client.put(
        "/api/v1/games/sample-game/saves/two", json={**payload, "data": "b" * 600}
    ).status_code == 422
    assert authenticated_client.put(
        "/api/v1/games/sample-game/saves/too-large", json={**payload, "data": "c" * 900}
    ).status_code == 422
    assert authenticated_client.delete("/api/v1/games/sample-game/saves/one").status_code == 204
    assert authenticated_client.get("/api/v1/games/sample-game/saves/one").status_code == 404


def test_seed_can_enable_milton_estates_cloud_saves(client: TestClient) -> None:
    with db_session.SessionLocal() as session:
        seed_database(
            session,
            "http://localhost:5174",
            milton_estates_origin="http://localhost:5183",
            milton_estates_enabled=True,
            milton_estates_cloud_saves_enabled=True,
        )
    users = client.get("/api/v1/auth/dev/users").json()
    assert client.post("/api/v1/auth/dev/login", json={"user_id": users[0]["id"]}).status_code == 200
    assert client.get("/api/v1/games/milton-estates").json()["supports_cloud_saves"] is True
