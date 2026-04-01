"""
Auth Lambda — login endpoint.

Routes:
    POST /login   - Verify credentials, return signed JWT.
    POST /refresh - Accept a valid (non-expired) token, return a new one.

Environment variables (injected by Terraform):
    JWT_SECRET      - HMAC secret used to sign tokens.
    JWT_ALGORITHM   - Algorithm (default: HS256).
    JWT_EXPIRE_MINS - Token lifetime in minutes (default: 60).
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from shared.db import get_db

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
    username: str
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
    # Look up individual by email (used as username) — active only
    individual = await db["individuals"].find_one(
        {"email": body.username, "isActive": True}
    )

    # Identical error for missing user or wrong password — prevents user enumeration
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
    )

    if individual is None:
        raise _invalid

    auth_block = individual.get("auth") or {}
    hashed: Optional[str] = auth_block.get("hashedPassword")
    if not hashed:
        raise _invalid

    if not bcrypt.checkpw(body.password.encode(), hashed.encode()):
        raise _invalid

    # Stamp lastLogin — fire-and-forget, don't block the response
    await db["individuals"].update_one(
        {"_id": individual["_id"]},
        {"$set": {"auth.lastLogin": datetime.now(timezone.utc).isoformat()}},
    )

    user_id = str(individual["_id"])
    username = f"{individual.get('firstName', '')} {individual.get('lastName', '')}".strip()

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
    individual = await db["individuals"].find_one({"_id": ObjectId(user_id)})
    if not individual or not individual.get("isActive"):
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
# Lambda entry point
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/auth", tags=["auth"])

handler = Mangum(app, api_gateway_base_path="/api")
