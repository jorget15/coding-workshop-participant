"""
Motor async DocumentDB client — shared Lambda layer module.

Each Lambda function injects the database via ``Depends(get_db)``.
The client is created once per Lambda container (warm start reuse)
and yielded per request so the connection is never left open on error.

Environment variables (injected by Terraform locals.tf):
    MONGO_HOST  - DocumentDB cluster endpoint or ``host.docker.internal`` (LocalStack).
    MONGO_PORT  - Port (default: 27017).
    MONGO_USER  - Master username.
    MONGO_PASS  - Master password.
    IS_LOCAL    - ``"true"`` when running against LocalStack (skips TLS).
    MONGO_NAME  - Database name (default: acme_team_mgmt).

TLS note (AWS DocumentDB only):
    Uses ``tlsAllowInvalidCertificates=true`` per project docs — no CA bundle
    file is needed.
"""

import os
import urllib.parse
from collections.abc import AsyncGenerator
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from shared.logging import get_logger

logger = get_logger("db")

# ---------------------------------------------------------------------------
# Module-level client (reused across warm Lambda invocations)
# ---------------------------------------------------------------------------
_client: AsyncIOMotorClient | None = None


def _build_uri() -> str:
    """Build the MongoDB URI from individual Terraform-injected env vars."""
    host = os.environ["MONGO_HOST"]
    port = os.getenv("MONGO_PORT", "27017")
    raw_user = os.getenv("MONGO_USER", "")
    raw_pass = os.getenv("MONGO_PASS", "")
    is_local = os.getenv("IS_LOCAL", "false").lower() == "true"

    # Only include credentials in the URI when both are non-empty
    if raw_user and raw_pass:
        user = urllib.parse.quote_plus(raw_user)
        password = urllib.parse.quote_plus(raw_pass)
        credentials = f"{user}:{password}@"
    else:
        credentials = ""

    if is_local:
        # LocalStack / local mongod — no TLS
        return f"mongodb://{credentials}{host}:{port}/"

    # AWS DocumentDB requires TLS — per implementation.md use
    # tlsAllowInvalidCertificates=true so no CA bundle file is needed.
    return (
        f"mongodb://{credentials}{host}:{port}/"
        f"?tls=true"
        f"&tlsAllowInvalidCertificates=true"
        f"&retryWrites=false"
    )


def _get_client() -> AsyncIOMotorClient:
    """Return the module-level Motor client, creating it on first call."""
    global _client
    if _client is None:
        uri = _build_uri()
        # Mask credentials in log output
        safe_uri = uri.split("@")[-1] if "@" in uri else uri
        logger.info("Creating Motor client", extra={"host": safe_uri})
        _client = AsyncIOMotorClient(uri)
    return _client


async def get_db() -> AsyncGenerator[AsyncIOMotorDatabase, Any]:
    """
    FastAPI dependency that yields the Motor database handle.

    Usage::

        @router.get("/")
        async def list_items(db: AsyncIOMotorDatabase = Depends(get_db)):
            docs = await db["collection"].find().to_list(100)
            ...
    """
    db_name = os.getenv("MONGO_NAME") or os.getenv("DB_NAME", "acme_team_mgmt")
    client = _get_client()
    yield client[db_name]
