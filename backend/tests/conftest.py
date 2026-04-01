"""
Shared pytest fixtures for all Lambda function tests.

Each Lambda's ``app.dependency_overrides`` is used to inject:
    - A mock Motor database (avoids real DocumentDB connections).
    - A mock ``CurrentUser`` (avoids real JWT verification).

Usage in a test module::

    from individuals.function import app
    from tests.conftest import override_deps

    async def test_something(async_client):
        with override_deps(app, role="system_admin"):
            response = await async_client.get("/individuals")
        assert response.status_code == 200
"""

import os
from contextlib import contextmanager
from typing import Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from shared.auth import CurrentUser, get_current_user
from shared.db import get_db


# ---------------------------------------------------------------------------
# Set dummy env vars for all tests so get_db/get_current_user don't KeyError
# when dependency_overrides are not in place (e.g. unauthenticated tests).
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_HOST", "localhost")
os.environ.setdefault("MONGO_PORT", "27017")
os.environ.setdefault("MONGO_USER", "")
os.environ.setdefault("MONGO_PASS", "")
os.environ.setdefault("MONGO_NAME", "acme_team_mgmt")
os.environ.setdefault("IS_LOCAL", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-in-mock-tests")
os.environ.setdefault("JWT_ALGORITHM", "HS256")


# ---------------------------------------------------------------------------
# User factories
# ---------------------------------------------------------------------------

def make_user(
    role: str = "system_admin",
    user_id: str = "test_user_id",
    username: str = "Test User",
    team_id: Optional[str] = None,
) -> CurrentUser:
    """Return a ``CurrentUser`` dataclass with the given role."""
    return CurrentUser(
        user_id=user_id,
        username=username,
        role=role,
        team_id=team_id,
    )


# ---------------------------------------------------------------------------
# Mock DB factory
# ---------------------------------------------------------------------------

def make_mock_db() -> tuple[MagicMock, MagicMock]:
    """
    Return ``(mock_db, mock_collection)`` where ``mock_db[<any>]`` returns
    ``mock_collection``.  Cursor-like methods (``find``, ``find_one``, etc.)
    are pre-configured as ``AsyncMock`` so ``await`` works without error.
    """
    mock_collection = MagicMock()
    mock_collection.find_one = AsyncMock(return_value=None)
    # Fluent cursor mock: find().sort().skip().limit().to_list() all chain correctly
    cursor_mock = MagicMock()
    cursor_mock.to_list = AsyncMock(return_value=[])
    cursor_mock.sort = MagicMock(return_value=cursor_mock)
    cursor_mock.skip = MagicMock(return_value=cursor_mock)
    cursor_mock.limit = MagicMock(return_value=cursor_mock)
    mock_collection.find = MagicMock(return_value=cursor_mock)
    mock_collection.insert_one = AsyncMock(return_value=MagicMock(
        inserted_id="507f1f77bcf86cd799439011"
    ))
    mock_collection.update_one = AsyncMock(return_value=MagicMock(
        matched_count=1, modified_count=1
    ))
    mock_collection.count_documents = AsyncMock(return_value=0)

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    return mock_db, mock_collection


# ---------------------------------------------------------------------------
# Dependency override context manager
# ---------------------------------------------------------------------------

@contextmanager
def override_deps(app, role: str = "system_admin", team_id: Optional[str] = None):
    """
    Context manager that overrides ``get_db`` and ``get_current_user`` on
    ``app`` for the duration of the ``with`` block.

    Example::

        with override_deps(app, role="viewer"):
            response = await client.get("/individuals")
    """
    mock_db, mock_collection = make_mock_db()
    user = make_user(role=role, team_id=team_id)

    async def _get_db_override():
        yield mock_db

    async def _get_user_override() -> CurrentUser:
        return user

    app.dependency_overrides[get_db] = _get_db_override
    app.dependency_overrides[get_current_user] = _get_user_override
    try:
        yield mock_db, mock_collection, user
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Async HTTP client fixture (plain — tests supply their own app)
# ---------------------------------------------------------------------------

@pytest.fixture
async def http_client_factory():
    """
    Async factory fixture.  Call with a FastAPI ``app`` to get an
    ``httpx.AsyncClient`` pointed at that app::

        client = await http_client_factory(some_app)
        response = await client.get("/health")
    """
    clients: list[AsyncClient] = []

    async def _make(app) -> AsyncClient:
        client = AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        )
        clients.append(client)
        return client

    yield _make

    for c in clients:
        await c.aclose()
