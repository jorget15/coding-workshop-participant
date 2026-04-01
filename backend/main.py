"""
ACME Team Management — FastAPI entry point.

This module creates the FastAPI application, registers all routers,
configures CORS, and exposes the Mangum Lambda handler.

Environment variables expected (set via Lambda or .env locally):
    MONGODB_URI        - DocumentDB / MongoDB connection string
    JWT_SECRET         - Secret key used to sign/verify JWT tokens
    S3_BUCKET          - S3 bucket name for profile picture storage
    ALLOWED_ORIGINS    - Comma-separated list of allowed CORS origins
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from individuals.function import router as individuals_router
from teams.function import router as teams_router
from achievements.function import router as achievements_router
from metadata.function import router as metadata_router

app = FastAPI(
    title="ACME Team Management API",
    version="1.0.0",
    description="Backend API for the ACME Inc. team management system.",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(individuals_router, prefix="/individuals", tags=["individuals"])
app.include_router(teams_router, prefix="/teams", tags=["teams"])
app.include_router(achievements_router, prefix="/achievements", tags=["achievements"])
app.include_router(metadata_router, prefix="/metadata", tags=["metadata"])


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    """Return a simple liveness response."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Lambda handler (Mangum wraps the ASGI app for AWS Lambda + API Gateway)
# ---------------------------------------------------------------------------
handler = Mangum(app, lifespan="off")

