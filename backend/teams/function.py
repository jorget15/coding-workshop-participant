"""
Teams Lambda — standalone FastAPI app for the ``teams`` service.

Lambda URL: set TEAMS_LAMBDA_URL in the frontend .env.local.

Business rules enforced here:
    [R1]  Max 5 active members per team (Team Leader counts toward the cap).
    [R2]  Exactly 1 active Team Leader per team at any time.
    [R3]  Members and Delegates may belong to multiple teams simultaneously;
          Team Leaders may not (R10).
    [R5]  Teams are soft-deleted (status: "Closed"); no hard deletes.
    [R10] A Team Leader cannot be an active member of any other team.

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

from shared import create_app, serialize_doc, oid, make_history_entry, make_change_entry
from shared.auth import CurrentUser, get_current_user, require_role
from shared.db import get_db
from shared.logging import get_logger

logger = get_logger("teams")

# ---------------------------------------------------------------------------
# Standalone FastAPI app
# ---------------------------------------------------------------------------
app = create_app("ACME Teams Service")

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class MemberEntry(BaseModel):
    """Represents one member entry inside a team's members array."""

    person_id: str
    member_role: str = Field(..., pattern="^(Team Leader|Member|Delegate)$")


class TeamCreate(BaseModel):
    """Payload for creating a new team."""

    team_name: str = Field(..., min_length=1)
    description: Optional[str] = None
    location_id: Optional[str] = None


class TeamUpdate(BaseModel):
    """All fields optional — PATCH semantics."""

    team_name: Optional[str] = None
    description: Optional[str] = None
    location_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_teams(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    location_id: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    """Return all active (non-deleted) teams."""
    query: dict = {"isDeleted": {"$ne": True}}
    if location_id:
        query["teamHomeLocation"] = location_id
    if search:
        query["teamName"] = {"$regex": search, "$options": "i"}
    docs = await db["teams"].find(query).to_list(200)
    return [serialize_doc(d) for d in docs]


@router.get("/{team_id}")
async def get_team(
    team_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return a single team by _id, including its members array."""
    doc = await db["teams"].find_one({"_id": team_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team '{team_id}' not found.",
        )
    return serialize_doc(doc)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("system_admin"))])
async def create_team(
    payload: TeamCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Create a new team (system_admin only)."""
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "teamName": payload.team_name,
        "description": payload.description or "",
        "teamHomeLocation": payload.location_id,
        "members": [],
        "reportingHistory": [],
        "isDeleted": False,
        "deletedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db["teams"].insert_one(doc)
    team_id = str(result.inserted_id)
    doc["_id"] = result.inserted_id

    # R6: append to teamHistory collection
    hist = make_history_entry(
        event_type="team_created",
        description=f"{payload.team_name} created.",
        changed_by="system",
        new_state={"team_name": payload.team_name, "location": payload.location_id},
    )
    hist["_id"] = f"hist_{team_id}_{now}"
    hist["teamId"] = team_id
    await db["teamHistory"].insert_one(hist)

    logger.info("Created team", extra={"team_id": team_id, "team_name": payload.team_name})
    return serialize_doc(doc)


@router.patch("/{team_id}", dependencies=[Depends(require_role("system_admin"))])
async def update_team(
    team_id: str,
    payload: TeamUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Update team metadata (system_admin only)."""
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update.")

    # Capture previous state for audit
    old_doc = await db["teams"].find_one({"_id": team_id})
    if not old_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Team '{team_id}' not found.")

    field_map = {"team_name": "teamName", "location_id": "teamHomeLocation", "description": "description"}
    set_dict = {field_map.get(k, k): v for k, v in updates.items()}
    now = datetime.now(timezone.utc).isoformat()
    set_dict["updatedAt"] = now
    await db["teams"].update_one({"_id": team_id}, {"$set": set_dict})

    # R6: record what changed
    changed_fields = list(updates.keys())
    prev = {field_map.get(k, k): old_doc.get(field_map.get(k, k)) for k in updates}
    new = {field_map.get(k, k): v for k, v in updates.items()}
    hist = make_history_entry(
        event_type="team_updated",
        description=f"Updated {', '.join(changed_fields)}.",
        changed_by="system",
        previous_state=prev,
        new_state=new,
    )
    hist["_id"] = f"hist_{team_id}_{now}"
    hist["teamId"] = team_id
    await db["teamHistory"].insert_one(hist)

    doc = await db["teams"].find_one({"_id": team_id})
    return serialize_doc(doc)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("system_admin"))])
async def close_team(
    team_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> None:
    """Soft-delete a team (R5 — no hard deletes). Sets endDate on all active members."""
    team = await db["teams"].find_one({"_id": team_id})
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Team '{team_id}' not found.")

    now = datetime.now(timezone.utc).isoformat()

    # Collect active members before closing for history + individual changeHistory
    active_members = [m for m in team.get("members", []) if m.get("endDate") is None]

    await db["teams"].update_one(
        {"_id": team_id},
        {"$set": {
            "isDeleted": True,
            "deletedAt": now,
            "updatedAt": now,
            "members.$[active].endDate": now,
        }},
        array_filters=[{"active.endDate": None}],
    )

    # R6: team history
    hist = make_history_entry(
        event_type="team_deleted",
        description=f"Team '{team.get('teamName')}' closed. {len(active_members)} members released.",
        changed_by="system",
        previous_state={"active_member_count": len(active_members)},
    )
    hist["_id"] = f"hist_{team_id}_{now}"
    hist["teamId"] = team_id
    await db["teamHistory"].insert_one(hist)

    # Record LEFT_TEAM on each affected individual's changeHistory
    for m in active_members:
        await db["individuals"].update_one(
            {"_id": m["personId"]},
            {"$push": {"changeHistory": {
                "eventType": "LEFT_TEAM",
                "description": f"Removed from '{team.get('teamName')}' (team closed).",
                "occurredAt": now,
                "metadata": {"teamId": team_id, "teamName": team.get("teamName")},
            }}},
        )


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    team_id: str,
    payload: MemberEntry,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Add a member to a team. Enforces R1 (cap), R2 (one leader), R10 (leader exclusivity)."""
    if user.role not in ("system_admin", "team_lead"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system_admin or team_lead role required.")
    if user.role == "team_lead" and user.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only manage members of your own team.")
    team = await db["teams"].find_one({"_id": team_id})
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Team '{team_id}' not found.")
    if team.get("isDeleted"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="R5: cannot add members to a deleted team.")
    active_members = [m for m in team.get("members", []) if m.get("endDate") is None]
    # R1: max 5 active members per team (all roles count, including Team Leader)
    total_active = len(active_members)
    if total_active >= 5:
        logger.warning("R1 violation: team at capacity", extra={"team_id": team_id, "member_count": total_active})
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"R1: team '{team_id}' is at capacity ({total_active}/5 active members).",
        )
    # R2: only one active Team Leader per team
    if payload.member_role == "Team Leader":
        if any(m.get("memberRole") == "Team Leader" for m in active_members):
            logger.warning("R2 violation: team already has leader", extra={"team_id": team_id, "person_id": payload.person_id})
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"R2: team '{team_id}' already has an active Team Leader.",
            )
        # R10: a Team Leader cannot be an active leader on any other team
        other_team = await db["teams"].find_one({
            "_id": {"$ne": team_id},
            "isDeleted": {"$ne": True},
            "members": {"$elemMatch": {
                "personId": payload.person_id,
                "memberRole": "Team Leader",
                "endDate": None,
            }},
        })
        if other_team:
            logger.warning("R10 violation: leader on another team", extra={"person_id": payload.person_id, "other_team_id": str(other_team.get("_id"))})
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"R10: person '{payload.person_id}' is already an active Team Leader on team '{other_team.get('_id')}'.",
            )
    now = datetime.now(timezone.utc).isoformat()
    # Look up the individual for their name and staffType
    individual = await db["individuals"].find_one({"_id": payload.person_id})
    entry = {
        "personId": payload.person_id,
        "personName": individual["personName"] if individual else payload.person_id,
        "memberRole": payload.member_role,
        "staffTypeSnapshot": individual.get("staffType", "direct") if individual else "direct",
        "startDate": now,
        "endDate": None,
    }
    await db["teams"].update_one({"_id": team_id}, {
        "$push": {"members": entry},
        "$set": {"updatedAt": now},
    })

    # R6: teamHistory — record the addition
    hist = make_history_entry(
        event_type="member_added",
        description=f"{entry['personName']} joined as {payload.member_role}.",
        changed_by=user.user_id,
        new_state={"personId": payload.person_id, "memberRole": payload.member_role},
    )
    hist["_id"] = f"hist_{team_id}_{now}"
    hist["teamId"] = team_id
    await db["teamHistory"].insert_one(hist)

    # Individual changeHistory — record JOINED_TEAM
    change = make_change_entry(
        event_type="JOINED_TEAM",
        description=f"Joined '{team.get('teamName')}' as {payload.member_role}.",
        metadata={"teamId": team_id, "teamName": team.get("teamName"), "memberRole": payload.member_role},
    )
    await db["individuals"].update_one(
        {"_id": payload.person_id},
        {"$push": {"changeHistory": change}},
    )

    logger.info("Added member to team", extra={"team_id": team_id, "person_id": payload.person_id, "role": payload.member_role})
    doc = await db["teams"].find_one({"_id": team_id})
    return serialize_doc(doc)


@router.delete("/{team_id}/members/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    team_id: str,
    person_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Close a member's active entry (sets endDate). Preserves audit history (no hard delete)."""
    if user.role not in ("system_admin", "team_lead"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system_admin or team_lead role required.")
    if user.role == "team_lead" and user.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only manage members of your own team.")
    now = datetime.now(timezone.utc).isoformat()
    # Look up team + member info for history before we mutate
    team = await db["teams"].find_one({"_id": team_id})
    member_info = None
    if team:
        member_info = next((m for m in team.get("members", []) if m.get("personId") == person_id and m.get("endDate") is None), None)

    result = await db["teams"].update_one(
        {"_id": team_id, "members": {"$elemMatch": {"personId": person_id, "endDate": None}}},
        {"$set": {"members.$[entry].endDate": now, "updatedAt": now}},
        array_filters=[{"entry.personId": person_id, "entry.endDate": None}],
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active member '{person_id}' not found on team '{team_id}'.",
        )

    # R6: teamHistory — record the removal
    member_name = member_info.get("personName", person_id) if member_info else person_id
    member_role = member_info.get("memberRole", "Member") if member_info else "Member"
    hist = make_history_entry(
        event_type="member_removed",
        description=f"{member_name} ({member_role}) removed from team.",
        changed_by=user.user_id,
        previous_state={"personId": person_id, "memberRole": member_role},
    )
    hist["_id"] = f"hist_{team_id}_{now}"
    hist["teamId"] = team_id
    await db["teamHistory"].insert_one(hist)

    # Individual changeHistory — record LEFT_TEAM
    team_name = team.get("teamName", team_id) if team else team_id
    change = make_change_entry(
        event_type="LEFT_TEAM",
        description=f"Removed from '{team_name}'.",
        metadata={"teamId": team_id, "teamName": team_name, "memberRole": member_role},
    )
    await db["individuals"].update_one(
        {"_id": person_id},
        {"$push": {"changeHistory": change}},
    )

    logger.info("Removed member from team", extra={"team_id": team_id, "person_id": person_id})


@router.get("/{team_id}/history")
async def get_team_history(
    team_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list:
    """Return the full audit history for a team from the teamHistory collection."""
    docs = await db["teamHistory"].find({"teamId": team_id}).sort("changedAt", -1).to_list(500)
    return [serialize_doc(d) for d in docs]


# ---------------------------------------------------------------------------
# Mount router and expose Mangum Lambda handler
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/teams", tags=["teams"])

handler = Mangum(app, api_gateway_base_path="/api")

