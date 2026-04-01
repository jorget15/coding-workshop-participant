"""
Individuals router — CRUD for the `individuals` collection.

Business rules enforced here:
    [R4]  An individual can only be soft-deleted (isActive: false); no hard deletes.
    [R6]  staffType must be one of: Contractor, Employee, Consultant.
    [R10] A Team Leader cannot simultaneously be a member of another team
          (enforced at the teams layer but validated here on profile updates).

Dependencies:
    - Motor async DocumentDB client (injected via FastAPI Depends)
    - JWT auth dependency to identify the calling user and their role
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

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

@router.get("/")
async def list_individuals() -> list:
    """
    Return all active individuals (isActive: true).

    TODO:
        - Inject Motor DB client via Depends(get_db).
        - Inject current user via Depends(get_current_user) and enforce
          that only system_admin or team_lead roles may access this list.
        - Query: db.individuals.find({"isActive": True}, {"passwordHash": 0})
        - Support optional query params: ?location_id=, ?staff_type=, ?search=
        - Return paginated results (limit/offset or cursor-based).
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.get("/{individual_id}")
async def get_individual(individual_id: str) -> dict:
    """
    Return a single individual by their _id.

    TODO:
        - Inject Motor DB client and current user.
        - Users may only fetch their own profile unless they are system_admin or team_lead.
        - Query: db.individuals.find_one({"_id": ObjectId(individual_id), "isActive": True})
        - Exclude passwordHash from the response.
        - Return 404 if not found or isActive is false.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_individual(payload: IndividualCreate) -> dict:
    """
    Create a new individual.

    TODO:
        - Restrict to system_admin role only.
        - Hash payload.password with passlib[bcrypt] before storing.
        - Check for duplicate email before inserting.
        - Set isActive: True, createdAt: datetime.utcnow() on insert.
        - Return the inserted document (without passwordHash).
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.patch("/{individual_id}")
async def update_individual(individual_id: str, payload: IndividualUpdate) -> dict:
    """
    Partially update an individual's profile.

    TODO:
        - Allow users to update their own profile; system_admin can update anyone.
        - If payload includes a new profile_picture key, validate it is a valid
          S3 object key (not a full URL) — the UI should upload directly to S3
          via presigned URL first, then PATCH with the resulting key.
        - Build a $set dict from only the non-None payload fields.
        - Return the updated document (without passwordHash).
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.delete("/{individual_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_individual(individual_id: str) -> None:
    """
    Soft-delete an individual by setting isActive: false (R4 — no hard deletes).

    TODO:
        - Restrict to system_admin role only.
        - Check the individual is not currently an active member of any team
          before deactivating. If they are, return 409 Conflict with details.
        - Update: db.individuals.update_one({"_id": ...}, {"$set": {"isActive": False}})
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.get("/{individual_id}/profile-picture-upload-url")
async def get_profile_picture_upload_url(individual_id: str) -> dict:
    """
    Return a short-lived S3 presigned PUT URL so the client can upload
    a profile picture directly to S3 without proxying through Lambda.

    TODO:
        - Restrict to the individual themselves or system_admin.
        - Use boto3 S3 client to generate a presigned URL:
              s3.generate_presigned_url(
                  "put_object",
                  Params={"Bucket": S3_BUCKET, "Key": f"avatars/{individual_id}.jpg"},
                  ExpiresIn=300,
              )
        - Return {"upload_url": "...", "key": "avatars/{individual_id}.jpg"}.
        - After upload completes the client should PATCH the individual's
          profile_picture field with the returned key.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")

