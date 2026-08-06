from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.session import read_session_value
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.user import ClanRole, User
from app.repositories.users import get_user


def get_current_user(
    request: Request,
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> User:
    value = request.cookies.get(settings.session_cookie_name)
    user_id = read_session_value(settings, value) if value else None
    user = get_user(session, user_id) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return user


def require_development(settings: Settings = Depends(get_settings)) -> Settings:
    if settings.app_env != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Development authentication is disabled")
    return settings


def require_overlord(user: User = Depends(get_current_user)) -> User:
    if user.role != ClanRole.OVERLORD.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Overlord access is required")
    return user
