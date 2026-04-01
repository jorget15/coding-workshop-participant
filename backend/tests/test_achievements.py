"""
Pytest tests for the Achievements Lambda (``achievements/function.py``).

Coverage:
    - GET  /achievements         — list with filters (scope, teamId, individualId)
    - GET  /achievements/{id}    — get by ID (found / not-found)
    - POST /achievements         — create (admin / team_lead)
    - PATCH /achievements/{id}   — update (admin / team_lead)
"""

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from achievements.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

ACHIEVEMENT_ID = "707f1f77bcf86cd799439033"
TEAM_ID = "607f1f77bcf86cd799439022"
INDIVIDUAL_ID = "507f1f77bcf86cd799439011"

EXISTING_ACHIEVEMENT = {
    "_id": ACHIEVEMENT_ID,
    "title": "Q1 Top Performer",
    "scope": "team",
    "team_id": TEAM_ID,
    "individual_id": INDIVIDUAL_ID,
    "isActive": True,
}

VALID_PAYLOAD = {
    "title": "Q2 Innovation Award",
    "description": "Recognised for exceptional innovation",
    "scope": "team",
    "team_id": TEAM_ID,
    "individual_id": INDIVIDUAL_ID,
}

ORG_PAYLOAD = {
    "title": "Company Compliance Badge",
    "description": "Completed mandatory compliance training",
    "scope": "org",
}


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTPX client wired to the Achievements Lambda app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /achievements
# ---------------------------------------------------------------------------

class TestListAchievements:
    """Tests for listing achievements with optional filters."""

    async def test_viewer_receives_200_and_list(self, client: AsyncClient) -> None:
        """Viewers should be able to list achievements."""
        with override_deps(app, role="viewer"):
            response = await client.get("/achievements")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_filter_by_team_id(self, client: AsyncClient) -> None:
        """Filtering by team_id should be accepted and return a list."""
        with override_deps(app, role="viewer"):
            response = await client.get(f"/achievements?team_id={TEAM_ID}")
        assert response.status_code == 200

    async def test_filter_by_individual_id(self, client: AsyncClient) -> None:
        """Filtering by individual_id should be accepted and return a list."""
        with override_deps(app, role="viewer"):
            response = await client.get(f"/achievements?individual_id={INDIVIDUAL_ID}")
        assert response.status_code == 200

    async def test_filter_by_scope_org(self, client: AsyncClient) -> None:
        """Filtering by scope=org should be accepted and return a list."""
        with override_deps(app, role="viewer"):
            response = await client.get("/achievements?scope=org")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# GET /achievements/{id}
# ---------------------------------------------------------------------------

class TestGetAchievement:
    """Tests for retrieving a single achievement by ID."""

    async def test_returns_achievement_when_found(self, client: AsyncClient) -> None:
        """Should return the achievement document when it exists."""
        with override_deps(app, role="viewer") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)
            response = await client.get(f"/achievements/{ACHIEVEMENT_ID}")
        assert response.status_code == 200
        assert response.json()["title"] == "Q1 Top Performer"

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        """Should return 404 when no achievement matches the given ID."""
        with override_deps(app, role="viewer") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=None)
            response = await client.get(f"/achievements/{ACHIEVEMENT_ID}")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /achievements
# ---------------------------------------------------------------------------

class TestCreateAchievement:
    """Tests for creating a new achievement."""

    async def test_admin_can_create_team_achievement(self, client: AsyncClient) -> None:
        """Admin should be able to create a team-scoped achievement (201)."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value={"_id": TEAM_ID, "status": "Active"})
            response = await client.post("/achievements", json=VALID_PAYLOAD)
        assert response.status_code == 201

    async def test_admin_can_create_org_achievement(self, client: AsyncClient) -> None:
        """Admin should be able to create an org-scoped (bounty) achievement (201)."""
        with override_deps(app, role="system_admin"):
            response = await client.post("/achievements", json=ORG_PAYLOAD)
        assert response.status_code == 201

    async def test_team_lead_can_create_for_own_team(self, client: AsyncClient) -> None:
        """Team lead should be able to create an achievement scoped to their team."""
        with override_deps(app, role="team_lead", team_id=TEAM_ID) as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value={"_id": TEAM_ID, "status": "Active"})
            response = await client.post("/achievements", json=VALID_PAYLOAD)
        assert response.status_code == 201

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to create achievements (403)."""
        with override_deps(app, role="viewer"):
            response = await client.post("/achievements", json=VALID_PAYLOAD)
        assert response.status_code == 403

    async def test_missing_title_rejected(self, client: AsyncClient) -> None:
        """Payload without title must be rejected with 422."""
        with override_deps(app, role="system_admin"):
            response = await client.post(
                "/achievements", json={"scope": "team", "team_id": TEAM_ID}
            )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /achievements/{id}
# ---------------------------------------------------------------------------

class TestUpdateAchievement:
    """Tests for partially updating an achievement."""

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        """Admin should be able to patch an existing achievement (200)."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)
            response = await client.patch(
                f"/achievements/{ACHIEVEMENT_ID}",
                json={"title": "Updated Title"},
            )
        assert response.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to update achievements (403)."""
        with override_deps(app, role="viewer"):
            response = await client.patch(
                f"/achievements/{ACHIEVEMENT_ID}",
                json={"title": "Hacked Title"},
            )
        assert response.status_code == 403

    async def test_returns_404_for_missing_achievement(self, client: AsyncClient) -> None:
        """Patching a non-existent achievement should return 404."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=None)
            response = await client.patch(
                f"/achievements/{ACHIEVEMENT_ID}",
                json={"title": "Ghost"},
            )
        assert response.status_code == 404
