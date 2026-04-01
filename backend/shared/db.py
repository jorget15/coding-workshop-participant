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
    DB_NAME     - Database name (default: acme_team_mgmt).

TLS note (AWS DocumentDB only):
    The Amazon DocumentDB CA bundle (``global-bundle.pem``) must be present at
    ``/var/task/global-bundle.pem`` inside the Lambda package.
    Download: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
    and commit it to each Lambda's source directory.
"""

import os
import urllib.parse
from collections.abc import AsyncGenerator
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

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

    # AWS DocumentDB requires TLS + replica set settings
    # global-bundle.pem must be bundled with the Lambda package
    return (
        f"mongodb://{credentials}{host}:{port}/"
        f"?tls=true"
        f"&tlsCAFile=/var/task/global-bundle.pem"
        f"&replicaSet=rs0"
        f"&readPreference=secondaryPreferred"
        f"&retryWrites=false"
    )


def _get_client() -> AsyncIOMotorClient:
    """Return the module-level Motor client, creating it on first call."""
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(_build_uri())
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
    db_name = os.getenv("DB_NAME", "acme_team_mgmt")
    client = _get_client()
    yield client[db_name]
