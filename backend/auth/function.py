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
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from shared.db import get_db

app = FastAPI(title="ACME Auth Service")

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

@app.post(
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
    """
    TODO: implement full login
    1. Query db["individuals"] for an active document where username == body.username.
    2. Verify bcrypt: bcrypt.checkpw(body.password.encode(), stored_hash.encode())
    3. If invalid → 401 "Invalid username or password." (same message for both cases — no enumeration)
    4. If individual.isActive is False → 403 "Account is deactivated."
    5. Determine role:
       - "system_admin" if "system_admin" in individual.roles
       - "team_lead"    if individual is the active Leader of a team (query teams collection)
       - "editor"       if "editor" in individual.roles
       - "viewer"       otherwise
    6. Find the individual's current active team membership (query teams.members where
       memberId == individual._id and endDate is None) to populate team_id.
    7. Build JWT payload and call _sign_token().
    8. Return TokenResponse.
    """
    # --- placeholder: replace with real DB + bcrypt logic ---
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Login not yet implemented — pending DB wiring.",
    )


@app.post(
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
    """
    TODO: implement token refresh
    1. Decode body.token using jose.jwt.decode() — raise 401 on JWTError / ExpiredSignatureError.
    2. Re-fetch the individual from DB (verify still active — raise 403 if deactivated).
    3. Issue a new token with the same payload but a fresh expiry.
    4. Return TokenResponse.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Refresh not yet implemented — pending DB wiring.",
    )


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------
handler = Mangum(app)
