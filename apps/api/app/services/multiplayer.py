from __future__ import annotations

import asyncio
import math
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import WebSocket

from app.models.common import utc_now
from app.models.user import User

RoomPhase = Literal["lobby", "playing", "finished"]
ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
HOLE_PARS = (3, 4, 3)
MAX_PLAYERS = 10
MAX_STROKES_PER_HOLE = 8
EMPTY_ROOM_TTL = timedelta(minutes=10)


class MultiplayerCommandError(ValueError):
    pass


@dataclass
class RoomPlayer:
    user_id: uuid.UUID
    display_name: str
    connected: bool = True
    total_strokes: int = 0
    hole_strokes: int = 0
    holed: bool = False
    lie: tuple[float, float] | None = None


@dataclass
class Room:
    code: str
    host_user_id: uuid.UUID
    players: dict[uuid.UUID, RoomPlayer] = field(default_factory=dict)
    phase: RoomPhase = "lobby"
    version: int = 1
    hole_index: int = 0
    active_player_id: uuid.UUID | None = None
    seen_action_ids: set[str] = field(default_factory=set)
    last_activity: datetime = field(default_factory=utc_now)


def _player_response(player: RoomPlayer) -> dict[str, object]:
    return {
        "user_id": str(player.user_id),
        "display_name": player.display_name,
        "connected": player.connected,
        "strokes": player.total_strokes,
        "hole_strokes": player.hole_strokes,
        "holed": player.holed,
        "lie": list(player.lie) if player.lie is not None else None,
    }


def _room_response(room: Room) -> dict[str, object]:
    return {
        "code": room.code,
        "version": room.version,
        "phase": room.phase,
        "host_user_id": str(room.host_user_id),
        "active_player_id": str(room.active_player_id) if room.active_player_id else None,
        "hole_index": room.hole_index,
        "hole_count": len(HOLE_PARS),
        "hole_par": HOLE_PARS[room.hole_index] if room.phase != "lobby" else None,
        "players": [_player_response(player) for player in room.players.values()],
    }


class RoomManager:
    """A deliberately small in-memory room registry for the single API replica."""

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._room_by_user: dict[uuid.UUID, str] = {}
        self._sockets: dict[uuid.UUID, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def attach(self, websocket: WebSocket, user: User) -> None:
        async with self._lock:
            previous = self._sockets.get(user.id)
            self._sockets[user.id] = websocket
            if previous is not None and previous is not websocket:
                await previous.close(code=4001, reason="Connected from another tab")
            room = self._room_for_user(user.id)
            if room is None:
                await websocket.send_json({"type": "connected"})
                return
            player = room.players.get(user.id)
            if player is not None:
                player.connected = True
                room.last_activity = utc_now()
                if room.phase == "playing" and room.active_player_id is None:
                    room.active_player_id = self._first_eligible_player(room)
                room.version += 1
            await self._send_room_state(room)

    async def disconnect(self, user_id: uuid.UUID, websocket: WebSocket | None = None) -> None:
        async with self._lock:
            # A replaced connection can receive its disconnect callback after the
            # replacement was attached. Never let that stale callback evict it.
            if websocket is not None and self._sockets.get(user_id) is not websocket:
                return
            self._sockets.pop(user_id, None)
            room = self._room_for_user(user_id)
            if room is None:
                return
            player = room.players.get(user_id)
            if player is None:
                return
            player.connected = False
            room.last_activity = utc_now()
            if room.active_player_id == user_id:
                self._advance_turn(room, user_id)
            room.version += 1
            await self._send_room_state(room)

    async def handle(self, websocket: WebSocket, user: User, payload: object) -> None:
        async with self._lock:
            if self._sockets.get(user.id) is not websocket:
                return
            self._cleanup_empty_rooms()
            try:
                command = self._command(payload)
                event = command["type"]
                if event == "create_room":
                    room = self._create_room(user)
                elif event == "join_room":
                    room = self._join_room(user, command)
                elif event == "leave_room":
                    await self._leave_room(user.id)
                    return
                elif event == "room_state":
                    room = self._require_room(user.id)
                elif event == "start_round":
                    room = self._start_round(user, command)
                elif event == "throw":
                    room = self._throw(user, command)
                else:
                    raise MultiplayerCommandError("Unknown multiplayer command")
            except MultiplayerCommandError as error:
                await websocket.send_json({"type": "error", "message": str(error)})
                return
            await self._send_room_state(room)

    def _command(self, payload: object) -> dict[str, Any]:
        if not isinstance(payload, dict) or not isinstance(payload.get("type"), str):
            raise MultiplayerCommandError("A multiplayer command needs a type")
        return payload

    def _create_room(self, user: User) -> Room:
        if self._room_for_user(user.id) is not None:
            raise MultiplayerCommandError("Leave your current room before creating another")
        code = self._new_code()
        room = Room(code=code, host_user_id=user.id)
        room.players[user.id] = RoomPlayer(user.id, user.display_name)
        self._rooms[code] = room
        self._room_by_user[user.id] = code
        return room

    def _join_room(self, user: User, command: dict[str, Any]) -> Room:
        raw_code = command.get("code")
        if not isinstance(raw_code, str):
            raise MultiplayerCommandError("Enter a six-character room code")
        code = raw_code.strip().upper()
        room = self._rooms.get(code)
        if room is None:
            raise MultiplayerCommandError("That room code does not exist")
        existing_room = self._room_for_user(user.id)
        if existing_room is not None and existing_room.code != code:
            raise MultiplayerCommandError("Leave your current room before joining another")
        if room.phase != "lobby" and user.id not in room.players:
            raise MultiplayerCommandError("This round has already started")
        player = room.players.get(user.id)
        if player is None:
            if len(room.players) >= MAX_PLAYERS:
                raise MultiplayerCommandError("This room is full")
            room.players[user.id] = RoomPlayer(user.id, user.display_name)
            self._room_by_user[user.id] = room.code
            room.version += 1
        else:
            player.connected = True
            player.display_name = user.display_name
        room.last_activity = utc_now()
        return room

    def _start_round(self, user: User, command: dict[str, Any]) -> Room:
        room = self._require_room(user.id)
        self._require_version(room, command)
        if room.host_user_id != user.id:
            raise MultiplayerCommandError("Only the room host can start the round")
        if room.phase != "lobby":
            raise MultiplayerCommandError("This room is already in a round")
        if len(room.players) < 2:
            raise MultiplayerCommandError("Invite at least one friend before starting")
        room.phase = "playing"
        room.hole_index = 0
        for player in room.players.values():
            player.total_strokes = 0
            player.hole_strokes = 0
            player.holed = False
            player.lie = None
        room.active_player_id = self._first_connected_player(room)
        if room.active_player_id is None:
            raise MultiplayerCommandError("A connected player is required to start")
        room.version += 1
        room.last_activity = utc_now()
        return room

    def _throw(self, user: User, command: dict[str, Any]) -> Room:
        room = self._require_room(user.id)
        self._require_version(room, command)
        if room.phase != "playing":
            raise MultiplayerCommandError("The round has not started")
        if room.active_player_id != user.id:
            raise MultiplayerCommandError("Wait for your turn")
        action_id = command.get("action_id")
        if not isinstance(action_id, str) or not action_id or len(action_id) > 128:
            raise MultiplayerCommandError("A throw needs an action id")
        if action_id in room.seen_action_ids:
            return room
        lie = self._validated_lie(command.get("lie"))
        holed = command.get("holed")
        hazard = command.get("hazard")
        if not isinstance(holed, bool) or not isinstance(hazard, bool):
            raise MultiplayerCommandError("A throw needs holed and hazard flags")
        player = room.players[user.id]
        player.hole_strokes += 1 + int(hazard)
        player.total_strokes += 1 + int(hazard)
        player.lie = lie
        player.holed = holed or player.hole_strokes >= MAX_STROKES_PER_HOLE
        room.seen_action_ids.add(action_id)
        if len(room.seen_action_ids) > 100:
            room.seen_action_ids.pop()
        room.version += 1
        room.last_activity = utc_now()
        if self._hole_complete(room):
            self._advance_hole(room)
        else:
            self._advance_turn(room, user.id)
        return room

    async def _leave_room(self, user_id: uuid.UUID) -> None:
        room = self._room_for_user(user_id)
        if room is None:
            return
        room.players.pop(user_id, None)
        self._room_by_user.pop(user_id, None)
        if not room.players:
            self._rooms.pop(room.code, None)
            return
        if room.host_user_id == user_id:
            room.host_user_id = next(iter(room.players))
        if room.active_player_id == user_id:
            self._advance_turn(room, user_id)
        room.version += 1
        room.last_activity = utc_now()
        await self._send_room_state(room)

    def _advance_hole(self, room: Room) -> None:
        if room.hole_index == len(HOLE_PARS) - 1:
            room.phase = "finished"
            room.active_player_id = None
            return
        room.hole_index += 1
        room.seen_action_ids.clear()
        for player in room.players.values():
            player.hole_strokes = 0
            player.holed = False
            player.lie = None
        room.active_player_id = self._first_connected_player(room)

    def _advance_turn(self, room: Room, after_user_id: uuid.UUID) -> None:
        user_ids = list(room.players)
        if not user_ids:
            room.active_player_id = None
            return
        try:
            start = user_ids.index(after_user_id)
        except ValueError:
            start = -1
        for offset in range(1, len(user_ids) + 1):
            candidate = room.players[user_ids[(start + offset) % len(user_ids)]]
            if candidate.connected and not candidate.holed and candidate.hole_strokes < MAX_STROKES_PER_HOLE:
                room.active_player_id = candidate.user_id
                return
        room.active_player_id = None

    @staticmethod
    def _hole_complete(room: Room) -> bool:
        return all(player.holed or player.hole_strokes >= MAX_STROKES_PER_HOLE for player in room.players.values())

    @staticmethod
    def _validated_lie(value: object) -> tuple[float, float]:
        if not isinstance(value, list) or len(value) != 2 or not all(isinstance(point, int | float) for point in value):
            raise MultiplayerCommandError("A throw needs a two-number lie")
        x, y = float(value[0]), float(value[1])
        if not math.isfinite(x) or not math.isfinite(y) or not (0 <= x <= 960 and 0 <= y <= 540):
            raise MultiplayerCommandError("The throw landed outside the course")
        return x, y

    @staticmethod
    def _require_version(room: Room, command: dict[str, Any]) -> None:
        if command.get("expected_version") != room.version:
            raise MultiplayerCommandError("The room changed; use the latest state")

    def _require_room(self, user_id: uuid.UUID) -> Room:
        room = self._room_for_user(user_id)
        if room is None:
            raise MultiplayerCommandError("Join or create a room first")
        return room

    def _room_for_user(self, user_id: uuid.UUID) -> Room | None:
        code = self._room_by_user.get(user_id)
        return self._rooms.get(code) if code is not None else None

    def _first_connected_player(self, room: Room) -> uuid.UUID | None:
        return next((player.user_id for player in room.players.values() if player.connected), None)

    def _first_eligible_player(self, room: Room) -> uuid.UUID | None:
        return next(
            (player.user_id for player in room.players.values()
             if player.connected and not player.holed and player.hole_strokes < MAX_STROKES_PER_HOLE),
            None,
        )

    def _new_code(self) -> str:
        while True:
            code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(6))
            if code not in self._rooms:
                return code

    async def _send_room_state(self, room: Room) -> None:
        payload = {"type": "room_state", "room": _room_response(room)}
        for user_id, player in list(room.players.items()):
            if player.connected and (socket := self._sockets.get(user_id)) is not None:
                try:
                    await socket.send_json(payload)
                except Exception:
                    # A failed send is equivalent to a dropped connection. Keep
                    # the room usable for everyone else and let a later attach
                    # reconnect this player.
                    if self._sockets.get(user_id) is socket:
                        self._sockets.pop(user_id, None)
                        player.connected = False
                        if room.active_player_id == user_id:
                            self._advance_turn(room, user_id)
                        room.version += 1

    def _cleanup_empty_rooms(self) -> None:
        now = utc_now()
        for code, room in list(self._rooms.items()):
            if any(player.connected for player in room.players.values()):
                continue
            if now - room.last_activity <= EMPTY_ROOM_TTL:
                continue
            self._rooms.pop(code, None)
            for user_id in room.players:
                self._room_by_user.pop(user_id, None)


room_manager = RoomManager()
