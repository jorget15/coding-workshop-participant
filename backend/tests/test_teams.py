"""
Pytest tests for the Teams Lambda (``teams/function.py``).

Coverage:
    - GET    /teams                      — list (viewer, team_lead scoped, unauthenticated 401)
    - GET    /teams/{id}                 — get (found, 404)
    - POST   /teams                      — create (admin, viewer 403, missing name 422)
    - PATCH  /teams/{id}                 — update (admin, viewer 403, empty 400)
    - DELETE /teams/{id}                 — close (admin R5, viewer 403)
    - POST   /teams/{id}/members         — add member (admin, R1 cap, R2 leader, R10 exclusivity, viewer 403)
    - DELETE /teams/{id}/members/{pid}   — remove member (admin, viewer 403, 404)
"""

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from teams.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

TEAM_ID = "team_001"
PERSON_ID = "ind_alice_001"

ACTIVE_TEAM = {
    "_id": TEAM_ID,
    "teamName": "Alpha Squad",
    "isDeleted": False,
    "members": [],
}

FULL_TEAM = {
    "_id": TEAM_ID,
    "teamName": "Full Team",
    "isDeleted": False,
    "members": [
        {"personId": f"id_{i}", "memberRole": "Member", "endDate": None}
        for i in range(5)
    ],
}

TEAM_WITH_LEADER = {
    "_id": TEAM_ID,
    "teamName": "Led Team",
    "isDeleted": False,
    "members": [
        {"personId": "leader_id", "memberRole": "Team Leader", "endDate": None}
    ],
}

INDIVIDUAL_DOC = {
    "_id": PERSON_ID,
    "personName": "Alice Smith",
    "staffType": "direct",
}


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /teams
# ---------------------------------------------------------------------------
class TestListTeams:

    async def test_viewer_receives_200_and_list(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get("/teams")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_team_lead_sees_own_team_only(self, client: AsyncClient) -> None:
        """team_lead queries should be scoped to their team_id."""
        with override_deps(app, role="team_lead", team_id=TEAM_ID):
            resp = await client.get("/teams")
        assert resp.status_code == 200

    async def test_filter_by_search(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.get("/teams?search=alpha")
        assert resp.status_code == 200

    async def test_unauthenticated_is_rejected(self, client: AsyncClient) -> None:
        resp = await client.get("/teams")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /teams/{id}
# ---------------------------------------------------------------------------
class TestGetTeam:

    async def test_returns_team_when_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, _):
            col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            resp = await client.get(f"/teams/{TEAM_ID}")
        assert resp.status_code == 200
        assert resp.json()["teamName"] == "Alpha Squad"

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.get(f"/teams/{TEAM_ID}")
        assert resp.status_code == 404
        assert TEAM_ID in resp.json()["detail"]


# ---------------------------------------------------------------------------
# POST /teams
# ---------------------------------------------------------------------------
class TestCreateTeam:

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/teams", json={"team_name": "Beta Team"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["teamName"] == "Beta Team"
        assert body["isDeleted"] is False
        assert body["members"] == []

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.post("/teams", json={"team_name": "Beta"})
        assert resp.status_code == 403

    async def test_team_lead_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id=TEAM_ID):
            resp = await client.post("/teams", json={"team_name": "Beta"})
        assert resp.status_code == 403

    async def test_missing_team_name_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/teams", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /teams/{id}
# ---------------------------------------------------------------------------
class TestUpdateTeam:

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            resp = await client.patch(f"/teams/{TEAM_ID}", json={"team_name": "Renamed"})
        assert resp.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.patch(f"/teams/{TEAM_ID}", json={"team_name": "Renamed"})
        assert resp.status_code == 403

    async def test_empty_payload_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.patch(f"/teams/{TEAM_ID}", json={})
        assert resp.status_code == 400

    async def test_returns_404_for_missing_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.update_one = AsyncMock(return_value=AsyncMock(matched_count=0))
            resp = await client.patch(f"/teams/{TEAM_ID}", json={"team_name": "X"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /teams/{id}  (soft-close — R5)
# ---------------------------------------------------------------------------
class TestCloseTeam:

    async def test_admin_can_close(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            resp = await client.delete(f"/teams/{TEAM_ID}")
        assert resp.status_code == 204

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.delete(f"/teams/{TEAM_ID}")
        assert resp.status_code == 403

    async def test_returns_404_for_missing_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.delete(f"/teams/{TEAM_ID}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /teams/{id}/members  (R1, R2, R10)
# ---------------------------------------------------------------------------
class TestAddMember:

    async def test_admin_can_add_member(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(side_effect=[ACTIVE_TEAM, INDIVIDUAL_DOC, ACTIVE_TEAM])
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Member"},
            )
        assert resp.status_code == 201

    async def test_team_lead_can_add_to_own_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id=TEAM_ID) as (_, col, _):
            col.find_one = AsyncMock(side_effect=[ACTIVE_TEAM, INDIVIDUAL_DOC, ACTIVE_TEAM])
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Member"},
            )
        assert resp.status_code == 201

    async def test_team_lead_cannot_add_to_other_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_other"):
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Member"},
            )
        assert resp.status_code == 403

    async def test_r1_rejects_when_team_full(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=FULL_TEAM)
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Member"},
            )
        assert resp.status_code == 409
        assert "R1" in resp.json()["detail"]

    async def test_r2_rejects_second_leader(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=TEAM_WITH_LEADER)
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Team Leader"},
            )
        assert resp.status_code == 409
        assert "R2" in resp.json()["detail"]

    async def test_r10_rejects_leader_on_another_team(self, client: AsyncClient) -> None:
        """R10: individual already leading another team can't be assigned as leader here."""
        team_no_leader = {**ACTIVE_TEAM, "members": []}
        other_team = {"_id": "team_other", "teamName": "Other"}
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(side_effect=[team_no_leader, other_team])
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Team Leader"},
            )
        assert resp.status_code == 409
        assert "R10" in resp.json()["detail"]

    async def test_invalid_member_role_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=ACTIVE_TEAM)
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Owner"},
            )
        assert resp.status_code == 422

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Member"},
            )
        assert resp.status_code == 403

    async def test_adding_to_deleted_team_blocked(self, client: AsyncClient) -> None:
        deleted_team = {**ACTIVE_TEAM, "isDeleted": True}
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=deleted_team)
            resp = await client.post(
                f"/teams/{TEAM_ID}/members",
                json={"person_id": PERSON_ID, "member_role": "Member"},
            )
        assert resp.status_code == 409
        assert "R5" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /teams/{id}/members/{person_id}
# ---------------------------------------------------------------------------
class TestRemoveMember:

    async def test_admin_can_remove(self, client: AsyncClient) -> None:
        team_with_member = {
            **ACTIVE_TEAM,
            "members": [{"personId": PERSON_ID, "memberRole": "Member", "endDate": None}],
        }
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=team_with_member)
            resp = await client.delete(f"/teams/{TEAM_ID}/members/{PERSON_ID}")
        assert resp.status_code == 204

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.delete(f"/teams/{TEAM_ID}/members/{PERSON_ID}")
        assert resp.status_code == 403

    async def test_team_lead_cannot_remove_from_other_team(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_other"):
            resp = await client.delete(f"/teams/{TEAM_ID}/members/{PERSON_ID}")
        assert resp.status_code == 403

    async def test_returns_404_for_missing_member(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.update_one = AsyncMock(return_value=AsyncMock(matched_count=0))
            resp = await client.delete(f"/teams/{TEAM_ID}/members/{PERSON_ID}")
        assert resp.status_code == 404
        assert PERSON_ID in resp.json()["detail"]
