"""
Pytest tests for the Metadata Lambda (``metadata/function.py``).

Coverage:
    - GET  /enums                — static dropdown values (no DB call)
    - GET  /locations            — list all locations
    - GET  /locations/{id}       — get by ID (found / not-found)
    - POST /locations            — create (admin only)
    - PATCH /locations/{id}      — update (admin only)
    - DELETE /locations/{id}     — soft-delete (admin only)
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from metadata.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

LOCATION_ID = "807f1f77bcf86cd799439044"

EXISTING_LOCATION = {
    "_id": LOCATION_ID,
    "city": "New York",
    "country": "USA",
    "isActive": True,
}

VALID_PAYLOAD = {
    "city": "San Francisco",
    "country": "USA",
}


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTPX client wired to the Metadata Lambda app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /enums
# ---------------------------------------------------------------------------

class TestEnums:
    """Tests for the static enums endpoint."""

    async def test_returns_200_without_auth(self, client: AsyncClient) -> None:
        """Enums endpoint is public — no auth required."""
        response = await client.get("/enums")
        assert response.status_code == 200

    async def test_response_contains_required_keys(self, client: AsyncClient) -> None:
        """Response must include staff_types and member_roles keys."""
        response = await client.get("/enums")
        data = response.json()
        assert "staff_types" in data
        assert "member_roles" in data

    async def test_staff_types_are_correct(self, client: AsyncClient) -> None:
        """staff_types must exactly match the schema enum values."""
        response = await client.get("/enums")
        assert set(response.json()["staff_types"]) == {
            "Employee", "Contractor", "Consultant"
        }

    async def test_member_roles_are_correct(self, client: AsyncClient) -> None:
        """member_roles must exactly match the schema enum values."""
        response = await client.get("/enums")
        assert set(response.json()["member_roles"]) == {
            "Team Leader", "Member", "Delegate"
        }


# ---------------------------------------------------------------------------
# GET /locations
# ---------------------------------------------------------------------------

class TestListLocations:
    """Tests for listing all locations."""

    async def test_viewer_receives_200_and_list(self, client: AsyncClient) -> None:
        """Viewers should be able to list all locations."""
        with override_deps(app, role="viewer"):
            response = await client.get("/locations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_admin_receives_200_and_list(self, client: AsyncClient) -> None:
        """Admin should also be able to list all locations."""
        with override_deps(app, role="system_admin"):
            response = await client.get("/locations")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# GET /locations/{id}
# ---------------------------------------------------------------------------

class TestGetLocation:
    """Tests for retrieving a single location by ID."""

    async def test_returns_location_when_found(self, client: AsyncClient) -> None:
        """Should return the location document when it exists."""
        with override_deps(app, role="viewer") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            response = await client.get(f"/locations/{LOCATION_ID}")
        assert response.status_code == 200
        assert response.json()["city"] == "New York"

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        """Should return 404 when no location matches the given ID."""
        with override_deps(app, role="viewer") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=None)
            response = await client.get(f"/locations/{LOCATION_ID}")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /locations
# ---------------------------------------------------------------------------

class TestCreateLocation:
    """Tests for creating a new location."""

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        """Admin should be able to create a new location (201)."""
        with override_deps(app, role="system_admin"):
            response = await client.post("/locations", json=VALID_PAYLOAD)
        assert response.status_code == 201

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to create locations (403)."""
        with override_deps(app, role="viewer"):
            response = await client.post("/locations", json=VALID_PAYLOAD)
        assert response.status_code == 403

    async def test_missing_city_rejected(self, client: AsyncClient) -> None:
        """Payload without city must be rejected with 422."""
        with override_deps(app, role="system_admin"):
            response = await client.post("/locations", json={"country": "USA"})
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /locations/{id}
# ---------------------------------------------------------------------------

class TestUpdateLocation:
    """Tests for partially updating a location."""

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        """Admin should be able to patch an existing location (200)."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            response = await client.patch(
                f"/locations/{LOCATION_ID}", json={"city": "Brooklyn"}
            )
        assert response.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to update locations (403)."""
        with override_deps(app, role="viewer"):
            response = await client.patch(
                f"/locations/{LOCATION_ID}", json={"city": "Brooklyn"}
            )
        assert response.status_code == 403

    async def test_returns_404_for_missing_location(self, client: AsyncClient) -> None:
        """Patching a non-existent location should return 404."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.update_one = AsyncMock(return_value=MagicMock(matched_count=0, modified_count=0))
            response = await client.patch(
                f"/locations/{LOCATION_ID}", json={"city": "Nowhere"}
            )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /locations/{id}  (soft-delete)
# ---------------------------------------------------------------------------

class TestSoftDeleteLocation:
    """Tests for soft-deleting a location."""

    async def test_admin_can_soft_delete(self, client: AsyncClient) -> None:
        """Admin should be able to soft-delete (set isActive: false) — returns 200."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_LOCATION)
            response = await client.delete(f"/locations/{LOCATION_ID}")
        assert response.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to delete locations (403)."""
        with override_deps(app, role="viewer"):
            response = await client.delete(f"/locations/{LOCATION_ID}")
        assert response.status_code == 403
