from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.save import GameSaveMetadataResponse, GameSavePutRequest, GameSaveResponse
from app.services.saves import SaveError, delete_save, get_save, list_saves, put_save

router = APIRouter(prefix="/games/{game_slug}/saves", tags=["saves"])


def _handle_error(error: SaveError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=jsonable_encoder(error.detail))


@router.get("", response_model=list[GameSaveMetadataResponse])
def saves(
    game_slug: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> list[dict[str, object]]:
    try:
        return list_saves(session, game_slug=game_slug, user=user)
    except SaveError as error:
        raise _handle_error(error) from error


@router.get("/{slot_key}", response_model=GameSaveResponse)
def save_detail(
    game_slug: str,
    slot_key: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> dict[str, object]:
    try:
        return get_save(session, game_slug=game_slug, slot_key=slot_key, user=user)
    except SaveError as error:
        raise _handle_error(error) from error


@router.put("/{slot_key}", response_model=GameSaveResponse)
def save_put(
    game_slug: str,
    slot_key: str,
    payload: GameSavePutRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        return put_save(
            session,
            game_slug=game_slug,
            slot_key=slot_key,
            user=user,
            data=payload.data,
            game_version=payload.game_version,
            schema_version=payload.schema_version,
            expected_revision=payload.expected_revision,
            settings=settings,
        )
    except SaveError as error:
        raise _handle_error(error) from error


@router.delete("/{slot_key}", status_code=status.HTTP_204_NO_CONTENT)
def save_delete(
    game_slug: str,
    slot_key: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> Response:
    try:
        delete_save(session, game_slug=game_slug, slot_key=slot_key, user=user)
    except SaveError as error:
        raise _handle_error(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
