import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get_user(session: Session, user_id: uuid.UUID) -> User | None:
    return session.get(User, user_id)


def list_active_users(session: Session) -> list[User]:
    return list(session.scalars(select(User).where(User.is_active.is_(True)).order_by(User.display_name)))
