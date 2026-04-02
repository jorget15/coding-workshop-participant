"""
Metadata Lambda — standalone FastAPI app for the ``metadata`` service.

Lambda URL: set METADATA_LAMBDA_URL in the frontend .env.local.

Provides:
    - Locations CRUD (system_admin writes, all authenticated users read)
    - Static enum values for dropdowns (staff types, member roles, team statuses)

Environment variables:
    MONGO_HOST / MONGO_PORT / MONGO_USER / MONGO_PASS / MONGO_NAME - DocumentDB connection (injected by Terraform).
    MONGO_NAME           - Database name (default: acme_team_mgmt).
    JWT_SECRET        - Secret used to verify Bearer tokens.
    JWT_ALGORITHM     - JWT algorithm (default: HS256).
    ALLOWED_ORIGINS   - Comma-separated CORS origins.
"""

import os
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from shared.auth import CurrentUser, get_current_user, require_role
from shared.db import get_db
from shared.logging import get_logger

logger = get_logger("metadata")


def _doc(d: dict) -> dict:
    if d and "_id" in d:
        d["_id"] = str(d["_id"])
    return d


# ---------------------------------------------------------------------------
# Standalone FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ACME Metadata Service",
    version="1.0.0",
)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _raw_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LocationCreate(BaseModel):
    """Payload for creating a new location."""

    name: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    country: str = Field(..., min_length=1)
    region: Optional[str] = None
    timezone: Optional[str] = None


class LocationUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    name: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes — Locations
# ---------------------------------------------------------------------------

@router.get("/locations")
async def list_locations(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> list:
    """Return all locations sorted by country then city."""
    docs = await db["locations"].find({}).sort([("country", 1), ("city", 1)]).to_list(500)
    logger.info("Listed locations", extra={"count": len(docs)})
    return [_doc(d) for d in docs]


@router.get("/locations/{location_id}")
async def get_location(
    location_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return a single location by _id."""
    doc = await db["locations"].find_one({"_id": location_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{location_id}' not found.",
        )
    return _doc(doc)


@router.post("/locations", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("system_admin"))])
async def create_location(
    payload: LocationCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Create a new location (system_admin only). 409 on duplicate city+country."""
    existing = await db["locations"].find_one({"city": payload.city, "country": payload.country})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Location '{payload.city}, {payload.country}' already exists.",
        )
    doc = {
        "name": payload.name,
        "city": payload.city,
        "country": payload.country,
        "region": payload.region,
        "timezone": payload.timezone,
    }
    result = await db["locations"].insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("Created location", extra={"location_id": str(result.inserted_id), "city": payload.city, "country": payload.country})
    return _doc(doc)


@router.patch("/locations/{location_id}", dependencies=[Depends(require_role("system_admin"))])
async def update_location(
    location_id: str,
    payload: LocationUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Update a location's details (system_admin only)."""
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update.")
    result = await db["locations"].update_one({"_id": location_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{location_id}' not found.",
        )
    doc = await db["locations"].find_one({"_id": location_id})
    return _doc(doc)


@router.delete("/locations/{location_id}", dependencies=[Depends(require_role("system_admin"))])
async def delete_location(
    location_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Soft-archive a location (system_admin only). Sets isActive: false."""
    result = await db["locations"].update_one({"_id": location_id}, {"$set": {"isActive": False}})
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{location_id}' not found.",
        )
    doc = await db["locations"].find_one({"_id": location_id})
    return _doc(doc)


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
        "staff_types": ["direct", "non-direct"],
        "member_roles": ["Team Leader", "Member", "Delegate"],
        "user_roles": ["system_admin", "team_lead", "editor", "viewer"],
    }


# ---------------------------------------------------------------------------
# Mount router and expose Mangum Lambda handler
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/metadata", tags=["metadata"])

handler = Mangum(app, api_gateway_base_path="/api")

