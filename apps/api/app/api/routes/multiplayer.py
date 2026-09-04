from __future__ import annotations

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select

import app.db.session as db_session
from app.auth.session import get_session
from app.core.config import Settings, get_settings
from app.models.game import Game
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
    # CORS is a broad browser transport policy. Multiplayer has a narrower
    # authority boundary: only the origin configured for this game may open
    # its room socket. This remains strict even when other games are allowed
    # by GAME_CORS_ALLOWED_ORIGINS.
    if not origin or not settings.disc_golf_with_friends_origin or origin != settings.disc_golf_with_friends_origin:
        await websocket.close(code=4403, reason="Unapproved browser origin")
        return
    user = _websocket_user(websocket, settings)
    if user is None:
        await websocket.close(code=4401, reason="Authentication is required")
        return
    with db_session.SessionLocal() as session:
        game = session.scalar(
            select(Game).where(Game.slug == "disc-golf-with-friends", Game.status == "playable")
        )
    if game is None or not game.supports_multiplayer:
        await websocket.close(code=4404, reason="Multiplayer is unavailable")
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
        pass
    finally:
        await room_manager.disconnect(user.id, websocket)
