"""
ACME Team Management — local development entry point.

This module mounts all four service routers into a single FastAPI app so you
can run everything locally with one command:

    uvicorn backend.main:app --reload

In production each service (individuals, teams, achievements, metadata) is
deployed as its own Lambda function with its own Mangum handler. This file
is NOT deployed; it exists solely to simplify local development.

Environment variables expected (injected by Terraform locals.tf):
    MONGO_HOST      - DocumentDB cluster endpoint or host.docker.internal (LocalStack)
    MONGO_PORT      - Port (default: 27017)
    MONGO_USER      - Master username
    MONGO_PASS      - Master password
    DB_NAME         - Database name (default: acme_team_mgmt)
    IS_LOCAL        - "true" when running against LocalStack (skips TLS)
    JWT_SECRET      - Secret key used to sign/verify JWT tokens
    S3_BUCKET       - S3 bucket name for profile picture storage
    ALLOWED_ORIGINS - Comma-separated list of allowed CORS origins
"""

import os

from dotenv import load_dotenv

load_dotenv()  # loads backend/.env when running locally

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.function import router as auth_router
from individuals.function import router as individuals_router
from teams.function import router as teams_router
from achievements.function import router as achievements_router
from metadata.function import router as metadata_router

app = FastAPI(
    title="ACME Team Management API (local dev)",
    version="1.0.0",
    description=(
        "Aggregated API for local development. "
        "In production each router runs as its own Lambda function."
    ),
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — same prefixes used by each Lambda in production
# ---------------------------------------------------------------------------
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(individuals_router, prefix="/individuals", tags=["individuals"])
app.include_router(teams_router, prefix="/teams", tags=["teams"])
app.include_router(achievements_router, prefix="/achievements", tags=["achievements"])
app.include_router(metadata_router, prefix="/metadata", tags=["metadata"])


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    """Return a simple liveness response."""
    return {"status": "ok"}

