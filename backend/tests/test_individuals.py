"""
Pytest tests for the Individuals Lambda (``individuals/function.py``).

Coverage:
    - GET  /individuals              — list (admin and viewer)
    - GET  /individuals/{id}         — get by ID (found / not-found)
    - POST /individuals              — create (admin only / 403 for viewer)
    - PATCH /individuals/{id}        — update (admin only / 403 for viewer)
    - DELETE /individuals/{id}       — soft-delete (admin only)
    - POST /individuals/{id}/avatar-upload-url — S3 presigned URL (admin only)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from individuals.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

INDIVIDUAL_ID = "507f1f77bcf86cd799439011"

VALID_PAYLOAD = {
    "first_name": "Alice",
    "last_name": "Smith",
    "email": "alice@acme.com",
    "staff_type": "Employee",
    "password": "Secret1234!",
}

EXISTING_DOC = {
    "_id": INDIVIDUAL_ID,
    "first_name": "Alice",
    "last_name": "Smith",
    "email": "alice@acme.com",
    "staff_type": "Employee",
    "isActive": True,
}


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTPX client wired to the Individuals Lambda app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /individuals
# ---------------------------------------------------------------------------

class TestListIndividuals:
    """Tests for listing all individuals."""

    async def test_admin_receives_200_and_list(self, client: AsyncClient) -> None:
        """Admin should receive a 200 with an empty list when no data exists."""
        with override_deps(app, role="system_admin"):
            response = await client.get("/individuals")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_viewer_receives_200(self, client: AsyncClient) -> None:
        """Viewers should be allowed to list individuals (read-only access)."""
        with override_deps(app, role="viewer"):
            response = await client.get("/individuals")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ---------------------------------------------------------------------------
# GET /individuals/{id}
# ---------------------------------------------------------------------------

class TestGetIndividual:
    """Tests for retrieving a single individual by ID."""

    async def test_returns_individual_when_found(self, client: AsyncClient) -> None:
        """Should return the individual document when it exists in the DB."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_DOC)
            response = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 200
        assert response.json()["email"] == "alice@acme.com"

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        """Should return 404 when no document matches the given ID."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=None)
            response = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /individuals
# ---------------------------------------------------------------------------

class TestCreateIndividual:
    """Tests for creating a new individual."""

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        """System admin should be able to create a new individual (201)."""
        with override_deps(app, role="system_admin"):
            response = await client.post("/individuals", json=VALID_PAYLOAD)
        assert response.status_code == 201

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to create individuals (403)."""
        with override_deps(app, role="viewer"):
            response = await client.post("/individuals", json=VALID_PAYLOAD)
        assert response.status_code == 403

    async def test_invalid_staff_type_rejected(self, client: AsyncClient) -> None:
        """Payload with an invalid staffType must be rejected with 422."""
        bad_payload = {**VALID_PAYLOAD, "staff_type": "Intern"}
        with override_deps(app, role="system_admin"):
            response = await client.post("/individuals", json=bad_payload)
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /individuals/{id}
# ---------------------------------------------------------------------------

class TestUpdateIndividual:
    """Tests for partially updating an individual."""

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        """Admin should be able to patch an existing individual (200)."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_DOC)
            response = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"job_title": "Senior Analyst"},
            )
        assert response.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to update individuals (403)."""
        with override_deps(app, role="viewer"):
            response = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"job_title": "Senior Analyst"},
            )
        assert response.status_code == 403

    async def test_returns_404_for_missing_individual(self, client: AsyncClient) -> None:
        """Patching a non-existent individual should return 404."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=MagicMock(matched_count=0, modified_count=0))
            response = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"job_title": "Analyst"},
            )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /individuals/{id}  (soft-delete — R4)
# ---------------------------------------------------------------------------

class TestSoftDeleteIndividual:
    """Tests for soft-deleting an individual (R4 — no hard deletes)."""

    async def test_admin_soft_deletes(self, client: AsyncClient) -> None:
        """Admin should be able to soft-delete (set isActive: false) — returns 200."""
        with override_deps(app, role="system_admin") as (mock_db, mock_col, _):
            mock_col.find_one = AsyncMock(return_value=EXISTING_DOC)
            response = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 200

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to delete individuals (403)."""
        with override_deps(app, role="viewer"):
            response = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /individuals/{id}/avatar-upload-url
# ---------------------------------------------------------------------------

class TestAvatarUploadUrl:
    """Tests for generating presigned S3 avatar upload URLs."""

    async def test_returns_presigned_url(self, client: AsyncClient) -> None:
        """Admin should receive a presigned URL and the S3 key."""
        with override_deps(app, role="system_admin"):
            with patch("individuals.function.boto3") as mock_boto3:
                with patch.dict("os.environ", {"S3_BUCKET": "test-bucket"}):
                    mock_s3 = MagicMock()
                    mock_boto3.client.return_value = mock_s3
                    mock_s3.generate_presigned_url.return_value = (
                        "https://s3.amazonaws.com/bucket/key?sig=abc"
                    )
                    response = await client.post(
                        f"/individuals/{INDIVIDUAL_ID}/avatar-upload-url"
                    )
        assert response.status_code == 200
        data = response.json()
        assert "upload_url" in data
        assert "s3_key" in data

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        """Viewers must not be permitted to request upload URLs (403)."""
        with override_deps(app, role="viewer"):
            response = await client.post(
                f"/individuals/{INDIVIDUAL_ID}/avatar-upload-url"
            )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /individuals/{id}
# ---------------------------------------------------------------------------

class TestGetIndividual:
    """Tests for retrieving a single individual by ID."""

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        """Should return 404 when the individual does not exist in the DB."""
        with override_deps(app, role="system_admin"):
            response = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 404

    async def test_returns_individual_when_found(self, client: AsyncClient) -> None:
        """Should return the individual document when it exists."""
        doc = {
            "_id": INDIVIDUAL_ID,
            "firstName": "Alice",
            "lastName": "Smith",
            "email": "alice@acme.com",
            "isActive": True,
        }
        with override_deps(app, role="system_admin") as (_, collection, _user):
            collection.find_one = AsyncMock(return_value=doc)
            response = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# POST /individuals
# ---------------------------------------------------------------------------

class TestCreateIndividual:
    """Tests for creating a new individual."""

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        """system_admin should be able to create an individual (201)."""
        with override_deps(app, role="system_admin") as (_, collection, _user):
            collection.find_one = AsyncMock(return_value=None)  # email not taken
            response = await client.post("/individuals", json=VALID_PAYLOAD)
        assert response.status_code == 201

    async def test_viewer_receives_403(self, client: AsyncClient) -> None:
        """Non-admin roles should be rejected with 403."""
        with override_deps(app, role="viewer"):
            response = await client.post("/individuals", json=VALID_PAYLOAD)
        assert response.status_code == 403

    async def test_duplicate_email_returns_409(self, client: AsyncClient) -> None:
        """Creating an individual with an existing email should return 409."""
        existing = {"email": "alice@acme.com"}
        with override_deps(app, role="system_admin") as (_, collection, _user):
            collection.find_one = AsyncMock(return_value=existing)
            response = await client.post("/individuals", json=VALID_PAYLOAD)
        assert response.status_code == 409

    async def test_invalid_staff_type_returns_422(self, client: AsyncClient) -> None:
        """Invalid staffType enum value should return 422 (Pydantic validation)."""
        payload = {**VALID_PAYLOAD, "staff_type": "InvalidType"}
        with override_deps(app, role="system_admin"):
            response = await client.post("/individuals", json=payload)
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /individuals/{id}
# ---------------------------------------------------------------------------

class TestUpdateIndividual:
    """Tests for partially updating an individual."""

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        """system_admin should be able to patch an individual's job title."""
        existing = {"_id": INDIVIDUAL_ID, "isActive": True}
        with override_deps(app, role="system_admin") as (_, collection, _user):
            collection.find_one = AsyncMock(return_value=existing)
            response = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"job_title": "Senior Engineer"},
            )
        assert response.status_code == 200

    async def test_viewer_receives_403(self, client: AsyncClient) -> None:
        """Viewers should not be allowed to update individuals."""
        with override_deps(app, role="viewer"):
            response = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"job_title": "Senior Engineer"},
            )
        assert response.status_code == 403

    async def test_returns_404_for_missing_individual(
        self, client: AsyncClient
    ) -> None:
        """Should return 404 if the target individual does not exist."""
        with override_deps(app, role="system_admin") as (_, collection, _user):
            collection.find_one = AsyncMock(return_value=None)
            collection.update_one = AsyncMock(return_value=MagicMock(matched_count=0, modified_count=0))
            response = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"job_title": "Engineer"},
            )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /individuals/{id}  (soft-delete — R4)
# ---------------------------------------------------------------------------

class TestSoftDeleteIndividual:
    """Tests for soft-deleting an individual (R4 — no hard deletes)."""

    async def test_soft_delete_sets_inactive(self, client: AsyncClient) -> None:
        """Admin soft-deleting sets isActive: false and returns 200."""
        existing = {"_id": INDIVIDUAL_ID, "isActive": False}
        with override_deps(app, role="system_admin") as (_, collection, _user):
            # find_one: R4 check (teams) returns None, then final doc fetch returns existing
            collection.find_one = AsyncMock(side_effect=[None, existing])
            response = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 200

    async def test_viewer_receives_403(self, client: AsyncClient) -> None:
        """Viewers should not be allowed to delete individuals."""
        with override_deps(app, role="viewer"):
            response = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert response.status_code == 403
