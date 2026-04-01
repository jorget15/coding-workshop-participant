"""
Seed script — inserts test users with bcrypt-hashed passwords into MongoDB.

Usage (from backend/ directory):
    PYTHONPATH=. uv run python seed.py

Loads connection settings from backend/.env automatically.
Idempotent — skips users that already exist (matched by email).
"""

import asyncio
import os
from datetime import datetime, timezone

import bcrypt
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


# ---------------------------------------------------------------------------
# Seed data — one user per role
# (passwords shown here are dev-only; never commit real credentials)
# ---------------------------------------------------------------------------
SEED_USERS = [
    {
        "_id": ObjectId("660000000000000000000001"),
        "firstName": "Alice",
        "lastName": "Smith",
        "email": "alice@acme.com",
        "jobTitle": "Engineering Manager",
        "staffType": "FTE",
        "isActive": True,
        "roles": ["system_admin"],
        "locationId": None,
        "profilePicture": "avatars/defaults/default_01.png",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "auth": {
            "hashedPassword": _hash("Admin1234!"),
            "lastLogin": None,
        },
    },
    {
        "_id": ObjectId("660000000000000000000002"),
        "firstName": "Bob",
        "lastName": "Jones",
        "email": "bob@acme.com",
        "jobTitle": "Team Lead",
        "staffType": "FTE",
        "isActive": True,
        "roles": [],
        "locationId": None,
        "profilePicture": "avatars/defaults/default_01.png",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "auth": {
            "hashedPassword": _hash("Lead1234!"),
            "lastLogin": None,
        },
    },
    {
        "_id": ObjectId("660000000000000000000003"),
        "firstName": "Carol",
        "lastName": "White",
        "email": "carol@acme.com",
        "jobTitle": "Senior Developer",
        "staffType": "FTE",
        "isActive": True,
        "roles": ["editor"],
        "locationId": None,
        "profilePicture": "avatars/defaults/default_01.png",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "auth": {
            "hashedPassword": _hash("Editor1234!"),
            "lastLogin": None,
        },
    },
    {
        "_id": ObjectId("660000000000000000000004"),
        "firstName": "Dan",
        "lastName": "Brown",
        "email": "dan@acme.com",
        "jobTitle": "Analyst",
        "staffType": "Contractor",
        "isActive": True,
        "roles": [],
        "locationId": None,
        "profilePicture": "avatars/defaults/default_01.png",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "auth": {
            "hashedPassword": _hash("Viewer1234!"),
            "lastLogin": None,
        },
    },
]


async def seed() -> None:
    host = os.getenv("MONGO_HOST", "localhost")
    port = int(os.getenv("MONGO_PORT", "27017"))
    user = os.getenv("MONGO_USER", "")
    passwd = os.getenv("MONGO_PASS", "")
    db_name = os.getenv("DB_NAME", "acme_team_mgmt")

    if user and passwd:
        uri = f"mongodb://{user}:{passwd}@{host}:{port}/"
    else:
        uri = f"mongodb://{host}:{port}/"

    client = AsyncIOMotorClient(uri)
    db = client[db_name]

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
    print("  bob@acme.com     / Lead1234!    (team_lead — needs a team with Leader role)")
    print("  carol@acme.com   / Editor1234!  (editor)")
    print("  dan@acme.com     / Viewer1234!  (viewer)")


if __name__ == "__main__":
    asyncio.run(seed())
