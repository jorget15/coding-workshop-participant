"""
Seed script — inserts test users with PBKDF2-hashed passwords into MongoDB.

Usage (from backend/ directory):
    PYTHONPATH=. uv run python seed.py

Loads connection settings from backend/.env automatically.
Idempotent — skips users that already exist (matched by email).
"""

import asyncio
import os
from datetime import datetime, timezone

import hashlib
import secrets
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

_now = datetime.now(timezone.utc).isoformat()


def _hash(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 260000)
    return f"$pbkdf2-sha256${salt}${dk.hex()}"


# ---------------------------------------------------------------------------
# Seed data — one user per role
# Field names and values match the individuals $jsonSchema validator exactly.
# (passwords shown here are dev-only; never commit real credentials)
# ---------------------------------------------------------------------------
SEED_USERS = [
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
        "createdAt": _now,
        "updatedAt": _now,
        "auth": {
            "hashedPassword": _hash("Admin1234!"),
        },
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
        "createdAt": _now,
        "updatedAt": _now,
        "auth": {
            "hashedPassword": _hash("Lead1234!"),
        },
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
        "createdAt": _now,
        "updatedAt": _now,
        "auth": {
            "hashedPassword": _hash("Editor1234!"),
        },
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
        "createdAt": _now,
        "updatedAt": _now,
        "auth": {
            "hashedPassword": _hash("Viewer1234!"),
        },
    },
]


SEED_LOCATIONS = [
    {
        "_id": "loc_hq",
        "name": "ACME Headquarters",
        "city": "Miami",
        "country": "US",
        "region": "NAM",
        "timezone": "America/New_York",
    },
]


async def seed() -> None:
    host = os.getenv("MONGO_HOST", "localhost")
    port = int(os.getenv("MONGO_PORT", "27017"))
    user = os.getenv("MONGO_USER", "")
    passwd = os.getenv("MONGO_PASS", "")
    db_name = os.getenv("MONGO_NAME", "acme_team_mgmt")

    if user and passwd:
        uri = f"mongodb://{user}:{passwd}@{host}:{port}/"
    else:
        uri = f"mongodb://{host}:{port}/"

    client = AsyncIOMotorClient(uri)
    db = client[db_name]

    # --- Locations ---
    for loc in SEED_LOCATIONS:
        existing = await db["locations"].find_one({"_id": loc["_id"]})
        if existing:
            print(f"  skip  location {loc['_id']} (already exists)")
        else:
            await db["locations"].insert_one(loc)
            print(f"  added location {loc['_id']}")

    # --- Individuals ---
    inserted = 0
    skipped = 0
    for user_doc in SEED_USERS:
        existing = await db["individuals"].find_one({"email": user_doc["email"]})
        if existing:
            print(f"  skip  {user_doc['email']} (already exists)")
            skipped += 1
        else:
            await db["individuals"].insert_one(user_doc)
            print(f"  added {user_doc['email']}")
            inserted += 1

    client.close()
    print(f"\nDone — {inserted} inserted, {skipped} skipped.")
    print("\nTest credentials:")
    print("  alice@acme.com   / Admin1234!   (system_admin)")
    print("  bob@acme.com     / Lead1234!    (team_lead)")
    print("  carol@acme.com   / Editor1234!  (editor)")
    print("  dan@acme.com     / Viewer1234!  (viewer — non-direct)")


if __name__ == "__main__":
    asyncio.run(seed())
