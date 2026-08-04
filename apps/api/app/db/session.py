from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, event
from sqlalchemy import create_engine as sqlalchemy_create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine: Engine
SessionLocal: sessionmaker[Session]


def _enable_sqlite_foreign_keys(dbapi_connection: object, _connection_record: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if make_url(database_url).get_backend_name() == "sqlite" else {}
    new_engine = sqlalchemy_create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
    if make_url(database_url).get_backend_name() == "sqlite":
        event.listen(new_engine, "connect", _enable_sqlite_foreign_keys)
    return new_engine


def configure_database(database_url: str | None = None) -> None:
    global engine, SessionLocal
    if "engine" in globals():
        engine.dispose()
    engine = create_engine(database_url or get_settings().database_url)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


configure_database()
