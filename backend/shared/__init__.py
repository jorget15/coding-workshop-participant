"""Shared utilities imported by all Lambda functions as a layer."""

import hashlib
import os
import secrets

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


def serialize_doc(d: dict) -> dict:
    """Serialize ObjectId _id to string for JSON responses; strip auth block."""
    if d and "_id" in d:
        d["_id"] = str(d["_id"])
    d.pop("auth", None)
    return d


def oid(value: str) -> ObjectId:
    """Parse a string to ObjectId, raising 400 on invalid format."""
    try:
        return ObjectId(value)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id format: '{value}'.")


def hash_password(plain: str) -> str:
    """Hash a password using PBKDF2-SHA256 (stdlib — no binary deps)."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), 260000)
    return f"$pbkdf2-sha256${salt}${dk.hex()}"


def verify_password(plain: str, stored_hash: str) -> bool:
    """Verify a password against a $pbkdf2-sha256$salt$hash string."""
    try:
        parts = stored_hash.split("$")
        if len(parts) != 4:
            return False
        _, _algo, salt, dk_hex = parts
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), 260000)
        return secrets.compare_digest(dk.hex(), dk_hex)
    except (ValueError, AttributeError):
        return False


def create_app(title: str) -> FastAPI:
    """Create a FastAPI app with standard CORS middleware."""
    app = FastAPI(title=title, version="1.0.0")
    raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in raw_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


def make_history_entry(
    event_type: str,
    description: str,
    changed_by: str,
    previous_state: dict | None = None,
    new_state: dict | None = None,
) -> dict:
    """Build a teamHistory document (for the separate teamHistory collection).

    Matches the schema: teamId, eventType, changedBy, changedAt, description,
    previousState, newState.  The caller must add `teamId` and `_id` before inserting.
    """
    from datetime import datetime, timezone

    return {
        "eventType": event_type,
        "changedBy": changed_by,
        "changedAt": datetime.now(timezone.utc).isoformat(),
        "description": description,
        "previousState": previous_state,
        "newState": new_state,
    }


def make_change_entry(
    event_type: str,
    description: str,
    metadata: dict | None = None,
) -> dict:
    """Build a changeHistory entry for the individuals embedded array.

    Event types: PROFILE_CREATED, JOINED_TEAM,
    LEFT_TEAM, DEACTIVATED, ROLE_CHANGED.
    """
    from datetime import datetime, timezone

    entry = {
        "eventType": event_type,
        "description": description,
        "occurredAt": datetime.now(timezone.utc).isoformat(),
    }
    if metadata:
        entry["metadata"] = metadata
    return entry
