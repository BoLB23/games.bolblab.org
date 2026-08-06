from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.player import PlayerResponse, PlayerUpdateRequest
from app.services.player import get_or_create_player, update_player

router = APIRouter(prefix="/me", tags=["player"])


@router.get("/player", response_model=PlayerResponse)
def current_player(user: User = Depends(get_current_user), session: Session = Depends(get_db_session)) -> object:
    profile = get_or_create_player(session, user)
    session.commit()
    session.refresh(profile)
    return profile


@router.put("/player", response_model=PlayerResponse)
def update_current_player(
    payload: PlayerUpdateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> object:
    return update_player(session, user, payload.model_dump(exclude_unset=True))
