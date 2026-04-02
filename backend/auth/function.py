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

from fastapi import APIRouter, Depends, HTTPException, status
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from shared import create_app, hash_password, verify_password
from shared.db import get_db
from shared.logging import get_logger

logger = get_logger("auth-lambda")

app = create_app("ACME Auth Service")
router = APIRouter()


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

    if not verify_password(body.password, hashed):
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
    # ── Senior Leadership (system_admin) ──────────────────────────────
    {
        "_id": "ind_001", "personName": "Jorge taban", "email": "alice@acme.com",
        "jobTitle": "VP of Engineering", "staffType": "direct",
        "primaryLocation": "loc_nyc_hq", "roles": ["system_admin", "viewer"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Admin1234!",
    },
    {
        "_id": "ind_002", "personName": "Raj Patel", "email": "raj@acme.com",
        "jobTitle": "CTO", "staffType": "direct",
        "primaryLocation": "loc_nyc_hq", "roles": ["system_admin", "viewer"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Admin1234!",
    },
    # ── Team Leaders (one per team, co-located per R11) ──────────────
    {
        "_id": "ind_003", "personName": "Niel Escobar", "email": "bob@acme.com",
        "jobTitle": "Senior Platform Engineer", "staffType": "direct",
        "primaryLocation": "loc_london_cw", "roles": ["team_lead"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Lead1234!",
    },
    {
        "_id": "ind_004", "personName": "Maria Garcia", "email": "maria@acme.com",
        "jobTitle": "Head of Customer Success", "staffType": "direct",
        "primaryLocation": "loc_miami_latam", "roles": ["team_lead"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Lead1234!",
    },
    {
        "_id": "ind_005", "personName": "Yuki Tanaka", "email": "yuki@acme.com",
        "jobTitle": "Lead Data Scientist", "staffType": "direct",
        "primaryLocation": "loc_singapore", "roles": ["team_lead"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Lead1234!",
    },
    {
        "_id": "ind_006", "personName": "Hans Mueller", "email": "hans@acme.com",
        "jobTitle": "Head of Compliance", "staffType": "direct",
        "primaryLocation": "loc_frankfurt", "roles": ["team_lead"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Lead1234!",
    },
    {
        "_id": "ind_007", "personName": "Priya Sharma", "email": "priya@acme.com",
        "jobTitle": "Engineering Manager", "staffType": "direct",
        "primaryLocation": "loc_mumbai", "roles": ["team_lead"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Lead1234!",
    },
    # ── Members & cross-team contributors ─────────────────────────────
    {
        "_id": "ind_008", "personName": "Carol White", "email": "carol@acme.com",
        "jobTitle": "DevOps Engineer", "staffType": "direct",
        "primaryLocation": "loc_london_cw", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_009", "personName": "Elena Russo", "email": "elena@acme.com",
        "jobTitle": "Data Analyst", "staffType": "direct",
        "primaryLocation": "loc_dublin", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_010", "personName": "James Okafor", "email": "james@acme.com",
        "jobTitle": "Full Stack Developer", "staffType": "direct",
        "primaryLocation": "loc_london_cw", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_011", "personName": "Jet Chen", "email": "Jet@acme.com",
        "jobTitle": "Cloud Architect", "staffType": "direct",
        "primaryLocation": "loc_singapore", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_012", "personName": "Dan Brown", "email": "dan@acme.com",
        "jobTitle": "Compliance Analyst", "staffType": "non-direct",
        "primaryLocation": "loc_miami_latam", "roles": ["viewer"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Viewer1234!",
    },
    {
        "_id": "ind_013", "personName": "Fatima Al-Rashid", "email": "fatima@acme.com",
        "jobTitle": "Security Consultant", "staffType": "non-direct",
        "primaryLocation": "loc_london_cw", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_014", "personName": "Tom Wilson", "email": "tom@acme.com",
        "jobTitle": "QA Lead", "staffType": "direct",
        "primaryLocation": "loc_nyc_park", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_015", "personName": "Suki Watanabe", "email": "suki@acme.com",
        "jobTitle": "UX Researcher", "staffType": "non-direct",
        "primaryLocation": "loc_hong_kong", "roles": ["viewer"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Viewer1234!",
    },
    {
        "_id": "ind_016", "personName": "Carlos Mendez", "email": "carlos@acme.com",
        "jobTitle": "Backend Developer", "staffType": "direct",
        "primaryLocation": "loc_miami_latam", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_017", "personName": "Ananya Desai", "email": "ananya@acme.com",
        "jobTitle": "ML Engineer", "staffType": "direct",
        "primaryLocation": "loc_mumbai", "roles": ["editor"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Editor1234!",
    },
    {
        "_id": "ind_018", "personName": "Patrick O'Brien", "email": "patrick@acme.com",
        "jobTitle": "Regulatory Advisor", "staffType": "non-direct",
        "primaryLocation": "loc_dublin", "roles": ["viewer"],
        "profilePicture": "avatars/defaults/default_01.png",
        "isDeleted": False, "deletedAt": None,
        "auth": {"hashedPassword": ""}, "_password": "Viewer1234!",
    },
]

_SEED_LOCATIONS = [
    # --- NAM (2) ---
    {"_id": "loc_nyc_hq",      "name": "ACME Global HQ (388 Greenwich)", "city": "New York",  "country": "US",        "region": "NAM",   "timezone": "America/New_York"},
    {"_id": "loc_nyc_park",    "name": "ACME Park Avenue Office",        "city": "New York",  "country": "US",        "region": "NAM",   "timezone": "America/New_York"},
    # --- LATAM (1) ---
    {"_id": "loc_miami_latam", "name": "ACME LATAM Hub",                 "city": "Miami",     "country": "US",        "region": "LATAM", "timezone": "America/New_York"},
    # --- EMEA (3) ---
    {"_id": "loc_london_cw",   "name": "ACME EMEA HQ (Canary Wharf)",    "city": "London",    "country": "UK",        "region": "EMEA",  "timezone": "Europe/London"},
    {"_id": "loc_dublin",      "name": "ACME Europe Plc HQ",             "city": "Dublin",    "country": "Ireland",   "region": "EMEA",  "timezone": "Europe/Dublin"},
    {"_id": "loc_frankfurt",   "name": "ACME Frankfurt Office",          "city": "Frankfurt", "country": "Germany",   "region": "EMEA",  "timezone": "Europe/Berlin"},
    # --- APAC (4) ---
    {"_id": "loc_hong_kong",   "name": "ACME Hong Kong HQ",              "city": "Hong Kong", "country": "HK",        "region": "APAC",  "timezone": "Asia/Hong_Kong"},
    {"_id": "loc_singapore",   "name": "ACME Singapore Hub",             "city": "Singapore", "country": "Singapore", "region": "APAC",  "timezone": "Asia/Singapore"},
    {"_id": "loc_mumbai",      "name": "ACME India HQ",                  "city": "Mumbai",    "country": "India",     "region": "APAC",  "timezone": "Asia/Kolkata"},
    {"_id": "loc_sydney",      "name": "ACME Australia Office",          "city": "Sydney",    "country": "Australia", "region": "APAC",  "timezone": "Australia/Sydney"},
]

_SEED_TEAMS = [
    {
        "_id": "team_001",
        "teamName": "Platform Engineering",
        "description": "Core infrastructure, CI/CD, and DevOps platform team.",
        "primaryLocation": "loc_london_cw",
        "members": [
            {"personId": "ind_003", "personName": "Niel Escobar",      "memberRole": "Team Leader", "staffTypeSnapshot": "direct",     "startDate": "2025-01-15T00:00:00Z", "endDate": None},
            {"personId": "ind_008", "personName": "Carol White",    "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-02-01T00:00:00Z", "endDate": None},
            {"personId": "ind_010", "personName": "James Okafor",   "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-02-01T00:00:00Z", "endDate": None},
            {"personId": "ind_013", "personName": "Fatima Al-Rashid","memberRole": "Member",      "staffTypeSnapshot": "non-direct", "startDate": "2025-03-01T00:00:00Z", "endDate": None},
            {"personId": "ind_014", "personName": "Tom Wilson",     "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-04-01T00:00:00Z", "endDate": None},
            {"personId": "ind_009", "personName": "Elena Russo",    "memberRole": "Delegate",    "staffTypeSnapshot": "direct",     "startDate": "2025-06-01T00:00:00Z", "endDate": None},
        ],
        "reportingHistory": [
            {"orgLeaderId": "ind_001", "orgLeaderName": "Jorge taban", "startDate": "2025-01-15T00:00:00Z", "endDate": None},
        ],
        "teamHistory": [
            {"eventType": "TEAM_CREATED",  "description": "Platform Engineering team established.",            "occurredAt": "2025-01-15T00:00:00Z"},
            {"eventType": "member_added",  "description": "Carol White joined as Member.",                     "occurredAt": "2025-02-01T00:00:00Z"},
            {"eventType": "member_added",  "description": "James Okafor joined as Member.",                    "occurredAt": "2025-02-01T00:00:00Z"},
            {"eventType": "member_added",  "description": "Fatima Al-Rashid joined as Member (non-direct).",   "occurredAt": "2025-03-01T00:00:00Z"},
            {"eventType": "member_added",  "description": "Tom Wilson joined as Member.",                      "occurredAt": "2025-04-01T00:00:00Z"},
            {"eventType": "member_added",  "description": "Elena Russo appointed as Delegate.",                "occurredAt": "2025-06-01T00:00:00Z"},
        ],
        "isDeleted": False, "deletedAt": None,
    },
    {
        "_id": "team_002",
        "teamName": "Customer Success - LATAM",
        "description": "Client relationship management and support escalation for Latin America.",
        "primaryLocation": "loc_miami_latam",
        "members": [
            {"personId": "ind_004", "personName": "Maria Garcia",   "memberRole": "Team Leader", "staffTypeSnapshot": "direct",     "startDate": "2025-03-01T00:00:00Z", "endDate": None},
            {"personId": "ind_016", "personName": "Carlos Mendez",  "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-03-15T00:00:00Z", "endDate": None},
            {"personId": "ind_012", "personName": "Dan Brown",      "memberRole": "Member",      "staffTypeSnapshot": "non-direct", "startDate": "2025-04-01T00:00:00Z", "endDate": None},
        ],
        "reportingHistory": [
            {"orgLeaderId": "ind_001", "orgLeaderName": "Jorge taban", "startDate": "2025-03-01T00:00:00Z", "endDate": None},
        ],
        "teamHistory": [
            {"eventType": "TEAM_CREATED", "description": "Customer Success LATAM team established.", "occurredAt": "2025-03-01T00:00:00Z"},
        ],
        "isDeleted": False, "deletedAt": None,
    },
    {
        "_id": "team_003",
        "teamName": "Data Platform",
        "description": "Data engineering, ML pipelines, and analytics infrastructure.",
        "primaryLocation": "loc_singapore",
        "members": [
            {"personId": "ind_005", "personName": "Yuki Tanaka",    "memberRole": "Team Leader", "staffTypeSnapshot": "direct",     "startDate": "2025-02-01T00:00:00Z", "endDate": None},
            {"personId": "ind_011", "personName": "Jet Chen",      "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-02-15T00:00:00Z", "endDate": None},
            {"personId": "ind_017", "personName": "Ananya Desai",   "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-03-01T00:00:00Z", "endDate": None},
            {"personId": "ind_009", "personName": "Elena Russo",    "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-04-01T00:00:00Z", "endDate": None},
            {"personId": "ind_015", "personName": "Suki Watanabe",  "memberRole": "Member",      "staffTypeSnapshot": "non-direct", "startDate": "2025-05-01T00:00:00Z", "endDate": None},
        ],
        "reportingHistory": [
            {"orgLeaderId": "ind_002", "orgLeaderName": "Raj Patel", "startDate": "2025-02-01T00:00:00Z", "endDate": None},
        ],
        "teamHistory": [
            {"eventType": "TEAM_CREATED", "description": "Data Platform team established.", "occurredAt": "2025-02-01T00:00:00Z"},
        ],
        "isDeleted": False, "deletedAt": None,
    },
    {
        "_id": "team_004",
        "teamName": "Regulatory & Compliance",
        "description": "Risk management, regulatory reporting, and internal audit support.",
        "primaryLocation": "loc_frankfurt",
        "members": [
            {"personId": "ind_006", "personName": "Hans Mueller",    "memberRole": "Team Leader", "staffTypeSnapshot": "direct",     "startDate": "2025-01-01T00:00:00Z", "endDate": None},
            {"personId": "ind_018", "personName": "Patrick O'Brien", "memberRole": "Member",      "staffTypeSnapshot": "non-direct", "startDate": "2025-01-15T00:00:00Z", "endDate": None},
            {"personId": "ind_012", "personName": "Dan Brown",       "memberRole": "Member",      "staffTypeSnapshot": "non-direct", "startDate": "2025-02-01T00:00:00Z", "endDate": None},
        ],
        "reportingHistory": [
            {"orgLeaderId": "ind_002", "orgLeaderName": "Raj Patel", "startDate": "2025-01-01T00:00:00Z", "endDate": None},
        ],
        "teamHistory": [
            {"eventType": "TEAM_CREATED", "description": "Regulatory & Compliance team established.", "occurredAt": "2025-01-01T00:00:00Z"},
        ],
        "isDeleted": False, "deletedAt": None,
    },
    {
        "_id": "team_005",
        "teamName": "Core Infrastructure - India",
        "description": "Backend services, API gateway, and microservices for APAC expansion.",
        "primaryLocation": "loc_mumbai",
        "members": [
            {"personId": "ind_007", "personName": "Priya Sharma",   "memberRole": "Team Leader", "staffTypeSnapshot": "direct",     "startDate": "2025-04-01T00:00:00Z", "endDate": None},
            {"personId": "ind_017", "personName": "Ananya Desai",   "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-04-15T00:00:00Z", "endDate": None},
            {"personId": "ind_011", "personName": "Jet Chen",      "memberRole": "Member",      "staffTypeSnapshot": "direct",     "startDate": "2025-05-01T00:00:00Z", "endDate": None},
        ],
        "reportingHistory": [
            {"orgLeaderId": "ind_002", "orgLeaderName": "Raj Patel", "startDate": "2025-04-01T00:00:00Z", "endDate": None},
        ],
        "teamHistory": [
            {"eventType": "TEAM_CREATED", "description": "Core Infrastructure India team established.", "occurredAt": "2025-04-01T00:00:00Z"},
        ],
        "isDeleted": False, "deletedAt": None,
    },
]

_SEED_ACHIEVEMENTS = [
    # ── Platform Engineering (team_001) ───────────────────────────────
    {
        "_id": "ach_001", "teamId": "team_001",
        "title": "Zero-downtime migration to new CI/CD pipeline",
        "description": "Migrated 12 microservices to the new pipeline with no customer-facing downtime.",
        "achievementMonth": "2025-03", "impactMetric": "100% uptime maintained",
        "tags": ["devops", "infrastructure"],
        "contributors": [
            {"personId": "ind_003", "personName": "Niel Escobar"},
            {"personId": "ind_008", "personName": "Carol White"},
        ],
        "createdBy": "ind_003",
    },
    {
        "_id": "ach_002", "teamId": "team_001",
        "title": "Reduced build times by 60%",
        "description": "Optimized Docker layer caching and parallelized test suites across the monorepo.",
        "achievementMonth": "2025-05", "impactMetric": "Build time: 12min → 5min",
        "tags": ["performance", "devops"],
        "contributors": [
            {"personId": "ind_008", "personName": "Carol White"},
            {"personId": "ind_010", "personName": "James Okafor"},
        ],
        "createdBy": "ind_008",
    },
    {
        "_id": "ach_003", "teamId": "team_001",
        "title": "Infrastructure cost optimization",
        "description": "Right-sized EC2 instances and migrated cold storage to S3 Glacier, saving $18k/month.",
        "achievementMonth": "2025-08", "impactMetric": "$18k/month saved",
        "tags": ["cost-optimization", "cloud"],
        "contributors": [
            {"personId": "ind_010", "personName": "James Okafor"},
            {"personId": "ind_013", "personName": "Fatima Al-Rashid"},
        ],
        "createdBy": "ind_003",
    },
    # ── Customer Success LATAM (team_002) ─────────────────────────────
    {
        "_id": "ach_004", "teamId": "team_002",
        "title": "Client retention improved to 94%",
        "description": "Implemented proactive outreach program reducing churn by 6 percentage points YoY.",
        "achievementMonth": "2025-06", "impactMetric": "Retention: 88% → 94%",
        "tags": ["client-success", "latam"],
        "contributors": [
            {"personId": "ind_004", "personName": "Maria Garcia"},
            {"personId": "ind_016", "personName": "Carlos Mendez"},
        ],
        "createdBy": "ind_004",
    },
    {
        "_id": "ach_005", "teamId": "team_002",
        "title": "Launched Spanish-language support portal",
        "description": "Built and shipped a fully localized self-service portal for LATAM clients.",
        "achievementMonth": "2025-09", "impactMetric": "40% reduction in support tickets",
        "tags": ["localization", "client-success"],
        "contributors": [
            {"personId": "ind_016", "personName": "Carlos Mendez"},
            {"personId": "ind_012", "personName": "Dan Brown"},
        ],
        "createdBy": "ind_004",
    },
    # ── Data Platform (team_003) ──────────────────────────────────────
    {
        "_id": "ach_006", "teamId": "team_003",
        "title": "Real-time fraud detection pipeline launched",
        "description": "Deployed Kafka-based streaming pipeline processing 50k events/sec with <200ms latency.",
        "achievementMonth": "2025-04", "impactMetric": "50k events/sec, <200ms p99",
        "tags": ["data-engineering", "fraud"],
        "contributors": [
            {"personId": "ind_005", "personName": "Yuki Tanaka"},
            {"personId": "ind_011", "personName": "Jet Chen"},
            {"personId": "ind_017", "personName": "Ananya Desai"},
        ],
        "createdBy": "ind_005",
    },
    {
        "_id": "ach_007", "teamId": "team_003",
        "title": "Data lake migration to Iceberg format",
        "description": "Migrated 4TB of historical data from Parquet to Apache Iceberg with zero downtime.",
        "achievementMonth": "2025-07", "impactMetric": "30% query cost reduction",
        "tags": ["data-engineering", "migration"],
        "contributors": [
            {"personId": "ind_011", "personName": "Jet Chen"},
            {"personId": "ind_009", "personName": "Elena Russo"},
        ],
        "createdBy": "ind_005",
    },
    # ── Regulatory & Compliance (team_004) ────────────────────────────
    {
        "_id": "ach_008", "teamId": "team_004",
        "title": "EU DORA compliance framework implemented",
        "description": "Completed gap analysis and implemented all required controls ahead of the January 2025 deadline.",
        "achievementMonth": "2025-01", "impactMetric": "100% DORA controls in place",
        "tags": ["compliance", "regulatory", "emea"],
        "contributors": [
            {"personId": "ind_006", "personName": "Hans Mueller"},
            {"personId": "ind_018", "personName": "Patrick O'Brien"},
        ],
        "createdBy": "ind_006",
    },
    # ── Core Infrastructure India (team_005) ──────────────────────────
    {
        "_id": "ach_009", "teamId": "team_005",
        "title": "API gateway v2 with rate limiting",
        "description": "Shipped new API gateway with token-bucket rate limiting and circuit breaker patterns.",
        "achievementMonth": "2025-06", "impactMetric": "99.95% availability SLA met",
        "tags": ["backend", "reliability"],
        "contributors": [
            {"personId": "ind_007", "personName": "Priya Sharma"},
            {"personId": "ind_017", "personName": "Ananya Desai"},
        ],
        "createdBy": "ind_007",
    },
    {
        "_id": "ach_010", "teamId": "team_005",
        "title": "Microservices observability rollout",
        "description": "Deployed OpenTelemetry tracing across all 20 APAC microservices.",
        "achievementMonth": "2025-08", "impactMetric": "MTTR reduced from 45min to 12min",
        "tags": ["observability", "reliability"],
        "contributors": [
            {"personId": "ind_007", "personName": "Priya Sharma"},
            {"personId": "ind_011", "personName": "Jet Chen"},
        ],
        "createdBy": "ind_007",
    },
    # ── Org-wide (no team) ────────────────────────────────────────────
    {
        "_id": "ach_011", "teamId": None,
        "title": "SOC 2 Type II audit passed with zero findings",
        "description": "Company-wide audit completed covering all production systems and data handling procedures.",
        "achievementMonth": "2025-04", "impactMetric": "0 critical findings",
        "tags": ["security", "compliance"],
        "contributors": [
            {"personId": "ind_001", "personName": "Jorge taban"},
            {"personId": "ind_006", "personName": "Hans Mueller"},
            {"personId": "ind_013", "personName": "Fatima Al-Rashid"},
        ],
        "createdBy": "ind_001",
    },
    {
        "_id": "ach_012", "teamId": None,
        "title": "Global hackathon: AI-powered onboarding assistant",
        "description": "Cross-team hackathon winning project — an LLM-based assistant that reduced new hire ramp-up time by 30%.",
        "achievementMonth": "2025-10", "impactMetric": "30% faster onboarding",
        "tags": ["innovation", "hackathon", "ai"],
        "contributors": [
            {"personId": "ind_005", "personName": "Yuki Tanaka"},
            {"personId": "ind_008", "personName": "Carol White"},
            {"personId": "ind_016", "personName": "Carlos Mendez"},
            {"personId": "ind_017", "personName": "Ananya Desai"},
        ],
        "createdBy": "ind_002",
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
        doc["auth"]["hashedPassword"] = hash_password(template["_password"])
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
