from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.presence import PresenceResponse
from app.services.presence import record_heartbeat

router = APIRouter(prefix="/presence", tags=["presence"])


@router.post("/heartbeat", response_model=PresenceResponse)
def heartbeat(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> PresenceResponse:
    timestamp = record_heartbeat(session, user)
    return PresenceResponse(online=True, last_seen_at=timestamp)
