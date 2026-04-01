"""
Pytest tests for the Teams Lambda (``teams/function.py``).

Coverage:
    - GET  /teams                      — list (viewer+)
    - GET  /teams/{id}                 — get by ID (found / not-found)
    - POST /teams                      — create (admin only)
    - PATCH /teams/{id}                — update (admin / team_lead)
    - DELETE /teams/{id}               — soft-close (admin only, R5)
    - POST /teams/{id}/members         — add member (R1, R2, R10)
    - DELETE /teams/{id}/members/{mid} — remove member (admin / team_lead)
"""

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from teams.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

TEAM_ID = "607f1f77bcf86cd799439022"
INDIVIDUAL_ID = "507f1f77bcf86cd799439011"

ACTIVE_TEAM = {
    "_id": TEAM_ID,
    "team_name": "Alpha Squad",
    "status": "Active",
    "members": [],
}

FULL_TEAM = {
    "_id": TEAM_ID,
    "teamName": "Full Team",
    "status": "Active",
    "members": [
        {"individualId": f"id_{i}", "memberRole": "Member", "endDate": None}
        for i in range(5)
    ],
}

TEAM_WITH_LEADER = {
    "_id": TEAM_ID,
    "teamName": "Led Team",
    "status": "Active",
    "members": [
        {"individualId": "leader_id", "memberRole": "Team Leader", "endDate": None}
    ],
}


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTPX client wired to the Teams Lambda app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /teams
# ---------------------------------------------------------------------------

class TestListTeams:
    """Tests for listing all teams."""

    async def test_viewer_receives_200_and_list(self, client: AsyncClient) -> None:
        """Viewers should be able to list all active teams."""
        with override_deps(app, role="viewer"):
            response = await client.get("/teams")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_unauthenticated_is_rejected(self, client: AsyncClient) -> None:
        """Requests without a valid token must be rejected (401)."""
        response = await client.get("/teams")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /teams/{id}
# ---------------------------------------------------------------------------

class TestGetTeam:
    """Tests for retrieving a single team by ID."""

    async def test_returns_team_when_found(self, client: AsyncClient) -> None:
        """Should return the team document when it exists."""
        with override_deps(app, role="viewer") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            response = await client.get(f"/teams/{TEAM_ID}")
        assert response.status_code == 200
        assert response.json()["team_name"] == "Alpha Squad"

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        """Should return 404 when no team matches the given ID."""
        with override_deps(app, role="viewer") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=None)
            response = await client.get(f"/teams/{TEAM_ID}")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /teams
# ---------------------------------------------------------------------------

class TestCreateTeam:
    """Tests for creating a new team."""

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        """System admin should be able to create a new team (201)."""
        with override_deps(app, role="system_admin"):
            response = await client.post("/teams", json={"team_name": "Beta Team"})
        assert response.status_code == 201

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to create teams (403)."""
        with override_deps(app, role="viewer"):
            response = await client.post("/teams", json={"team_name": "Beta Team"})
        assert response.status_code == 403

    async def test_missing_team_name_rejected(self, client: AsyncClient) -> None:
        """Payload without team_name must be rejected with 422."""
        with override_deps(app, role="system_admin"):
            response = await client.post("/teams", json={})
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /teams/{id}
# ---------------------------------------------------------------------------

class TestUpdateTeam:
    """Tests for partially updating a team."""

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        """Admin should be able to patch an existing team (200)."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            response = await client.patch(
                f"/teams/{TEAM_ID}", json={"team_name": "Renamed Squad"}
            )
        assert response.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to update teams (403)."""
        with override_deps(app, role="viewer"):
            response = await client.patch(
                f"/teams/{TEAM_ID}", json={"team_name": "Renamed"}
            )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /teams/{id}  (soft-close — R5)
# ---------------------------------------------------------------------------

class TestCloseTeam:
    """Tests for soft-closing a team (R5 — no hard deletes)."""

    async def test_admin_can_close(self, client: AsyncClient) -> None:
        """Admin should be able to close a team (sets status: Closed) — returns 204."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            response = await client.delete(f"/teams/{TEAM_ID}")
        assert response.status_code == 204

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to close teams (403)."""
        with override_deps(app, role="viewer"):
            response = await client.delete(f"/teams/{TEAM_ID}")
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /teams/{id}/members  (R1, R2, R10)
# ---------------------------------------------------------------------------

class TestAddMember:
    """Tests for adding a member to a team."""

    async def test_admin_can_add_member(self, client: AsyncClient) -> None:
        """Admin should be able to add a Member to a team with capacity."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            response = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"individual_id": INDIVIDUAL_ID, "member_role": "Member"},
            )
        assert response.status_code == 201

    async def test_r1_rejects_when_team_full(self, client: AsyncClient) -> None:
        """R1: adding a 6th active Member must be rejected with 409."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=FULL_TEAM)
            response = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"individual_id": INDIVIDUAL_ID, "member_role": "Member"},
            )
        assert response.status_code == 409
        assert "R1" in response.json()["detail"]

    async def test_r2_rejects_second_team_leader(self, client: AsyncClient) -> None:
        """R2: adding a second Team Leader must be rejected with 409."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=TEAM_WITH_LEADER)
            response = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"individual_id": INDIVIDUAL_ID, "member_role": "Team Leader"},
            )
        assert response.status_code == 409
        assert "R2" in response.json()["detail"]

    async def test_invalid_member_role_rejected(self, client: AsyncClient) -> None:
        """Payload with an invalid member_role must be rejected with 422."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            response = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"individual_id": INDIVIDUAL_ID, "member_role": "Owner"},
            )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /teams/{id}/members/{individual_id}
# ---------------------------------------------------------------------------

class TestRemoveMember:
    """Tests for removing a member from a team."""

    async def test_admin_can_remove_member(self, client: AsyncClient) -> None:
        """Admin should be able to remove a member from a team (204)."""
        team_with_member = {
            **ACTIVE_TEAM,
            "members": [
                {"individualId": INDIVIDUAL_ID, "memberRole": "Member", "endDate": None}
            ],
        }
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=team_with_member)
            response = await client.delete(
                f"/teams/{TEAM_ID}/members/{INDIVIDUAL_ID}"
            )
        assert response.status_code == 204

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to remove members (403)."""
        with override_deps(app, role="viewer"):
            response = await client.delete(
                f"/teams/{TEAM_ID}/members/{INDIVIDUAL_ID}"
            )
        assert response.status_code == 403
