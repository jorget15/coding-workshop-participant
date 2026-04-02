"""
Pytest tests for shared utilities (``shared/__init__.py``).

Coverage:
    - serialize_doc        — ObjectId to string, auth stripping
    - oid                  — valid/invalid ObjectId parsing
    - hash_password        — produces valid format
    - verify_password      — correct/wrong/malformed hashes
    - make_history_entry   — correct shape, all fields present
    - make_change_entry    — correct shape, all fields present
    - create_app           — CORS enabled, default origins
"""

import pytest
from bson import ObjectId
from fastapi import HTTPException

from shared import (
    create_app,
    hash_password,
    make_change_entry,
    make_history_entry,
    oid,
    serialize_doc,
    verify_password,
)


class TestSerializeDoc:

    def test_converts_objectid_to_string(self) -> None:
        obj_id = ObjectId()
        doc = {"_id": obj_id, "name": "test"}
        result = serialize_doc(doc)
        assert result["_id"] == str(obj_id)
        assert isinstance(result["_id"], str)

    def test_strips_auth_block(self) -> None:
        doc = {"_id": "abc", "name": "jorge", "auth": {"hashedPassword": "secret"}}
        result = serialize_doc(doc)
        assert "auth" not in result
        assert result["name"] == "jorge"

    def test_handles_string_id(self) -> None:
        doc = {"_id": "already_string", "data": 1}
        result = serialize_doc(doc)
        assert result["_id"] == "already_string"

    def test_handles_empty_dict(self) -> None:
        result = serialize_doc({})
        assert result == {}


class TestOid:

    def test_valid_objectid(self) -> None:
        valid = "507f1f77bcf86cd799439011"
        result = oid(valid)
        assert isinstance(result, ObjectId)
        assert str(result) == valid

    def test_invalid_objectid_raises_400(self) -> None:
        with pytest.raises(HTTPException) as exc:
            oid("not-a-valid-id")
        assert exc.value.status_code == 400
        assert "Invalid id format" in exc.value.detail


class TestHashPassword:

    def test_produces_correct_format(self) -> None:
        hashed = hash_password("MySecret123!")
        parts = hashed.split("$")
        assert len(parts) == 4
        assert parts[0] == ""  # leading $
        assert parts[1] == "pbkdf2-sha256"
        assert len(parts[2]) == 32  # 16 bytes hex salt
        assert len(parts[3]) == 64  # 32 bytes hex hash

    def test_different_salts_per_call(self) -> None:
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # different salts


class TestVerifyPassword:

    def test_correct_password(self) -> None:
        hashed = hash_password("Test1234!")
        assert verify_password("Test1234!", hashed) is True

    def test_wrong_password(self) -> None:
        hashed = hash_password("Test1234!")
        assert verify_password("WrongPassword", hashed) is False

    def test_malformed_hash_returns_false(self) -> None:
        assert verify_password("anything", "not-a-valid-hash") is False

    def test_empty_hash_returns_false(self) -> None:
        assert verify_password("anything", "") is False

    def test_none_hash_returns_false(self) -> None:
        assert verify_password("anything", None) is False


class TestMakeHistoryEntry:

    def test_has_required_fields(self) -> None:
        entry = make_history_entry(
            event_type="team_created",
            description="Alpha created.",
            changed_by="admin_001",
        )
        assert entry["eventType"] == "team_created"
        assert entry["description"] == "Alpha created."
        assert entry["changedBy"] == "admin_001"
        assert "changedAt" in entry
        assert entry["previousState"] is None
        assert entry["newState"] is None

    def test_includes_state_snapshots(self) -> None:
        entry = make_history_entry(
            event_type="team_updated",
            description="Renamed.",
            changed_by="admin_001",
            previous_state={"team_name": "Old"},
            new_state={"team_name": "New"},
        )
        assert entry["previousState"] == {"team_name": "Old"}
        assert entry["newState"] == {"team_name": "New"}

    def test_changed_at_is_iso_format(self) -> None:
        entry = make_history_entry("test", "desc", "user")
        # ISO format contains T separator
        assert "T" in entry["changedAt"]


class TestMakeChangeEntry:

    def test_has_required_fields(self) -> None:
        entry = make_change_entry(
            event_type="JOINED_TEAM",
            description="Joined Alpha Squad.",
        )
        assert entry["eventType"] == "JOINED_TEAM"
        assert entry["description"] == "Joined Alpha Squad."
        assert "occurredAt" in entry
        assert "metadata" not in entry or entry.get("metadata") is None

    def test_includes_metadata(self) -> None:
        entry = make_change_entry(
            event_type="LEFT_TEAM",
            description="Removed from team.",
            metadata={"teamId": "team_001", "teamName": "Alpha"},
        )
        assert entry["metadata"]["teamId"] == "team_001"
        assert entry["metadata"]["teamName"] == "Alpha"

    def test_occurred_at_is_iso_format(self) -> None:
        entry = make_change_entry("test", "desc")
        assert "T" in entry["occurredAt"]


class TestCreateApp:

    def test_returns_fastapi_app(self) -> None:
        app = create_app("Test Service")
        assert app.title == "Test Service"

    def test_cors_middleware_attached(self) -> None:
        app = create_app("Test Service")
        middleware_classes = [m.cls.__name__ for m in app.user_middleware]
        assert "CORSMiddleware" in middleware_classes
