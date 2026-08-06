from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_overlord
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.clan import ClanMemberResponse, ClanRoleUpdateRequest
from app.services.clan import get_clan_member, list_clan_members, update_role

router = APIRouter(prefix="/clan", tags=["clan"])


@router.get("/members", response_model=list[ClanMemberResponse])
def clan_members(
    _user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, object]]:
    return list_clan_members(session, settings=settings)


@router.get("/members/{user_id}", response_model=ClanMemberResponse)
def clan_member(
    user_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    member = get_clan_member(session, user_id=user_id, settings=settings)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clan member not found")
    return member


@router.patch("/members/{user_id}/role", response_model=ClanMemberResponse)
def clan_member_role(
    user_id: uuid.UUID,
    payload: ClanRoleUpdateRequest,
    actor: User = Depends(require_overlord),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    if actor.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Users cannot change their own role")
    target = session.get(User, user_id)
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clan member not found")
    update_role(session, target=target, role=payload.role)
    member = get_clan_member(session, user_id=user_id, settings=settings)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clan member not found")
    return member
