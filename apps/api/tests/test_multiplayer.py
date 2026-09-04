from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import WebSocket
from fastapi.testclient import TestClient

from app.api.routes.multiplayer import _websocket_user
from app.core.config import get_settings
from app.models.user import User
from app.services.multiplayer import MultiplayerCommandError, RoomManager


def _users(client: TestClient) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], client.get("/api/v1/auth/dev/users").json())


def _user(user_id: str, name: str) -> User:
    return User(id=uuid.UUID(user_id), display_name=name, email=f"{name}@example.test", role="member")


def test_room_manager_runs_a_three_hole_turn_based_round(client: TestClient) -> None:
    first, second, *_ = _users(client)
    ada = _user(str(first["id"]), str(first["display_name"]))
    pat = _user(str(second["id"]), str(second["display_name"]))
    manager = RoomManager()

    room = manager._create_room(ada)
    room = manager._join_room(pat, {"code": room.code})
    room = manager._start_round(ada, {"expected_version": room.version})
    assert room.phase == "playing"
    assert room.active_player_id == ada.id

    room = manager._throw(
        ada,
        {
            "expected_version": room.version,
            "action_id": "ada-hole-one",
            "lie": [640, 210],
            "holed": False,
            "hazard": False,
        },
    )
    assert room.players[ada.id].total_strokes == 1
    assert room.active_player_id == pat.id

    room = manager._throw(
        pat,
        {
            "expected_version": room.version,
            "action_id": "pat-hole-one",
            "lie": [790, 300],
            "holed": True,
            "hazard": True,
        },
    )
    assert room.players[pat.id].total_strokes == 2
    assert room.players[pat.id].holed is True


def test_room_manager_rejects_stale_or_out_of_turn_throws(client: TestClient) -> None:
    first, second, *_ = _users(client)
    ada = _user(str(first["id"]), str(first["display_name"]))
    pat = _user(str(second["id"]), str(second["display_name"]))
    manager = RoomManager()
    room = manager._create_room(ada)
    room = manager._join_room(pat, {"code": room.code})
    room = manager._start_round(ada, {"expected_version": room.version})

    with pytest.raises(MultiplayerCommandError, match="Wait for your turn"):
        manager._throw(
            pat,
            {
                "expected_version": room.version,
                "action_id": "not-your-turn",
                "lie": [500, 200],
                "holed": False,
                "hazard": False,
            },
        )
    with pytest.raises(MultiplayerCommandError, match="latest state"):
        manager._throw(
            ada,
            {
                "expected_version": room.version - 1,
                "action_id": "stale",
                "lie": [500, 200],
                "holed": False,
                "hazard": False,
            },
        )


def test_websocket_authentication_accepts_the_platform_cookie(authenticated_client: TestClient) -> None:
    token = authenticated_client.cookies.get("game_platform_session")
    assert token is not None
    socket = cast(WebSocket, SimpleNamespace(cookies={"game_platform_session": token}))
    user = _websocket_user(socket, get_settings())
    assert user is not None
