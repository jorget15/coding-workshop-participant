"""
Pytest tests for the Metadata Lambda (``metadata/function.py``).

Coverage:
    - GET    /metadata/enums                — static values (public, no auth required)
    - GET    /metadata/locations             — list (viewer, admin)
    - GET    /metadata/locations/{id}        — get (found, 404)
    - POST   /metadata/locations             — create (admin, viewer 403, dup 409, missing city 422)
    - PATCH  /metadata/locations/{id}        — update (admin, viewer 403, 404, empty 400)
    - DELETE /metadata/locations/{id}        — soft-delete (admin, viewer 403, 404)
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from metadata.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

LOCATION_ID = "loc_hq"

EXISTING_LOCATION = {
    "_id": LOCATION_ID,
    "name": "NYC HQ",
    "city": "New York",
    "country": "USA",
    "region": "Northeast",
    "isActive": True,
}

VALID_PAYLOAD = {
    "name": "SF Office",
    "city": "San Francisco",
    "country": "USA",
}


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /metadata/enums
# ---------------------------------------------------------------------------
class TestEnums:

    async def test_returns_200_without_auth(self, client: AsyncClient) -> None:
        """Enums endpoint is public — no auth required."""
        resp = await client.get("/metadata/enums")
        assert resp.status_code == 200

    async def test_contains_required_keys(self, client: AsyncClient) -> None:
        resp = await client.get("/metadata/enums")
        data = resp.json()
        assert "staff_types" in data
        assert "member_roles" in data
        assert "user_roles" in data

    async def test_staff_types_match_schema(self, client: AsyncClient) -> None:
        resp = await client.get("/metadata/enums")
        assert set(resp.json()["staff_types"]) == {"direct", "non-direct"}

    async def test_member_roles_match_schema(self, client: AsyncClient) -> None:
        resp = await client.get("/metadata/enums")
        assert set(resp.json()["member_roles"]) == {"Team Leader", "Member", "Delegate"}

    async def test_user_roles_match_schema(self, client: AsyncClient) -> None:
        resp = await client.get("/metadata/enums")
        assert set(resp.json()["user_roles"]) == {"system_admin", "team_lead", "editor", "viewer"}


# ---------------------------------------------------------------------------
# GET /metadata/locations
# ---------------------------------------------------------------------------
class TestListLocations:

    async def test_viewer_receives_200_and_list(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get("/metadata/locations")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_admin_receives_200(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.get("/metadata/locations")
        assert resp.status_code == 200

    async def test_unauthenticated_is_rejected(self, client: AsyncClient) -> None:
        resp = await client.get("/metadata/locations")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /metadata/locations/{id}
# ---------------------------------------------------------------------------
class TestGetLocation:

    async def test_returns_location_when_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            resp = await client.get(f"/metadata/locations/{LOCATION_ID}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["city"] == "New York"
        assert body["country"] == "USA"

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.get(f"/metadata/locations/{LOCATION_ID}")
        assert resp.status_code == 404
        assert LOCATION_ID in resp.json()["detail"]


# ---------------------------------------------------------------------------
# POST /metadata/locations
# ---------------------------------------------------------------------------
class TestCreateLocation:

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)  # no duplicate
            resp = await client.post("/metadata/locations", json=VALID_PAYLOAD)
        assert resp.status_code == 201
        body = resp.json()
        assert body["city"] == "San Francisco"
        assert body["country"] == "USA"

    async def test_duplicate_location_returns_409(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            resp = await client.post("/metadata/locations", json=VALID_PAYLOAD)
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"]

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.post("/metadata/locations", json=VALID_PAYLOAD)
        assert resp.status_code == 403

    async def test_missing_city_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/metadata/locations", json={"country": "USA"})
        assert resp.status_code == 422

    async def test_missing_country_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/metadata/locations", json={"city": "Austin"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /metadata/locations/{id}
# ---------------------------------------------------------------------------
class TestUpdateLocation:

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            resp = await client.patch(f"/metadata/locations/{LOCATION_ID}", json={"city": "Brooklyn"})
        assert resp.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.patch(f"/metadata/locations/{LOCATION_ID}", json={"city": "X"})
        assert resp.status_code == 403

    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.update_one = AsyncMock(return_value=MagicMock(matched_count=0))
            resp = await client.patch(f"/metadata/locations/{LOCATION_ID}", json={"city": "Nowhere"})
        assert resp.status_code == 404

    async def test_empty_payload_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.patch(f"/metadata/locations/{LOCATION_ID}", json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# DELETE /metadata/locations/{id}  (soft-delete)
# ---------------------------------------------------------------------------
class TestSoftDeleteLocation:

    async def test_admin_can_soft_delete(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            resp = await client.delete(f"/metadata/locations/{LOCATION_ID}")
        assert resp.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.delete(f"/metadata/locations/{LOCATION_ID}")
        assert resp.status_code == 403

    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.update_one = AsyncMock(return_value=MagicMock(matched_count=0))
            resp = await client.delete(f"/metadata/locations/{LOCATION_ID}")
        assert resp.status_code == 404
