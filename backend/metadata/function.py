"""
Metadata router — read/write for the `locations` collection and other
reference data (staff types, member roles, team statuses).

These are mostly read-only reference endpoints consumed by dropdowns
and filter UIs in the frontend. Only system_admin may create/update locations.

Dependencies:
    - Motor async DocumentDB client (injected via FastAPI Depends)
    - JWT auth dependency to identify the calling user and their role
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LocationCreate(BaseModel):
    """Payload for creating a new location."""

    city: str = Field(..., min_length=1)
    country: str = Field(..., min_length=1)
    region: Optional[str] = None
    timezone: Optional[str] = None


class LocationUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    city: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes — Locations
# ---------------------------------------------------------------------------

@router.get("/locations")
async def list_locations() -> list:
    """
    Return all locations.

    TODO:
        - Inject Motor DB client.
        - Query: db.locations.find({})
        - No auth required (used to populate dropdowns for all roles).
        - Sort by country, then city.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.get("/locations/{location_id}")
async def get_location(location_id: str) -> dict:
    """
    Return a single location by its _id.

    TODO:
        - Query: db.locations.find_one({"_id": ObjectId(location_id)})
        - Return 404 if not found.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.post("/locations", status_code=status.HTTP_201_CREATED)
async def create_location(payload: LocationCreate) -> dict:
    """
    Create a new location entry.

    TODO:
        - Restrict to system_admin role only.
        - Check for duplicate city+country before inserting.
        - Return the inserted document.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.patch("/locations/{location_id}")
async def update_location(location_id: str, payload: LocationUpdate) -> dict:
    """
    Update a location's details.

    TODO:
        - Restrict to system_admin role only.
        - Build a $set dict from non-None payload fields.
        - Return the updated document.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


# ---------------------------------------------------------------------------
# Routes — Static reference data (enums)
# ---------------------------------------------------------------------------

@router.get("/enums")
async def get_enums() -> dict:
    """
    Return all static enum values used across the app.

    These are hardcoded here (not stored in the DB) because they are
    enforced at the schema level and change rarely.

    TODO:
        - No DB call needed, just return the dict below.
        - Consider moving to a config file if enums grow significantly.
    """
    return {
        "staff_types": ["Contractor", "Employee", "Consultant"],
        "member_roles": ["Team Leader", "Member", "Delegate"],
        "team_statuses": ["Active", "Closed"],
        "user_roles": ["system_admin", "team_lead", "editor", "viewer"],
    }

