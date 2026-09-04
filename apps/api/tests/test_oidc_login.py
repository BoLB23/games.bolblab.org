from __future__ import annotations

from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import app.api.routes.auth as auth_route
import app.auth.oidc as oidc
import app.db.session as db_session
from app.core.config import Settings, get_settings
from app.models.user import ClanRole, ExternalIdentity, User
from app.schemas.auth import UserResponse
from app.services.player import get_or_create_player, update_player


@pytest.fixture()
def oidc_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    transaction_secret = Fernet.generate_key().decode("ascii")
    monkeypatch.setenv("AUTH_MODE", "oidc")
    monkeypatch.setenv("OIDC_ISSUER", "https://accounts.google.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "google-client-id")
    monkeypatch.setenv("OIDC_CLIENT_SECRET", "google-client-secret")
    monkeypatch.setenv("OIDC_CALLBACK_URL", "http://localhost:6183/api/v1/auth/callback")
    monkeypatch.setenv("OIDC_TRANSACTION_SECRET", transaction_secret)
    get_settings.cache_clear()
    return get_settings()


def _complete_login(
    monkeypatch: pytest.MonkeyPatch,
    session: Session,
    settings: Settings,
    claims: dict[str, object],
) -> tuple[User, str, str]:
    assert settings.oidc_transaction_secret is not None
    verifier = Fernet(settings.oidc_transaction_secret.encode("ascii")).encrypt(b"verifier").decode("ascii")
    transaction = SimpleNamespace(nonce="provider-nonce", encrypted_code_verifier=verifier, return_path="/games")
    monkeypatch.setattr(oidc, "_consume_transaction", lambda *_args: transaction)
    monkeypatch.setattr(
        oidc,
        "_discovery",
        lambda _settings: {"token_endpoint": "https://example.test/token", "jwks_uri": "https://example.test/jwks"},
    )
    monkeypatch.setattr(oidc, "_tokens", lambda *_args: {"id_token": "mock-id-token"})
    monkeypatch.setattr(oidc, "_identity_claims", lambda *_args: claims)
    return oidc.complete_login(session, settings, "mock-code", "mock-state")


def _claims(
    *,
    subject: str = "google-subject-1",
    email: str = "player@example.com",
    email_verified: object = True,
    name: str = "Player One",
) -> dict[str, object]:
    return {
        "sub": subject,
        "email": email,
        "email_verified": email_verified,
        "name": name,
        "picture": "https://images.example.test/player.png",
    }


def test_google_first_login_jit_creates_a_peon_needing_player_setup(
    client: object, monkeypatch: pytest.MonkeyPatch, oidc_settings: Settings
) -> None:
    with db_session.SessionLocal() as session:
        user, return_path, subject = _complete_login(monkeypatch, session, oidc_settings, _claims())
        assert return_path == "/games"
        assert subject == "google-subject-1"
        assert user.role == ClanRole.PEON.value
        assert user.is_admin is False
        assert user.email_verified is True
        assert UserResponse.model_validate(user).needs_player_setup is True
        assert session.scalar(select(func.count()).select_from(User)) == 6
        identity = session.scalar(
            select(ExternalIdentity).where(
                ExternalIdentity.issuer == "https://accounts.google.com",
                ExternalIdentity.subject == "google-subject-1",
            )
        )
        assert identity is not None and identity.user_id == user.id


def test_google_repeat_login_reuses_the_same_issuer_subject_identity(
    client: object, monkeypatch: pytest.MonkeyPatch, oidc_settings: Settings
) -> None:
    with db_session.SessionLocal() as session:
        first, _, _ = _complete_login(monkeypatch, session, oidc_settings, _claims(name="First name"))
        user_id = first.id
        second, _, _ = _complete_login(monkeypatch, session, oidc_settings, _claims(name="Updated name"))
        assert second.id == user_id
        assert second.display_name == "Updated name"
        assert session.scalar(select(func.count()).select_from(User)) == 6
        assert session.scalar(select(func.count()).select_from(ExternalIdentity)) == 6


def test_verified_configured_overlord_email_is_promoted_case_insensitively(
    client: object, monkeypatch: pytest.MonkeyPatch, oidc_settings: Settings
) -> None:
    monkeypatch.setenv("OVERLORD_EMAIL", "  Owner@Example.COM ")
    get_settings.cache_clear()
    settings = get_settings()
    with db_session.SessionLocal() as session:
        user, _, _ = _complete_login(
            monkeypatch,
            session,
            settings,
            _claims(email="owner@example.com", email_verified=True),
        )
        assert user.role == ClanRole.OVERLORD.value
        assert user.is_admin is True


def test_unverified_matching_overlord_email_is_not_promoted(
    client: object, monkeypatch: pytest.MonkeyPatch, oidc_settings: Settings
) -> None:
    monkeypatch.setenv("OVERLORD_EMAIL", "owner@example.com")
    get_settings.cache_clear()
    settings = get_settings()
    with db_session.SessionLocal() as session:
        user, _, _ = _complete_login(
            monkeypatch,
            session,
            settings,
            _claims(email="OWNER@example.com", email_verified=False),
        )
        assert user.role == ClanRole.PEON.value
        assert user.is_admin is False
        assert user.email_verified is False


def test_disabled_google_identity_cannot_log_in(
    client: object, monkeypatch: pytest.MonkeyPatch, oidc_settings: Settings
) -> None:
    with db_session.SessionLocal() as session:
        user, _, _ = _complete_login(monkeypatch, session, oidc_settings, _claims())
        user.is_active = False
        session.commit()
        with pytest.raises(oidc.OidcError, match="Account is disabled"):
            _complete_login(monkeypatch, session, oidc_settings, _claims())


def test_player_setup_is_completed_only_when_player_is_saved(client: object) -> None:
    with db_session.SessionLocal() as session:
        user = User(display_name="New player", role=ClanRole.PEON.value)
        session.add(user)
        session.commit()
        assert user.needs_player_setup is True

        get_or_create_player(session, user)
        session.commit()
        assert user.needs_player_setup is True

        update_player(session, user, {})
        assert user.needs_player_setup is False


def test_oidc_callback_is_bound_to_the_login_browser(
    client: object, monkeypatch: pytest.MonkeyPatch, oidc_settings: Settings
) -> None:
    test_client = client
    assert hasattr(test_client, "get")
    user = None
    with db_session.SessionLocal() as session:
        user = session.scalar(select(User).where(User.display_name == "Ada Admin"))
    assert user is not None
    monkeypatch.setattr(auth_route, "start_login", lambda *_args: "https://accounts.google.com/auth?state=browser-state")
    login = test_client.get("/api/v1/auth/login", follow_redirects=False)
    assert login.status_code == 303
    assert "game_platform_oidc_tx=browser-state" in login.headers["set-cookie"]

    def complete(*_args: object) -> tuple[User, str, str]:
        return user, "/", "subject"

    monkeypatch.setattr(auth_route, "complete_login", complete)
    isolated = type(test_client)(test_client.app)
    rejected = isolated.get(
        "/api/v1/auth/callback?code=code&state=browser-state", follow_redirects=False
    )
    assert rejected.status_code == 303
    assert "google_login_failed" in rejected.headers["location"]
    accepted = test_client.get(
        "/api/v1/auth/callback?code=code&state=browser-state", follow_redirects=False
    )
    assert accepted.status_code == 303
    assert accepted.headers["location"].endswith("/")
    assert "game_platform_session=" in accepted.headers["set-cookie"]
    assert "game_platform_oidc_tx=" in accepted.headers["set-cookie"]
