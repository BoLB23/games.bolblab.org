from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SESSION_SECRET", "test-session-secret-that-is-long-enough")
os.environ.setdefault("APP_ENV", "development")

import app.db.session as db_session
from app.core.config import get_settings
from app.db.base import Base
from app.main import create_app
from app.services.seed import seed_database


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    database_path = tmp_path / "platform.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()
    db_session.configure_database(get_settings().database_url)
    Base.metadata.create_all(db_session.engine)
    with db_session.SessionLocal() as session:
        seed_database(session, "http://localhost:5174")
    with TestClient(create_app()) as test_client:
        yield test_client
    Base.metadata.drop_all(db_session.engine)
    get_settings.cache_clear()


@pytest.fixture()
def authenticated_client(client: TestClient) -> TestClient:
    users = client.get("/api/v1/auth/dev/users").json()
    response = client.post("/api/v1/auth/dev/login", json={"user_id": users[0]["id"]})
    assert response.status_code == 200
    return client
