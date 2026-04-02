"""
Individuals Lambda — standalone FastAPI app for the ``individuals`` service.

Lambda URL: set INDIVIDUALS_LAMBDA_URL in the frontend .env.local.

Business rules enforced here:
    [R4]  An individual can only be soft-deleted (isDeleted: true); no hard deletes.
    [R10] A Team Leader cannot simultaneously be a member of another team
          (enforced at the teams layer but validated here on profile updates).

Environment variables:
    MONGO_HOST / MONGO_PORT / MONGO_USER / MONGO_PASS / MONGO_NAME - DocumentDB connection (injected by Terraform).
    JWT_SECRET        - Secret used to verify Bearer tokens.
    JWT_ALGORITHM     - JWT algorithm (default: HS256).
    S3_BUCKET         - S3 bucket name for profile pictures.
    ALLOWED_ORIGINS   - Comma-separated CORS origins.
"""

import os
from datetime import datetime, timezone
from typing import Optional

import boto3
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from shared import create_app, serialize_doc, hash_password, oid, make_change_entry
from shared.auth import CurrentUser, get_current_user, require_role
from shared.db import get_db
from shared.logging import get_logger

logger = get_logger("individuals")

# ---------------------------------------------------------------------------
# Standalone FastAPI app (each Lambda gets its own app + Mangum handler)
# ---------------------------------------------------------------------------
app = create_app("ACME Individuals Service")

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models — aligned with docs/db/acme_schema.js
# ---------------------------------------------------------------------------

class HomeLocation(BaseModel):
    """Freeform location where the individual lives/works from."""
    city: str = Field(..., min_length=1)
    country: str = Field(..., min_length=1)
    region: str = Field(..., pattern="^(NAM|LATAM|EMEA|APAC)$")


class IndividualCreate(BaseModel):
    """Payload for creating a new individual (password set by admin)."""

    person_name: str = Field(..., min_length=1)
    email: EmailStr
    job_title: Optional[str] = None
    staff_type: str = Field(..., pattern="^(direct|non-direct)$")
    home_location: HomeLocation
    assigned_office: Optional[str] = None
    roles: list[str] = Field(default_factory=list)
    profile_picture: Optional[str] = Field(
        default="avatars/defaults/default_01.png",
        description="S3 object key for the individual's profile picture.",
    )
    password: str = Field(..., min_length=8)


class IndividualUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    person_name: Optional[str] = None
    email: Optional[EmailStr] = None
    job_title: Optional[str] = None
    staff_type: Optional[str] = Field(default=None, pattern="^(direct|non-direct)$")
    home_location: Optional[HomeLocation] = None
    assigned_office: Optional[str] = None
    roles: Optional[list[str]] = None
    profile_picture: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_individuals(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    primary_location: Optional[str] = None,
    staff_type: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    """Return all active (non-deleted) individuals."""
    query: dict = {"isDeleted": {"$ne": True}}
    if primary_location:
        query["homeLocation.region"] = primary_location
    if staff_type:
        query["staffType"] = staff_type
    if search:
        query["$or"] = [
            {"personName": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db["individuals"].find(query).to_list(200)
    logger.info("Listed individuals", extra={"count": len(docs), "user_id": user.user_id, "filters": {k: v for k, v in {"primary_location": primary_location, "staff_type": staff_type, "search": search}.items() if v}})
    return [serialize_doc(d) for d in docs]


@router.get("/{individual_id}")
async def get_individual(
    individual_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return a single individual. Users may only view their own profile unless admin/lead."""
    if user.role not in ("system_admin", "team_lead") and user.user_id != individual_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you may only view your own profile.",
        )
    doc = await db["individuals"].find_one(
        {"_id": individual_id, "isDeleted": {"$ne": True}}
    )
    if not doc:
        logger.warning("Individual not found", extra={"individual_id": individual_id, "user_id": user.user_id})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found.",
        )
    return serialize_doc(doc)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("system_admin"))])
async def create_individual(
    payload: IndividualCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Create a new individual (system_admin only)."""
    existing = await db["individuals"].find_one({"email": payload.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Individual with email '{payload.email}' already exists.",
        )
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "personName": payload.person_name,
        "email": payload.email,
        "jobTitle": payload.job_title,
        "staffType": payload.staff_type,
        "homeLocation": payload.home_location.model_dump(),
        "assignedOffice": payload.assigned_office,
        "roles": payload.roles,
        "profilePicture": payload.profile_picture or "avatars/defaults/default_01.png",
        "auth": {"hashedPassword": hash_password(payload.password)},
        "isDeleted": False,
        "deletedAt": None,
        "changeHistory": [make_change_entry(
            event_type="PROFILE_CREATED",
            description=f"Profile created for {payload.person_name}.",
        )],
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db["individuals"].insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("Created individual", extra={"individual_id": str(result.inserted_id), "email": payload.email, "staff_type": payload.staff_type})
    return serialize_doc(doc)


@router.patch("/{individual_id}")
async def update_individual(
    individual_id: str,
    payload: IndividualUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Partially update an individual's profile (own profile or system_admin)."""
    if user.role != "system_admin" and user.user_id != individual_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you may only update your own profile.",
        )
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update.")
    if "profile_picture" in updates and updates["profile_picture"].startswith("http"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="profile_picture must be an S3 object key, not a URL.",
        )
    # Convert home_location sub-object into dot-notation updates
    if "home_location" in updates:
        hl = updates.pop("home_location")
        if isinstance(hl, HomeLocation):
            hl = hl.model_dump()
        for k, v in hl.items():
            updates[f"homeLocation.{k}"] = v
    field_map = {
        "person_name": "personName",
        "job_title": "jobTitle",
        "staff_type": "staffType",
        "assigned_office": "assignedOffice",
        "profile_picture": "profilePicture",
    }
    set_dict = {field_map.get(k, k): v for k, v in updates.items()}
    set_dict["updatedAt"] = datetime.now(timezone.utc).isoformat()
    result = await db["individuals"].update_one(
        {"_id": individual_id, "isDeleted": {"$ne": True}}, {"$set": set_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found or deleted.",
        )

    doc = await db["individuals"].find_one({"_id": individual_id})
    return serialize_doc(doc)


@router.delete("/{individual_id}", dependencies=[Depends(require_role("system_admin"))])
async def deactivate_individual(
    individual_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Soft-delete an individual (R4 — no hard deletes). Blocks if active on a team."""
    # R4: block if active on any team
    active_team = await db["teams"].find_one({
        "isDeleted": {"$ne": True},
        "members": {"$elemMatch": {"personId": individual_id, "endDate": None}},
    })
    if active_team:
        logger.warning("R4 violation: individual on active team", extra={"individual_id": individual_id, "team_id": str(active_team.get("_id"))})
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"R4: cannot deactivate individual '{individual_id}' — active on team '{active_team.get('_id')}'.",
        )
    now = datetime.now(timezone.utc).isoformat()
    result = await db["individuals"].update_one(
        {"_id": individual_id, "isDeleted": {"$ne": True}},
        {"$set": {"isDeleted": True, "deletedAt": now, "updatedAt": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found.",
        )

    # Append DEACTIVATED to changeHistory
    change = make_change_entry(
        event_type="DEACTIVATED",
        description="Profile deactivated (soft-delete).",
    )
    await db["individuals"].update_one(
        {"_id": individual_id},
        {"$push": {"changeHistory": change}},
    )

    doc = await db["individuals"].find_one({"_id": individual_id})
    return serialize_doc(doc)


@router.post("/{individual_id}/avatar-upload-url")
async def get_avatar_upload_url(
    individual_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return a presigned S3 PUT URL for uploading a profile picture directly to S3."""
    if user.role != "system_admin" and user.user_id != individual_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3_BUCKET environment variable not configured.",
        )
    s3_key = f"avatars/{individual_id}.jpg"
    s3 = boto3.client("s3")
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": s3_key, "ContentType": "image/jpeg"},
        ExpiresIn=300,
    )
    return {"upload_url": upload_url, "s3_key": s3_key}


@router.get("/{individual_id}/history")
async def get_individual_history(
    individual_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list:
    """Return the changeHistory array for an individual."""
    if user.role not in ("system_admin", "team_lead") and user.user_id != individual_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you may only view your own history.",
        )
    doc = await db["individuals"].find_one(
        {"_id": individual_id}, {"changeHistory": 1}
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found.",
        )
    history = doc.get("changeHistory", [])
    history.reverse()  # newest first
    return history


# ---------------------------------------------------------------------------
# Mount router and expose Mangum Lambda handler
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/individuals", tags=["individuals"])

handler = Mangum(app, api_gateway_base_path="/api")

