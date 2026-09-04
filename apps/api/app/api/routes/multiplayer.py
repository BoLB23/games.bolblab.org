from __future__ import annotations

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

import app.db.session as db_session
from app.auth.session import get_session
from app.core.config import Settings, get_settings
from app.models.user import User
from app.repositories.users import get_user
from app.services.multiplayer import room_manager

router = APIRouter(tags=["disc golf multiplayer"])


def _websocket_user(websocket: WebSocket, settings: Settings) -> User | None:
    with db_session.SessionLocal() as session:
        platform_session = get_session(session, websocket.cookies.get(settings.session_cookie_name))
        user = get_user(session, platform_session.user_id) if platform_session is not None else None
        if user is None or not user.is_active:
            return None
        # RoomManager stores only these scalar values, so the detached model is safe.
        session.expunge(user)
        return user


@router.websocket("/games/disc-golf-with-friends/multiplayer")
async def disc_golf_multiplayer(
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
) -> None:
    origin = websocket.headers.get("origin")
    if origin not in settings.cors_allowed_origins:
        await websocket.close(code=4403, reason="Unapproved browser origin")
        return
    user = _websocket_user(websocket, settings)
    if user is None:
        await websocket.close(code=4401, reason="Authentication is required")
        return
    await websocket.accept()
    await room_manager.attach(websocket, user)
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"type": "error", "message": "Send a JSON multiplayer command"})
                continue
            await room_manager.handle(websocket, user, payload)
    except WebSocketDisconnect:
        await room_manager.disconnect(user.id)
