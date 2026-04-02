"""
Achievements Lambda — standalone FastAPI app for the ``achievements`` service.

Lambda URL: set ACHIEVEMENTS_LAMBDA_URL in the frontend .env.local.

Business rules enforced here:
    - Achievements may be scoped to a team (teamId set) or org-wide (teamId null).
    - An achievement references one or more individuals via the awardedTo array.
    - Only system_admin and the relevant team_lead may create/edit achievements.
    - No hard deletes — achievements are a permanent audit log.

Environment variables:
    MONGO_HOST / MONGO_PORT / MONGO_USER / MONGO_PASS / MONGO_NAME - DocumentDB connection (injected by Terraform).
    MONGO_NAME           - Database name (default: acme_team_mgmt).
    JWT_SECRET        - Secret used to verify Bearer tokens.
    JWT_ALGORITHM     - JWT algorithm (default: HS256).
    ALLOWED_ORIGINS   - Comma-separated CORS origins.
"""

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from shared import create_app, serialize_doc, oid
from shared.auth import CurrentUser, get_current_user, require_role
from shared.db import get_db
from shared.logging import get_logger

logger = get_logger("achievements")

# ---------------------------------------------------------------------------
# Standalone FastAPI app
# ---------------------------------------------------------------------------
app = create_app("ACME Achievements Service")

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AchievementCreate(BaseModel):
    """Payload for recording a new achievement."""

    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    team_id: Optional[str] = Field(
        default=None,
        description="Leave null for org-wide / bounty-style achievements.",
    )
    awarded_to: list[str] = Field(
        default_factory=list,
        description="List of individual _id values receiving this achievement. Empty for org-wide achievements.",
    )
    achievement_date: Optional[str] = Field(
        default=None,
        description="ISO 8601 date string. Defaults to today if omitted.",
    )


class AchievementUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    title: Optional[str] = None
    description: Optional[str] = None
    achievement_date: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_achievements(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    team_id: Optional[str] = None,
    individual_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> list:
    """Return achievements filtered by role scope and optional query params."""
    query: dict = {}
    if user.role == "team_lead":
        query["teamId"] = user.team_id
    elif user.role not in ("system_admin", "editor", "viewer"):
        # members only see their own
        query["awardedTo"] = {"$in": [user.user_id]}
    if team_id:
        query["teamId"] = team_id
    if individual_id:
        query["awardedTo"] = {"$in": [individual_id]}
    if from_date or to_date:
        date_filter: dict = {}
        if from_date:
            date_filter["$gte"] = from_date
        if to_date:
            date_filter["$lte"] = to_date
        query["achievementDate"] = date_filter
    docs = await db["achievements"].find(query).sort("achievementDate", -1).to_list(200)
    logger.info("Listed achievements", extra={"count": len(docs), "user_id": user.user_id, "filters": {k: v for k, v in {"team_id": team_id, "individual_id": individual_id}.items() if v}})
    return [serialize_doc(d) for d in docs]


@router.get("/{achievement_id}")
async def get_achievement(
    achievement_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return a single achievement. Enforces visibility by role."""
    doc = await db["achievements"].find_one({"_id": achievement_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Achievement '{achievement_id}' not found.",
        )
    # Visibility check — viewers/editors can see all achievements
    is_open = user.role in ("system_admin", "viewer", "editor")
    is_lead_of_team = user.role == "team_lead" and user.team_id == doc.get("teamId")
    is_recipient = user.user_id in (doc.get("awardedTo") or [])
    if not (is_open or is_lead_of_team or is_recipient):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: not awarded to you and not your team.",
        )
    return serialize_doc(doc)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_achievement(
    payload: AchievementCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(require_role("system_admin", "team_lead")),
) -> dict:
    """Record a new achievement. team_lead may only award within their own team."""
    if payload.team_id:
        if user.role == "team_lead" and user.team_id != payload.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not the active leader of this team.",
            )
        team = await db["teams"].find_one({"_id": payload.team_id})
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Team '{payload.team_id}' not found.")
    # Validate all awardedTo individuals exist and are active
    for ind_id in payload.awarded_to:
        ind = await db["individuals"].find_one({"_id": ind_id, "isDeleted": {"$ne": True}})
        if not ind:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Individual '{ind_id}' not found or inactive.",
            )
    doc = {
        "title": payload.title,
        "description": payload.description,
        "teamId": payload.team_id,
        "awardedTo": payload.awarded_to,
        "achievementDate": payload.achievement_date or datetime.now(timezone.utc).date().isoformat(),
        "createdAt": datetime.now(timezone.utc),
        "createdBy": user.user_id,
    }
    result = await db["achievements"].insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("Created achievement", extra={"achievement_id": str(result.inserted_id), "title": payload.title, "scope": "team" if payload.team_id else "org"})
    return serialize_doc(doc)


@router.patch("/{achievement_id}")
async def update_achievement(
    achievement_id: str,
    payload: AchievementUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(require_role("system_admin", "team_lead")),
) -> dict:
    """Update an achievement's metadata. awardedTo is intentionally not patchable."""
    oid = achievement_id
    doc = await db["achievements"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Achievement '{achievement_id}' not found.")
    if user.role == "team_lead" and doc.get("createdBy") != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creating team_lead or system_admin may edit this achievement.",
        )
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update.")
    field_map = {"achievement_date": "achievementDate"}
    set_dict = {field_map.get(k, k): v for k, v in updates.items()}
    await db["achievements"].update_one({"_id": oid}, {"$set": set_dict})
    doc = await db["achievements"].find_one({"_id": oid})
    return serialize_doc(doc)


# ---------------------------------------------------------------------------
# Mount router and expose Mangum Lambda handler
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/achievements", tags=["achievements"])

handler = Mangum(app, api_gateway_base_path="/api")

