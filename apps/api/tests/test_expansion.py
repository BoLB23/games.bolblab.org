from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select

import app.db.session as db_session
from app.models.common import utc_now
from app.models.game import Game
from app.models.game_session import GameSession
from app.models.leaderboard import LeaderboardDefinition
from app.models.user import User


def _users(client: TestClient) -> list[dict[str, object]]:
    response = client.get("/api/v1/auth/dev/users")
    assert response.status_code == 200
    return response.json()


def _login(client: TestClient, display_name: str) -> dict[str, object]:
    user = next(candidate for candidate in _users(client) if candidate["display_name"] == display_name)
    response = client.post("/api/v1/auth/dev/login", json={"user_id": user["id"]})
    assert response.status_code == 200
    return user


def test_player_defaults_validate_and_only_update_current_user(client: TestClient) -> None:
    pat = _login(client, "Pat Player")
    player = client.get("/api/v1/me/player")
    assert player.status_code == 200
    assert player.json()["user_id"] == pat["id"]
    assert player.json()["nickname"] == "Pat"

    updated = client.put("/api/v1/me/player", json={"nickname": "  Jax  ", "haircut": "mohawk"})
    assert updated.status_code == 200
    assert updated.json()["nickname"] == "Jax"
    assert updated.json()["haircut"] == "mohawk"
    assert client.put("/api/v1/me/player", json={"nickname": "1234567890"}).status_code == 422
    assert client.put("/api/v1/me/player", json={"nickname": "   "}).status_code == 422

    ada = _login(client, "Ada Admin")
    ada_player = client.get("/api/v1/me/player").json()
    assert ada_player["user_id"] == ada["id"]
    assert ada_player["nickname"] == "Ada"


def test_presence_heartbeat_and_online_window(client: TestClient) -> None:
    pat = _login(client, "Pat Player")
    heartbeat = client.post("/api/v1/presence/heartbeat")
    assert heartbeat.status_code == 200
    assert heartbeat.json()["online"] is True

    with db_session.SessionLocal() as session:
        user = session.get(User, UUID(str(pat["id"])))
        assert user is not None
        user.last_seen_at = utc_now() - timedelta(minutes=5)
        session.commit()
    members = client.get("/api/v1/clan/members")
    pat_member = next(member for member in members.json() if member["user_id"] == pat["id"])
    assert pat_member["is_online"] is False


def test_clan_members_list_online_players_first(client: TestClient) -> None:
    pat = _login(client, "Pat Player")
    with db_session.SessionLocal() as session:
        other_users = session.scalars(select(User).where(User.id != UUID(str(pat["id"]))))
        for user in other_users:
            user.last_seen_at = utc_now() - timedelta(minutes=5)
        session.commit()
    assert client.post("/api/v1/presence/heartbeat").status_code == 200

    members = client.get("/api/v1/clan/members")

    assert members.status_code == 200
    assert members.json()[0]["user_id"] == pat["id"]
    online_members = [member["is_online"] for member in members.json()]
    assert online_members == sorted(online_members, reverse=True)


def test_game_session_credits_time_and_caps_abandoned_gap(client: TestClient) -> None:
    _login(client, "Pat Player")
    started = client.post("/api/v1/games/sample-game/sessions")
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    with db_session.SessionLocal() as session:
        game_session = session.get(GameSession, UUID(session_id))
        assert game_session is not None
        game_session.last_heartbeat_at = utc_now() - timedelta(minutes=10)
        session.commit()
    ended = client.post(f"/api/v1/game-sessions/{session_id}/end")
    assert ended.status_code == 200
    assert ended.json()["ended_at"] is not None
    assert ended.json()["credited_playtime_seconds"] <= 120
    assert client.post("/api/v1/games/milton-estates/sessions").status_code == 404


def test_only_overlord_can_change_another_member_role(client: TestClient) -> None:
    pat = _login(client, "Pat Player")
    target = next(user for user in _users(client) if user["display_name"] == "Mara Member")
    denied = client.patch(f"/api/v1/clan/members/{target['id']}/role", json={"role": "staff"})
    assert denied.status_code == 403

    ada = _login(client, "Ada Admin")
    changed = client.patch(f"/api/v1/clan/members/{target['id']}/role", json={"role": "staff"})
    assert changed.status_code == 200
    assert changed.json()["role"] == "staff"
    assert client.patch(f"/api/v1/clan/members/{ada['id']}/role", json={"role": "member"}).status_code == 400
    assert pat["id"] != target["id"]


def test_leaderboards_rank_both_directions_and_keep_aggregation_rules(client: TestClient) -> None:
    _login(client, "Pat Player")
    highest = client.post(
        "/api/v1/games/sample-game/leaderboards/orb-touches/entries",
        json={"value": 100, "user_id": "someone-else"},
    )
    assert highest.status_code == 422
    highest = client.post(
        "/api/v1/games/sample-game/leaderboards/orb-touches/entries", json={"value": 100}
    )
    assert highest.status_code == 200
    assert highest.json()["entry"]["value"] == 100
    lower = client.post(
        "/api/v1/games/sample-game/leaderboards/orb-touches/entries", json={"value": 1}
    )
    assert lower.status_code == 200
    assert lower.json()["entry"]["value"] == 100
    fastest = client.post(
        "/api/v1/games/sample-game/leaderboards/orb-speedrun/entries", json={"value": 3.25}
    )
    assert fastest.status_code == 200
    assert fastest.json()["entry"]["value"] == 3.25

    with db_session.SessionLocal() as session:
        game = session.scalar(select(Game).where(Game.slug == "sample-game"))
        assert game is not None
        for key, aggregation in (("latest-test", "latest"), ("sum-test", "sum")):
            session.add(
                LeaderboardDefinition(
                    game_id=game.id,
                    key=key,
                    display_name=key,
                    description="test board",
                    unit="points",
                    sort_direction="desc",
                    aggregation=aggregation,
                    is_active=True,
                )
            )
        session.commit()
    assert client.post("/api/v1/games/sample-game/leaderboards/latest-test/entries", json={"value": 8}).json()["entry"]["value"] == 8
    assert client.post("/api/v1/games/sample-game/leaderboards/latest-test/entries", json={"value": 2}).json()["entry"]["value"] == 2
    assert client.post("/api/v1/games/sample-game/leaderboards/sum-test/entries", json={"value": 8}).json()["entry"]["value"] == 8
    assert client.post("/api/v1/games/sample-game/leaderboards/sum-test/entries", json={"value": 2}).json()["entry"]["value"] == 10

    board = client.get("/api/v1/leaderboards/orb-touches?game_slug=sample-game&limit=1")
    assert board.status_code == 200
    assert board.json()["entries"][0]["value"] == 100
    assert board.json()["current_user_rank"] == 1
    assert client.post("/api/v1/games/milton-estates/leaderboards/orb-touches/entries", json={"value": 1}).status_code == 400
    assert client.post("/api/v1/games/sample-game/leaderboards/no-such-board/entries", json={"value": 1}).status_code == 404


def test_end_to_end_development_player_game_clan_leaderboard_flow(client: TestClient) -> None:
    pat = _login(client, "Pat Player")
    saved = client.put(
        "/api/v1/me/player",
        json={
            "nickname": "Flow",
            "haircut": "fade",
            "hair_color": "#bd742c",
            "tshirt_color": "#3c7468",
            "pants_color": "#2f4c43",
            "shoe_color": "#ffbd3f",
        },
    )
    assert saved.status_code == 200
    session = client.post("/api/v1/games/sample-game/sessions")
    assert session.status_code == 200
    ended = client.post(f"/api/v1/game-sessions/{session.json()['session_id']}/end")
    assert ended.status_code == 200
    submitted = client.post(
        "/api/v1/games/sample-game/leaderboards/orb-touches/entries",
        json={"value": 77, "metadata": {"flow": "smoke"}},
    )
    assert submitted.status_code == 200
    clan = client.get("/api/v1/clan/members")
    pat_member = next(member for member in clan.json() if member["user_id"] == pat["id"])
    assert pat_member["nickname"] == "Flow"
    board = client.get("/api/v1/leaderboards/orb-touches?game_slug=sample-game")
    assert board.status_code == 200
    assert board.json()["current_user_entry"]["value"] == 77
