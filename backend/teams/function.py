"""
Teams router — CRUD and member management for the `teams` collection.

Business rules enforced here:
    [R1]  Max 5 active Members per team (Team Leader excluded from count).
    [R2]  Exactly 1 active Team Leader per team at any time.
    [R3]  Members and Delegates may belong to multiple teams simultaneously;
          Team Leaders may not (R10).
    [R5]  Teams are soft-deleted (status: "Closed"); no hard deletes.
    [R10] A Team Leader cannot be an active member of any other team.

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

class MemberEntry(BaseModel):
    """Represents one member entry inside a team's members array."""

    individual_id: str
    member_role: str = Field(..., pattern="^(Team Leader|Member|Delegate)$")


class TeamCreate(BaseModel):
    """Payload for creating a new team."""

    team_name: str = Field(..., min_length=1)
    location_id: Optional[str] = None
    org_leader_id: Optional[str] = None


class TeamUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    team_name: Optional[str] = None
    location_id: Optional[str] = None
    org_leader_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
async def list_teams() -> list:
    """
    Return all active teams (status != "Closed").

    TODO:
        - Inject Motor DB client and current user.
        - Query: db.teams.find({"status": {"$ne": "Closed"}})
        - Support optional filtering: ?location_id=, ?org_leader_id=, ?search=
        - Return paginated results.
        - For team_lead role, only return the team(s) they lead.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.get("/{team_id}")
async def get_team(team_id: str) -> dict:
    """
    Return a single team by its _id, including its members array.

    TODO:
        - Inject Motor DB client and current user.
        - Query: db.teams.find_one({"_id": ObjectId(team_id)})
        - Return 404 if not found.
        - Optionally join individual details for each member via a lookup.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_team(payload: TeamCreate) -> dict:
    """
    Create a new team.

    TODO:
        - Restrict to system_admin role only.
        - Set status: "Active", createdAt: datetime.utcnow() on insert.
        - Initialize members: [] and reportingHistory: [] arrays.
        - Return the inserted document.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.patch("/{team_id}")
async def update_team(team_id: str, payload: TeamUpdate) -> dict:
    """
    Update team metadata (name, location, org leader).

    TODO:
        - Restrict to system_admin role only.
        - Build a $set dict from non-None payload fields.
        - If org_leader_id changes, append an entry to reportingHistory
          with the previous leader, startDate, and endDate.
        - Return the updated document.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def close_team(team_id: str) -> None:
    """
    Soft-delete a team by setting status: "Closed" (R5 — no hard deletes).

    TODO:
        - Restrict to system_admin role only.
        - Set endDate on all active member entries before closing.
        - Update: db.teams.update_one({"_id": ...}, {"$set": {"status": "Closed"}})
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(team_id: str, payload: MemberEntry) -> dict:
    """
    Add a new member to a team.

    TODO:
        - Restrict to system_admin and the team's own team_lead.
        - Enforce R1: count active members with memberRole == "Member";
          reject with 409 if count >= 5.
        - Enforce R2: if memberRole == "Team Leader", check no other active
          leader exists on this team; reject with 409 if one does.
        - Enforce R10: if memberRole == "Team Leader", check the individual
          is not an active member (any role) on any other team; reject with 409 if so.
        - Set startDate: datetime.utcnow(), endDate: None on the new entry.
        - Push to members array: db.teams.update_one(..., {"$push": {"members": ...}})
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")


@router.delete("/{team_id}/members/{individual_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(team_id: str, individual_id: str) -> None:
    """
    Remove (close) a member's active entry on a team by setting endDate.

    TODO:
        - Restrict to system_admin and the team's own team_lead.
        - Do NOT delete the array entry — set endDate: datetime.utcnow()
          on the matching entry where endDate is null (preserves audit history).
        - If the removed member was the Team Leader, the team has no active
          leader — optionally warn in the response body.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet.")

