"""
Pytest tests for the Individuals Lambda (``individuals/function.py``).

Coverage:
    - GET    /individuals                       — list (admin, viewer, team_lead, filters, unauthenticated)
    - GET    /individuals/{id}                  — get (own profile, admin, viewer 403, 404, auth block stripped)
    - POST   /individuals                       — create (admin, dup 409, viewer 403, bad staff_type 422, bad email 422, short pw 422)
    - PATCH  /individuals/{id}                  — update (admin, own profile, viewer 403, 404, empty payload 400, URL rejection)
    - DELETE /individuals/{id}                  — soft-delete (admin, R4 conflict 409, viewer 403, team_lead 403, 404)
    - POST   /individuals/{id}/avatar-upload-url — presigned URL (admin, own, viewer 403, missing bucket 500)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from individuals.function import app
from tests.conftest import override_deps

pytestmark = pytest.mark.asyncio

INDIVIDUAL_ID = "ind_alice_001"

VALID_PAYLOAD = {
    "person_name": "Jorge taban",
    "email": "jorge@acme.com",
    "staff_type": "direct",
    "home_location": {"city": "New York", "country": "United States", "region": "NAM"},
    "password": "Secret1234!",
}

EXISTING_DOC = {
    "_id": INDIVIDUAL_ID,
    "personName": "Jorge taban",
    "email": "jorge@acme.com",
    "staffType": "direct",
    "jobTitle": "Analyst",
    "homeLocation": {"city": "New York", "country": "United States", "region": "NAM"},
    "assignedOffice": "loc_nyc_hq",
    "profilePicture": "avatars/defaults/default_01.png",
    "isDeleted": False,
    "createdAt": "2026-01-01T00:00:00+00:00",
    "updatedAt": "2026-01-01T00:00:00+00:00",
}


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /individuals
# ---------------------------------------------------------------------------
class TestListIndividuals:

    async def test_admin_receives_200_and_list(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.get("/individuals")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_viewer_receives_200(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get("/individuals")
        assert resp.status_code == 200

    async def test_team_lead_receives_200(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_001"):
            resp = await client.get("/individuals")
        assert resp.status_code == 200

    async def test_filter_by_staff_type(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.get("/individuals?staff_type=direct")
        assert resp.status_code == 200

    async def test_filter_by_search(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.get("/individuals?search=jorge")
        assert resp.status_code == 200

    async def test_unauthenticated_is_rejected(self, client: AsyncClient) -> None:
        resp = await client.get("/individuals")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /individuals/{id}
# ---------------------------------------------------------------------------
class TestGetIndividual:

    async def test_admin_can_view_any(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_DOC)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == "jorge@acme.com"
        assert body["personName"] == "Jorge taban"
        assert "auth" not in body

    async def test_user_can_view_own_profile(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, user):
            col.find_one = AsyncMock(return_value={**EXISTING_DOC, "_id": user.user_id})
            resp = await client.get(f"/individuals/{user.user_id}")
        assert resp.status_code == 200

    async def test_viewer_cannot_view_others(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 403
        assert "own profile" in resp.json()["detail"].lower()

    async def test_team_lead_can_view_any(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_001") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_DOC)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 200

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        """Admin should get 404 when no document matches the given ID."""
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 404
        assert INDIVIDUAL_ID in resp.json()["detail"]

    async def test_auth_block_stripped_from_response(self, client: AsyncClient) -> None:
        doc_with_auth = {**EXISTING_DOC, "auth": {"hashedPassword": "secret"}}
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=doc_with_auth)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 200
        assert "auth" not in resp.json()


# ---------------------------------------------------------------------------
# POST /individuals
# ---------------------------------------------------------------------------
class TestCreateIndividual:

    async def test_admin_can_create(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.post("/individuals", json=VALID_PAYLOAD)
        assert resp.status_code == 201
        body = resp.json()
        assert body["personName"] == "Jorge taban"
        assert body["staffType"] == "direct"
        assert "auth" not in body

    async def test_duplicate_email_returns_409(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value={"email": "jorge@acme.com"})
            resp = await client.post("/individuals", json=VALID_PAYLOAD)
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"]

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.post("/individuals", json=VALID_PAYLOAD)
        assert resp.status_code == 403

    async def test_team_lead_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_001"):
            resp = await client.post("/individuals", json=VALID_PAYLOAD)
        assert resp.status_code == 403

    async def test_invalid_staff_type_rejected(self, client: AsyncClient) -> None:
        bad = {**VALID_PAYLOAD, "staff_type": "Intern"}
        with override_deps(app, role="system_admin"):
            resp = await client.post("/individuals", json=bad)
        assert resp.status_code == 422

    async def test_missing_required_fields_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.post("/individuals", json={"email": "x@acme.com"})
        assert resp.status_code == 422

    async def test_invalid_email_rejected(self, client: AsyncClient) -> None:
        bad = {**VALID_PAYLOAD, "email": "not-an-email"}
        with override_deps(app, role="system_admin"):
            resp = await client.post("/individuals", json=bad)
        assert resp.status_code == 422

    async def test_short_password_rejected(self, client: AsyncClient) -> None:
        bad = {**VALID_PAYLOAD, "password": "short"}
        with override_deps(app, role="system_admin"):
            resp = await client.post("/individuals", json=bad)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /individuals/{id}
# ---------------------------------------------------------------------------
class TestUpdateIndividual:

    async def test_admin_can_update(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_DOC)
            resp = await client.patch(f"/individuals/{INDIVIDUAL_ID}", json={"job_title": "Senior Analyst"})
        assert resp.status_code == 200

    async def test_user_can_update_own_profile(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, col, user):
            col.find_one = AsyncMock(return_value={**EXISTING_DOC, "_id": user.user_id})
            resp = await client.patch(f"/individuals/{user.user_id}", json={"job_title": "Lead"})
        assert resp.status_code == 200

    async def test_viewer_cannot_update_others(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.patch(f"/individuals/{INDIVIDUAL_ID}", json={"job_title": "X"})
        assert resp.status_code == 403

    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            col.update_one = AsyncMock(return_value=MagicMock(matched_count=0))
            resp = await client.patch(f"/individuals/{INDIVIDUAL_ID}", json={"job_title": "X"})
        assert resp.status_code == 404

    async def test_empty_payload_rejected(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            resp = await client.patch(f"/individuals/{INDIVIDUAL_ID}", json={})
        assert resp.status_code == 400
        assert "no fields" in resp.json()["detail"].lower()

    async def test_rejects_url_for_profile_picture(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=EXISTING_DOC)
            resp = await client.patch(
                f"/individuals/{INDIVIDUAL_ID}",
                json={"profile_picture": "https://s3.example.com/bad.jpg"},
            )
        assert resp.status_code == 400
        assert "s3 object key" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE /individuals/{id}  (soft-delete — R4)
# ---------------------------------------------------------------------------
class TestSoftDeleteIndividual:

    async def test_admin_soft_deletes(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(side_effect=[None, {**EXISTING_DOC, "isDeleted": True}])
            resp = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 200
        assert resp.json()["isDeleted"] is True

    async def test_r4_blocks_if_on_active_team(self, client: AsyncClient) -> None:
        """R4: soft-delete must be blocked if individual is an active team member."""
        active_team = {"_id": "team_001", "teamName": "Alpha"}
        with override_deps(app, role="system_admin") as (mock_db, col, _):
            # The route queries db["teams"] first (R4 check), then db["individuals"]
            # Since mock_db returns same collection for all, we use side_effect
            col.find_one = AsyncMock(return_value=active_team)
            resp = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 409
        assert "R4" in resp.json()["detail"]

    async def test_viewer_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 403

    async def test_team_lead_is_forbidden(self, client: AsyncClient) -> None:
        with override_deps(app, role="team_lead", team_id="team_001"):
            resp = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 403

    async def test_returns_404_when_not_found(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            col.update_one = AsyncMock(return_value=MagicMock(matched_count=0))
            resp = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /individuals/{id}/avatar-upload-url
# ---------------------------------------------------------------------------
class TestAvatarUploadUrl:

    async def test_admin_gets_presigned_url(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            with patch("individuals.function.boto3") as mock_boto3:
                with patch.dict("os.environ", {"S3_BUCKET": "test-bucket"}):
                    mock_s3 = MagicMock()
                    mock_boto3.client.return_value = mock_s3
                    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/signed"
                    resp = await client.post(f"/individuals/{INDIVIDUAL_ID}/avatar-upload-url")
        assert resp.status_code == 200
        body = resp.json()
        assert "upload_url" in body
        assert body["s3_key"].startswith("avatars/")
        assert INDIVIDUAL_ID in body["s3_key"]

    async def test_user_can_request_own_upload(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer") as (_, _, user):
            with patch("individuals.function.boto3") as mock_boto3:
                with patch.dict("os.environ", {"S3_BUCKET": "test-bucket"}):
                    mock_s3 = MagicMock()
                    mock_boto3.client.return_value = mock_s3
                    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/signed"
                    resp = await client.post(f"/individuals/{user.user_id}/avatar-upload-url")
        assert resp.status_code == 200

    async def test_viewer_cannot_upload_for_others(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.post(f"/individuals/{INDIVIDUAL_ID}/avatar-upload-url")
        assert resp.status_code == 403

    async def test_missing_s3_bucket_returns_500(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin"):
            with patch.dict("os.environ", {"S3_BUCKET": ""}, clear=False):
                resp = await client.post(f"/individuals/{INDIVIDUAL_ID}/avatar-upload-url")
        assert resp.status_code == 500
        assert "S3_BUCKET" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Individual History
# ---------------------------------------------------------------------------


class TestGetIndividualHistory:

    async def test_admin_can_view_any_history(self, client: AsyncClient) -> None:
        doc_with_history = {
            "_id": INDIVIDUAL_ID,
            "changeHistory": [
                {"eventType": "PROFILE_CREATED", "occurredAt": "2026-01-01T00:00:00", "description": "Created."},
                {"eventType": "JOINED_TEAM", "occurredAt": "2026-01-02T00:00:00", "description": "Joined Alpha."},
            ],
        }
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=doc_with_history)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}/history")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Newest first (reversed by route)
        assert data[0]["eventType"] == "JOINED_TEAM"
        assert data[1]["eventType"] == "PROFILE_CREATED"

    async def test_user_can_view_own_history(self, client: AsyncClient) -> None:
        doc_with_history = {
            "_id": "test_user_id",
            "changeHistory": [
                {"eventType": "PROFILE_CREATED", "occurredAt": "2026-01-01T00:00:00", "description": "Created."},
            ],
        }
        with override_deps(app, role="viewer") as (_, col, user):
            col.find_one = AsyncMock(return_value=doc_with_history)
            resp = await client.get(f"/individuals/{user.user_id}/history")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_viewer_cannot_view_others_history(self, client: AsyncClient) -> None:
        with override_deps(app, role="viewer"):
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}/history")
        assert resp.status_code == 403

    async def test_team_lead_can_view_member_history(self, client: AsyncClient) -> None:
        doc_with_history = {"_id": INDIVIDUAL_ID, "changeHistory": []}
        with override_deps(app, role="team_lead", team_id="team_001") as (_, col, _):
            col.find_one = AsyncMock(return_value=doc_with_history)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}/history")
        assert resp.status_code == 200

    async def test_returns_404_for_missing_individual(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=None)
            resp = await client.get(f"/individuals/nonexistent/history")
        assert resp.status_code == 404

    async def test_returns_empty_for_no_history(self, client: AsyncClient) -> None:
        doc_no_history = {"_id": INDIVIDUAL_ID}
        with override_deps(app, role="system_admin") as (_, col, _):
            col.find_one = AsyncMock(return_value=doc_no_history)
            resp = await client.get(f"/individuals/{INDIVIDUAL_ID}/history")
        assert resp.status_code == 200
        assert resp.json() == []


class TestCreateIndividualWritesHistory:

    async def test_create_appends_profile_created(self, client: AsyncClient) -> None:
        with override_deps(app, role="system_admin") as (_, col, _):
            resp = await client.post("/individuals", json=VALID_PAYLOAD)
        assert resp.status_code == 201
        # The inserted doc should contain a changeHistory array with PROFILE_CREATED
        insert_call = col.insert_one.await_args_list[0]
        doc = insert_call[0][0]
        assert "changeHistory" in doc
        assert len(doc["changeHistory"]) == 1
        assert doc["changeHistory"][0]["eventType"] == "PROFILE_CREATED"


class TestDeactivateIndividualWritesHistory:

    async def test_deactivate_appends_deactivated(self, client: AsyncClient) -> None:
        existing = {
            "_id": INDIVIDUAL_ID,
            "personName": "Dan Brown",
            "isDeleted": False,
        }
        with override_deps(app, role="system_admin") as (_, col, _):
            # First find_one: team lookup for R4 check (None = not on active team)
            # Second find_one: the individual doc
            col.find_one = AsyncMock(side_effect=[None, existing])
            resp = await client.delete(f"/individuals/{INDIVIDUAL_ID}")
        assert resp.status_code == 200
        # update_one called twice: soft-delete + changeHistory push
        assert col.update_one.await_count == 2
        change_call = col.update_one.await_args_list[1]
        push_op = change_call[0][1]
        change_entry = push_op["$push"]["changeHistory"]
        assert change_entry["eventType"] == "DEACTIVATED"
