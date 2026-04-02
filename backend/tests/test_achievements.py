"""
Pytest tests for the Achievements Lambda (``achievements/function.py``).

Coverage:
    - GET   /achievements           — list (viewer, team_lead scoped, filters)
    - GET   /achievements/{id}      — get (viewer, 404, visibility check)
    - POST  /achievements           — create (admin, team_lead own team, team_lead other team 403, viewer 403, missing title 422)
    - PATCH /achievements/{id}      — update (admin, team_lead creator, non-creator 403, viewer 403, 404, empty 400)
"""

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from achievements.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

ACHIEVEMENT_ID = "ach_001"
TEAM_ID = "team_001"
PERSON_ID = "ind_alice_001"

EXISTING_ACHIEVEMENT = {
    "_id": ACHIEVEMENT_ID,
    "title": "Q1 Top Performer",
    "description": "Excellent delivery in Q1",
    "teamId": TEAM_ID,
    "awardedTo": [PERSON_ID],
    "achievementDate": "2026-03-15",
    "createdBy": "admin_user",
}

VALID_PAYLOAD = {
    "title": "Q2 Innovation Award",
    "description": "Recognised for exceptional innovation",
    "team_id": TEAM_ID,
    "awarded_to": [PERSON_ID],
}

ORG_PAYLOAD = {
    "title": "Company Compliance Badge",
    "description": "Completed mandatory compliance training",
    "scope": "org",
}


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /achievements
# ---------------------------------------------------------------------------
class TestListAchievements:

    async def test_viewer_receives_200_and_list(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get("/achievements")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_filter_by_team_id(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get(f"/achievements?team_id={TEAM_ID}")
        assert resp.status_code == 200

    async def test_filter_by_individual_id(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get(f"/achievements?individual_id={PERSON_ID}")
        assert resp.status_code == 200

    async def test_filter_by_date_range(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get("/achievements?from_date=2026-01-01&to_date=2026-12-31")
        assert resp.status_code == 200

    async def test_team_lead_scoped_to_own_team(self, client: AsyncClient) -> None:
        """team_lead queries should be automatically filtered to their team_id."""
        with override_deps(app, role="team_lead", team_id=TEAM_ID):
            resp = await client.get("/achievements")
        assert resp.status_code == 200

    async def test_unauthenticated_is_rejected(self, client: AsyncClient) -> None:
        resp = await client.get("/achievements")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /achievements/{id}
# ---------------------------------------------------------------------------
class TestGetAchievement:

    async def test_returns_achievement_when_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)
            resp = await client.get(f"/achievements/{ACHIEVEMENT_ID}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["title"] == "Q1 Top Performer"
        assert body["teamId"] == TEAM_ID

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.get(f"/achievements/{ACHIEVEMENT_ID}")
        assert resp.status_code == 404
        assert ACHIEVEMENT_ID in resp.json()["detail"]

    async def test_recipient_can_view(self, client: AsyncClient) -> None:
        """An individual who is in the awardedTo list should be able to view."""
        with override_deps(app, role="non-direct") as (_, col, user):
            doc = {**EXISTING_ACHIEVEMENT, "awardedTo": [user.user_id]}
            col.find_one = AsyncMock(return_value=doc)
            resp = await client.get(f"/achievements/{ACHIEVEMENT_ID}")
        assert resp.status_code == 200

    async def test_non_recipient_non_admin_denied(self, client: AsyncClient) -> None:
        """A non-direct user NOT in awardedTo and NOT on the team should get 403."""
        with override_deps(app, role="non-direct") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)
            resp = await client.get(f"/achievements/{ACHIEVEMENT_ID}")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /achievements
# ---------------------------------------------------------------------------
class TestCreateAchievement:

    async def test_admin_can_create_team_achievement(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value={"_id": TEAM_ID})
            resp = await client.post("/achievements", json=VALID_PAYLOAD)
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Q2 Innovation Award"

    async def test_admin_can_create_org_achievement(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/achievements", json=ORG_PAYLOAD)
        assert resp.status_code == 201

    async def test_team_lead_can_create_for_own_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id=TEAM_ID) as (_, col, _):
            col.find_one = AsyncMock(return_value={"_id": TEAM_ID})
            resp = await client.post("/achievements", json=VALID_PAYLOAD)
        assert resp.status_code == 201

    async def test_team_lead_cannot_create_for_other_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_other") as (_, col, _):
            col.find_one = AsyncMock(return_value={"_id": TEAM_ID})
            resp = await client.post("/achievements", json=VALID_PAYLOAD)
        assert resp.status_code == 403

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.post("/achievements", json=VALID_PAYLOAD)
        assert resp.status_code == 403

    async def test_missing_title_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/achievements", json={"team_id": TEAM_ID})
        assert resp.status_code == 422

    async def test_nonexistent_team_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.post("/achievements", json=VALID_PAYLOAD)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /achievements/{id}
# ---------------------------------------------------------------------------
class TestUpdateAchievement:

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)
            resp = await client.patch(f"/achievements/{ACHIEVEMENT_ID}", json={"title": "Updated"})
        assert resp.status_code == 200

    async def test_creating_team_lead_can_update(self, client: AsyncClient) -> None:
        """The team_lead who created the achievement should be able to update it."""
        with override_deps(app, role="team_lead", team_id=TEAM_ID) as (_, col, user):
            doc = {**EXISTING_ACHIEVEMENT, "createdBy": user.user_id}
            col.find_one = AsyncMock(return_value=doc)
            resp = await client.patch(f"/achievements/{ACHIEVEMENT_ID}", json={"title": "Updated"})
        assert resp.status_code == 200

    async def test_non_creator_team_lead_forbidden(self, client: AsyncClient) -> None:
        """A team_lead who did NOT create the achievement cannot update it."""
        with override_deps(app, role="team_lead", team_id=TEAM_ID) as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)  # createdBy != user
            resp = await client.patch(f"/achievements/{ACHIEVEMENT_ID}", json={"title": "X"})
        assert resp.status_code == 403

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.patch(f"/achievements/{ACHIEVEMENT_ID}", json={"title": "X"})
        assert resp.status_code == 403

    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.patch(f"/achievements/{ACHIEVEMENT_ID}", json={"title": "X"})
        assert resp.status_code == 404

    async def test_empty_payload_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_ACHIEVEMENT)
            resp = await client.patch(f"/achievements/{ACHIEVEMENT_ID}", json={})
        assert resp.status_code == 400
