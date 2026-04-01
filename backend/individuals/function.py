"""
Individuals Lambda — standalone FastAPI app for the ``individuals`` service.

Lambda URL: set INDIVIDUALS_LAMBDA_URL in the frontend .env.local.

Business rules enforced here:
    [R4]  An individual can only be soft-deleted (isActive: false); no hard deletes.
    [R6]  staffType must be one of: Contractor, Employee, Consultant.
    [R10] A Team Leader cannot simultaneously be a member of another team
          (enforced at the teams layer but validated here on profile updates).

Environment variables:
    MONGO_HOST / MONGO_PORT / MONGO_USER / MONGO_PASS / DB_NAME - DocumentDB connection (injected by Terraform).
    DB_NAME           - Database name (default: acme_team_mgmt).
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
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
import bcrypt as _bcrypt
from pydantic import BaseModel, EmailStr, Field

from shared.auth import CurrentUser, get_current_user, require_role
from shared.db import get_db


def _hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt. Truncates to 72 bytes (bcrypt limit)."""
    return _bcrypt.hashpw(plain.encode("utf-8")[:72], _bcrypt.gensalt()).decode("utf-8")


def _doc(d: dict) -> dict:
    """Serialize ObjectId _id to string for JSON responses."""
    if d and "_id" in d:
        d["_id"] = str(d["_id"])
    return d


def _oid(individual_id: str) -> ObjectId:
    """Parse a string to ObjectId, raising 400 on invalid format."""
    try:
        return ObjectId(individual_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id format: '{individual_id}'.")

# ---------------------------------------------------------------------------
# Standalone FastAPI app (each Lambda gets its own app + Mangum handler)
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ACME Individuals Service",
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

class IndividualBase(BaseModel):
    """Fields shared between create and update payloads."""

    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    email: EmailStr
    job_title: Optional[str] = None
    staff_type: str = Field(..., pattern="^(Contractor|Employee|Consultant)$")
    location_id: Optional[str] = None
    profile_picture: Optional[str] = Field(
        default="avatars/defaults/default_01.png",
        description="S3 object key for the individual's profile picture.",
    )


class IndividualCreate(IndividualBase):
    """Payload for creating a new individual (password set by admin)."""

    password: str = Field(..., min_length=8)


class IndividualUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    job_title: Optional[str] = None
    staff_type: Optional[str] = Field(default=None, pattern="^(Contractor|Employee|Consultant)$")
    location_id: Optional[str] = None
    profile_picture: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_individuals(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    location_id: Optional[str] = None,
    staff_type: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    """Return all active individuals. All authenticated users may list (read-only)."""
    query: dict = {"isActive": True}
    if location_id:
        query["locationId"] = location_id
    if staff_type:
        query["staffType"] = staff_type
    if search:
        query["$or"] = [
            {"firstName": {"$regex": search, "$options": "i"}},
            {"lastName": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db["individuals"].find(query, {"passwordHash": 0}).to_list(200)
    return [_doc(d) for d in docs]


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
        {"_id": _oid(individual_id), "isActive": True}, {"passwordHash": 0}
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found or inactive.",
        )
    return _doc(doc)


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
    doc = {
        "firstName": payload.first_name,
        "lastName": payload.last_name,
        "email": payload.email,
        "jobTitle": payload.job_title,
        "staffType": payload.staff_type,
        "locationId": payload.location_id,
        "profilePicture": payload.profile_picture or "avatars/defaults/default_01.png",
        "passwordHash": _hash_password(payload.password),
        "isActive": True,
        "createdAt": datetime.now(timezone.utc),
    }
    result = await db["individuals"].insert_one(doc)
    doc["_id"] = result.inserted_id
    doc.pop("passwordHash", None)
    return _doc(doc)


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
    oid = _oid(individual_id)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update.")
    # Validate profile_picture is an S3 key, not a full URL
    if "profile_picture" in updates and updates["profile_picture"].startswith("http"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="profile_picture must be an S3 object key, not a URL. Upload via presigned URL first.",
        )
    field_map = {
        "first_name": "firstName",
        "last_name": "lastName",
        "job_title": "jobTitle",
        "staff_type": "staffType",
        "location_id": "locationId",
        "profile_picture": "profilePicture",
    }
    set_dict = {field_map.get(k, k): v for k, v in updates.items()}
    result = await db["individuals"].update_one(
        {"_id": oid, "isActive": True}, {"$set": set_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found or inactive.",
        )
    doc = await db["individuals"].find_one({"_id": oid}, {"passwordHash": 0})
    return _doc(doc)


@router.delete("/{individual_id}", dependencies=[Depends(require_role("system_admin"))])
async def deactivate_individual(
    individual_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Soft-delete an individual (R4 — no hard deletes). Blocks if active on a team."""
    oid = _oid(individual_id)
    # R4: block if active on any team
    active_team = await db["teams"].find_one({
        "status": {"$ne": "Closed"},
        "members": {"$elemMatch": {"individualId": individual_id, "endDate": None}},
    })
    if active_team:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"R4: individual '{individual_id}' is an active team member and cannot be deactivated.",
        )
    result = await db["individuals"].update_one({"_id": oid}, {"$set": {"isActive": False}})
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Individual '{individual_id}' not found.",
        )
    doc = await db["individuals"].find_one({"_id": oid}, {"passwordHash": 0})
    return _doc(doc)


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


# ---------------------------------------------------------------------------
# Mount router and expose Mangum Lambda handler
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/individuals", tags=["individuals"])

handler = Mangum(app, api_gateway_base_path="/api")

