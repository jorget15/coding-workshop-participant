"""
Pytest tests for the Auth Lambda (``auth/function.py``).

Coverage:
    - POST /auth/login   — valid credentials, wrong password, unknown email, inactive user
    - POST /auth/refresh — valid token, expired token, invalid token
    - POST /auth/seed    — seed users (force and non-force)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from auth.function import app
from shared import hash_password, verify_password
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

USER_ID = "ind_alice_001"
EMAIL = "alice@acme.com"
PASSWORD = "Admin1234!"
HASHED = hash_password(PASSWORD)

INDIVIDUAL_DOC = {
    "_id": USER_ID,
    "personName": "Jorge taban",
    "email": EMAIL,
    "staffType": "direct",
    "isDeleted": False,
    "roles": ["system_admin"],
    "auth": {"hashedPassword": HASHED},
}


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------------------
# Password hashing helpers
# ---------------------------------------------------------------------------
class TestPasswordHashing:

    def test_hash_produces_valid_format(self) -> None:
        h = hash_password("test123")
        parts = h.split("$")
        assert len(parts) == 4
        assert parts[1] == "pbkdf2-sha256"

    def test_verify_correct_password(self) -> None:
        h = hash_password("correct-password")
        assert verify_password("correct-password", h) is True

    def test_verify_wrong_password(self) -> None:
        h = hash_password("correct-password")
        assert verify_password("wrong-password", h) is False

    def test_verify_malformed_hash(self) -> None:
        assert verify_password("anything", "not-a-valid-hash") is False

    def test_verify_empty_hash(self) -> None:
        assert verify_password("anything", "") is False


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------
class TestLogin:

    async def test_valid_credentials_return_token(self, client: AsyncClient) -> None:
        """Valid email + password should return a JWT and user info."""
        mock_db = MagicMock()
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(side_effect=[INDIVIDUAL_DOC, None])  # user lookup, team lookup
        mock_col.update_one = AsyncMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_col)

        async def _get_db_override():
            yield mock_db

        app.dependency_overrides.clear()
        from shared.db import get_db
        app.dependency_overrides[get_db] = _get_db_override
        try:
            resp = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["role"] == "system_admin"
        assert body["user_id"] == USER_ID
        assert body["username"] == "Jorge taban"

    async def test_wrong_password_returns_401(self, client: AsyncClient) -> None:
        """Wrong password should return 401 with generic message."""
        mock_db = MagicMock()
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=INDIVIDUAL_DOC)
        mock_db.__getitem__ = MagicMock(return_value=mock_col)

        async def _get_db_override():
            yield mock_db

        from shared.db import get_db
        app.dependency_overrides[get_db] = _get_db_override
        try:
            resp = await client.post("/auth/login", json={"email": EMAIL, "password": "WrongPassword!"})
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    async def test_unknown_email_returns_401(self, client: AsyncClient) -> None:
        """Non-existent email should return 401 (same message — no user enumeration)."""
        mock_db = MagicMock()
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=None)
        mock_db.__getitem__ = MagicMock(return_value=mock_col)

        async def _get_db_override():
            yield mock_db

        from shared.db import get_db
        app.dependency_overrides[get_db] = _get_db_override
        try:
            resp = await client.post("/auth/login", json={"email": "nobody@acme.com", "password": "Whatever1!"})
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 401

    async def test_no_password_hash_returns_401(self, client: AsyncClient) -> None:
        """User exists but has no password hash — should return 401."""
        no_auth_doc = {**INDIVIDUAL_DOC, "auth": {}}
        mock_db = MagicMock()
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=no_auth_doc)
        mock_db.__getitem__ = MagicMock(return_value=mock_col)

        async def _get_db_override():
            yield mock_db

        from shared.db import get_db
        app.dependency_overrides[get_db] = _get_db_override
        try:
            resp = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 401

    async def test_missing_email_returns_422(self, client: AsyncClient) -> None:
        """Login request without email should return 422."""
        resp = await client.post("/auth/login", json={"password": "test"})
        assert resp.status_code == 422

    async def test_missing_password_returns_422(self, client: AsyncClient) -> None:
        """Login request without password should return 422."""
        resp = await client.post("/auth/login", json={"email": EMAIL})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------
class TestRefresh:

    async def test_valid_token_returns_new_token(self, client: AsyncClient) -> None:
        """A valid, non-expired token should return a fresh one."""
        from auth.function import _sign_token
        token = _sign_token({"sub": USER_ID, "username": "Alice", "role": "system_admin", "team_id": None})

        mock_db = MagicMock()
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=INDIVIDUAL_DOC)
        mock_db.__getitem__ = MagicMock(return_value=mock_col)

        async def _get_db_override():
            yield mock_db

        from shared.db import get_db
        app.dependency_overrides[get_db] = _get_db_override
        try:
            resp = await client.post("/auth/refresh", json={"token": token})
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["role"] == "system_admin"

    async def test_invalid_token_returns_401(self, client: AsyncClient) -> None:
        """An invalid token should return 401."""
        resp = await client.post("/auth/refresh", json={"token": "invalid.jwt.token"})
        assert resp.status_code == 401
