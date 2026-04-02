"""
Auth Lambda — login and seed endpoints.

Routes:
    POST /login   - Verify credentials, return signed JWT.
    POST /refresh - Accept a valid (non-expired) token, return a new one.
    POST /seed    - Seed test users and locations into the database.
                    Only available when IS_LOCAL=true or when the DB is empty.

Environment variables (injected by Terraform):
    JWT_SECRET      - HMAC secret used to sign tokens.
    JWT_ALGORITHM   - Algorithm (default: HS256).
    JWT_EXPIRE_MINS - Token lifetime in minutes (default: 60).
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import hashlib
import secrets
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from shared.db import get_db
from shared.logging import get_logger

logger = get_logger("auth-lambda")

app = FastAPI(title="ACME Auth Service")
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    username: str
    team_id: Optional[str] = None


class RefreshRequest(BaseModel):
    token: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash(password: str) -> str:
    """Hash a password using PBKDF2-SHA256 (stdlib — no binary deps)."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 260000)
    return f"$pbkdf2-sha256${salt}${dk.hex()}"


def _verify_password(plain: str, stored_hash: str) -> bool:
    """Verify a password against a $pbkdf2-sha256$salt$hash string."""
    try:
        # Format: $pbkdf2-sha256$<salt>$<dk_hex>
        # split("$") → ['', 'pbkdf2-sha256', salt, dk_hex]
        parts = stored_hash.split("$")
        if len(parts) != 4:
            return False
        _, _algo, salt, dk_hex = parts
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt.encode("utf-8"), 260000)
        return secrets.compare_digest(dk.hex(), dk_hex)
    except (ValueError, AttributeError):
        return False


def _sign_token(payload: dict) -> str:
    """Sign a JWT with the configured secret and expiry."""
    from jose import jwt as jose_jwt

    secret = os.environ["JWT_SECRET"]
    algorithm = os.getenv("JWT_ALGORITHM", "HS256")
    expire_mins = int(os.getenv("JWT_EXPIRE_MINS", "60"))

    payload = {
        **payload,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_mins),
        "iat": datetime.now(timezone.utc),
    }
    return jose_jwt.encode(payload, secret, algorithm=algorithm)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive a JWT.",
    responses={
        401: {"description": "Invalid username or password."},
        403: {"description": "Account is inactive."},
    },
)
async def login(
    body: LoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    # Look up individual by email — active only
    individual = await db["individuals"].find_one(
        {"email": body.email, "isDeleted": {"$ne": True}}
    )

    # Identical error for missing user or wrong password — prevents user enumeration
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
    )

    if individual is None:
        logger.warning("Login failed: email not found", extra={"email": body.email})
        raise _invalid

    auth_block = individual.get("auth") or {}
    hashed: Optional[str] = auth_block.get("hashedPassword")
    if not hashed:
        logger.warning("Login failed: no password hash", extra={"email": body.email})
        raise _invalid

    if not _verify_password(body.password, hashed):
        logger.warning("Login failed: wrong password", extra={"email": body.email})
        raise _invalid

    # Stamp lastLogin — fire-and-forget, don't block the response
    await db["individuals"].update_one(
        {"_id": individual["_id"]},
        {"$set": {"auth.lastLogin": datetime.now(timezone.utc).isoformat()}},
    )

    user_id = str(individual["_id"])
    username = individual.get("personName", "")

    # Determine role — check for system_admin flag first, then team leadership
    roles: list = individual.get("roles", [])
    if "system_admin" in roles:
        role = "system_admin"
        team_id = None
    else:
        # Check if this individual is an active Leader on any team
        team = await db["teams"].find_one(
            {
                "isActive": True,
                "members": {
                    "$elemMatch": {
                        "memberId": user_id,
                        "memberRole": "Leader",
                        "endDate": None,
                    }
                },
            }
        )
        if team:
            role = "team_lead"
            team_id = str(team["_id"])
        elif "editor" in roles:
            role = "editor"
            # Find their current active team membership
            member_team = await db["teams"].find_one(
                {
                    "isActive": True,
                    "members": {
                        "$elemMatch": {"memberId": user_id, "endDate": None}
                    },
                }
            )
            team_id = str(member_team["_id"]) if member_team else None
        else:
            role = "viewer"
            member_team = await db["teams"].find_one(
                {
                    "isActive": True,
                    "members": {
                        "$elemMatch": {"memberId": user_id, "endDate": None}
                    },
                }
            )
            team_id = str(member_team["_id"]) if member_team else None

    token = _sign_token(
        {"sub": user_id, "username": username, "role": role, "team_id": team_id}
    )
    logger.info("Login successful", extra={"user_id": user_id, "role": role, "team_id": team_id})
    return TokenResponse(
        access_token=token,
        role=role,
        user_id=user_id,
        username=username,
        team_id=team_id,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a valid token for a fresh one.",
    responses={
        401: {"description": "Token is invalid or expired."},
    },
)
async def refresh(
    body: RefreshRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    from jose import ExpiredSignatureError, JWTError
    from jose import jwt as jose_jwt
    from bson import ObjectId

    secret = os.environ["JWT_SECRET"]
    algorithm = os.getenv("JWT_ALGORITHM", "HS256")

    try:
        payload = jose_jwt.decode(body.token, secret, algorithms=[algorithm])
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired.")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    user_id = payload.get("sub")
    individual = await db["individuals"].find_one({"_id": user_id})
    if not individual or individual.get("isDeleted"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated.")

    new_token = _sign_token({
        "sub": user_id,
        "username": payload.get("username"),
        "role": payload.get("role"),
        "team_id": payload.get("team_id"),
    })
    return TokenResponse(
        access_token=new_token,
        role=payload.get("role", "viewer"),
        user_id=user_id,
        username=payload.get("username", ""),
        team_id=payload.get("team_id"),
    )


# ---------------------------------------------------------------------------
# Seed endpoint — populates the database with test users & locations.
# Runs inside Lambda (VPC access to DocumentDB). Idempotent.
# ---------------------------------------------------------------------------

_SEED_USERS = [
    {
        "_id": "ind_001",
        "personName": "Alice Smith",
        "email": "alice@acme.com",
        "jobTitle": "Engineering Manager",
        "staffType": "direct",
        "primaryLocation": "loc_hq",
        "roles": ["system_admin"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False,
        "deletedAt": None,
        "auth": {"hashedPassword": ""},  # filled at runtime
        "_password": "Admin1234!",
    },
    {
        "_id": "ind_002",
        "personName": "Bob Jones",
        "email": "bob@acme.com",
        "jobTitle": "Team Lead",
        "staffType": "direct",
        "primaryLocation": "loc_hq",
        "roles": ["team_lead"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False,
        "deletedAt": None,
        "auth": {"hashedPassword": ""},
        "_password": "Lead1234!",
    },
    {
        "_id": "ind_003",
        "personName": "Carol White",
        "email": "carol@acme.com",
        "jobTitle": "Senior Developer",
        "staffType": "direct",
        "primaryLocation": "loc_hq",
        "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False,
        "deletedAt": None,
        "auth": {"hashedPassword": ""},
        "_password": "Editor1234!",
    },
    {
        "_id": "ind_004",
        "personName": "Dan Brown",
        "email": "dan@acme.com",
        "jobTitle": "Analyst",
        "staffType": "non-direct",
        "primaryLocation": "loc_hq",
        "roles": ["viewer"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False,
        "deletedAt": None,
        "auth": {"hashedPassword": ""},
        "_password": "Viewer1234!",
    },
]

_SEED_LOCATIONS = [
    {
        "_id": "loc_hq",
        "name": "ACME Headquarters",
        "city": "Miami",
        "country": "US",
        "region": "NAM",
        "timezone": "America/New_York",
    },
    {
        "_id": "loc_london",
        "name": "ACME London Office",
        "city": "London",
        "country": "UK",
        "region": "EU",
        "timezone": "Europe/London",
    },
]

_SEED_TEAMS = [
    {
        "_id": "team_001",
        "teamName": "Platform Engineering",
        "description": "Core infrastructure and DevOps platform team.",
        "primaryLocation": "loc_hq",
        "members": [
            {
                "personId": "ind_002",
                "personName": "Bob Jones",
                "memberRole": "Team Leader",
                "staffTypeSnapshot": "direct",
                "startDate": "2025-01-15T00:00:00Z",
                "endDate": None,
            },
            {
                "personId": "ind_003",
                "personName": "Carol White",
                "memberRole": "Member",
                "staffTypeSnapshot": "direct",
                "startDate": "2025-02-01T00:00:00Z",
                "endDate": None,
            },
            {
                "personId": "ind_004",
                "personName": "Dan Brown",
                "memberRole": "Delegate",
                "staffTypeSnapshot": "non-direct",
                "startDate": "2025-03-01T00:00:00Z",
                "endDate": None,
            },
        ],
        "reportingHistory": [
            {
                "orgLeaderId": "ind_001",
                "orgLeaderName": "Alice Smith",
                "startDate": "2025-01-15T00:00:00Z",
                "endDate": None,
            }
        ],
        "teamHistory": [
            {
                "eventType": "TEAM_CREATED",
                "description": "Platform Engineering team established.",
                "occurredAt": "2025-01-15T00:00:00Z",
            }
        ],
        "isDeleted": False,
        "deletedAt": None,
    },
    {
        "_id": "team_002",
        "teamName": "Customer Success",
        "description": "Client relationship management and support escalation.",
        "primaryLocation": "loc_london",
        "members": [],
        "reportingHistory": [
            {
                "orgLeaderId": "ind_001",
                "orgLeaderName": "Alice Smith",
                "startDate": "2025-06-01T00:00:00Z",
                "endDate": None,
            }
        ],
        "teamHistory": [
            {
                "eventType": "TEAM_CREATED",
                "description": "Customer Success team established.",
                "occurredAt": "2025-06-01T00:00:00Z",
            }
        ],
        "isDeleted": False,
        "deletedAt": None,
    },
]

_SEED_ACHIEVEMENTS = [
    {
        "_id": "ach_001",
        "teamId": "team_001",
        "title": "Zero-downtime migration to new CI/CD pipeline",
        "description": "Migrated 12 microservices to the new pipeline with no customer-facing downtime.",
        "achievementMonth": "2025-03",
        "impactMetric": "100% uptime maintained",
        "tags": ["devops", "infrastructure"],
        "contributors": [
            {"personId": "ind_002", "personName": "Bob Jones"},
            {"personId": "ind_003", "personName": "Carol White"},
        ],
        "createdBy": "ind_002",
    },
    {
        "_id": "ach_002",
        "teamId": None,
        "title": "Company-wide security audit passed",
        "description": "Org-wide SOC 2 Type II audit completed with zero findings.",
        "achievementMonth": "2025-04",
        "impactMetric": "0 critical findings",
        "tags": ["security", "compliance"],
        "contributors": [
            {"personId": "ind_001", "personName": "Alice Smith"},
        ],
        "createdBy": "ind_001",
    },
    {
        "_id": "ach_003",
        "teamId": "team_001",
        "title": "Reduced build times by 60%",
        "description": "Optimized Docker layer caching and parallelized test suites.",
        "achievementMonth": "2025-05",
        "impactMetric": "Build time: 12min → 5min",
        "tags": ["performance", "devops"],
        "contributors": [
            {"personId": "ind_003", "personName": "Carol White"},
        ],
        "createdBy": "ind_003",
    },
]


@router.post(
    "/seed",
    summary="Seed test users and locations (idempotent).",
    responses={200: {"description": "Seed results."}},
)
async def seed_database(
    force: bool = False,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()
    results = {"locations": [], "individuals": [], "teams": [], "achievements": []}

    # --- Locations ---
    for loc in _SEED_LOCATIONS:
        existing = await db["locations"].find_one({"_id": loc["_id"]})
        if existing and not force:
            results["locations"].append({"id": loc["_id"], "status": "skipped"})
        else:
            if existing:
                await db["locations"].delete_one({"_id": loc["_id"]})
            await db["locations"].insert_one(loc)
            results["locations"].append({"id": loc["_id"], "status": "created" if not existing else "replaced"})

    # --- Individuals ---
    for template in _SEED_USERS:
        existing = await db["individuals"].find_one({"email": template["email"]})
        if existing and not force:
            results["individuals"].append({"email": template["email"], "status": "skipped"})
            continue

        if existing:
            await db["individuals"].delete_one({"_id": existing["_id"]})

        # Build the insert doc — hash the password and remove the _password key
        doc = {k: v for k, v in template.items() if k != "_password"}
        doc["auth"]["hashedPassword"] = _hash(template["_password"])
        doc["createdAt"] = now
        doc["updatedAt"] = now
        await db["individuals"].insert_one(doc)
        results["individuals"].append({"email": template["email"], "status": "created" if not existing else "replaced"})

    # --- Teams ---
    for team in _SEED_TEAMS:
        existing = await db["teams"].find_one({"_id": team["_id"]})
        if existing and not force:
            results["teams"].append({"id": team["_id"], "status": "skipped"})
        else:
            if existing:
                await db["teams"].delete_one({"_id": team["_id"]})
            doc = {**team, "createdAt": now, "updatedAt": now}
            await db["teams"].insert_one(doc)
            results["teams"].append({"id": team["_id"], "status": "created" if not existing else "replaced"})

    # --- Achievements ---
    for ach in _SEED_ACHIEVEMENTS:
        existing = await db["achievements"].find_one({"_id": ach["_id"]})
        if existing and not force:
            results["achievements"].append({"id": ach["_id"], "status": "skipped"})
        else:
            if existing:
                await db["achievements"].delete_one({"_id": ach["_id"]})
            doc = {**ach, "createdAt": now}
            await db["achievements"].insert_one(doc)
            results["achievements"].append({"id": ach["_id"], "status": "created" if not existing else "replaced"})

    return {
        "message": "Seed complete",
        "results": results,
        "credentials": [
            {"email": "alice@acme.com", "password": "Admin1234!", "role": "system_admin"},
            {"email": "bob@acme.com", "password": "Lead1234!", "role": "team_lead"},
            {"email": "carol@acme.com", "password": "Editor1234!", "role": "editor"},
            {"email": "dan@acme.com", "password": "Viewer1234!", "role": "viewer"},
        ],
    }


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/auth", tags=["auth"])

handler = Mangum(app, api_gateway_base_path="/api")
