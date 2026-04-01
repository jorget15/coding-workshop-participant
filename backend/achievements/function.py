"""
Achievements router — CRUD for the `achievements` collection.

Business rules enforced here:
    - Achievements may be scoped to a team (teamId set) or org-wide (teamId null).
    - An achievement references one or more individuals via the awardedTo array.
    - Only system_admin and the relevant team_lead may create/edit achievements.
    - No hard deletes — achievements are a permanent audit log.

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

class AchievementCreate(BaseModel):
    """Payload for recording a new achievement."""

    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    team_id: Optional[str] = Field(
        default=None,
        description="Leave null for org-wide / bounty-style achievements.",
    )
    awarded_to: list[str] = Field(
        ...,
        min_length=1,
        description="List of individual _id values receiving this achievement.",
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

@router.get("/")
async def list_achievements() -> list:
    """
    Return achievements, optionally filtered.

    TODO:
        - Inject Motor DB client and current user.
        - Support query params: ?team_id=, ?individual_id=, ?from_date=, ?to_date=
        - If team_id is omitted, return all achievements the caller is allowed to see:
              system_admin: all achievements
              team_lead: achievements for their team(s)
              member: only their own (awarded_to contains their individual_id)
        - Sort by achievementDate descending.
        - Return paginated results.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.get("/{achievement_id}")
async def get_achievement(achievement_id: str) -> dict:
    """
    Return a single achievement by its _id.

    TODO:
        - Inject Motor DB client and current user.
        - Query: db.achievements.find_one({"_id": ObjectId(achievement_id)})
        - Return 404 if not found.
        - Enforce visibility: caller must be system_admin, the awarding team_lead,
          or one of the individuals in the awardedTo array.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_achievement(payload: AchievementCreate) -> dict:
    """
    Record a new achievement.

    TODO:
        - Restrict to system_admin and team_lead roles.
        - If team_id is provided, verify the team exists and the caller
          is either system_admin or the active leader of that team.
        - Validate all individual_ids in awarded_to exist and are active.
        - Set createdAt: datetime.utcnow() on insert.
        - Return the inserted document.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.patch("/{achievement_id}")
async def update_achievement(achievement_id: str, payload: AchievementUpdate) -> dict:
    """
    Update an achievement's metadata (title, description, date).

    TODO:
        - Restrict to system_admin and the team_lead who created it.
        - awardedTo is intentionally NOT patchable here to preserve audit integrity;
          create a new achievement instead.
        - Build a $set dict from non-None payload fields.
        - Return the updated document.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")

