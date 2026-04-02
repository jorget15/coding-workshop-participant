"""
JWT authentication dependency — shared Lambda layer module.

Every protected route injects ``CurrentUser`` via ``Depends(get_current_user)``.
The token is expected in the ``Authorization: Bearer <token>`` header.

Environment variables:
    JWT_SECRET      - Secret key used to sign and verify tokens.
    JWT_ALGORITHM   - Algorithm used (default: HS256).

Token payload structure (set at login)::

    {
        "sub":       "<individual _id as string>",
        "username":  "<display name>",
        "role":      "system_admin" | "team_lead" | "editor" | "viewer" | "non-direct",
        "team_id":   "<team _id or null>",
        "exp":       <unix timestamp>
    }
"""

import os
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt

from shared.logging import get_logger

logger = get_logger("auth")

_bearer = HTTPBearer()

VALID_ROLES = frozenset(
    {"system_admin", "team_lead", "editor", "viewer", "non-direct"}
)


@dataclass
class CurrentUser:
    """Decoded JWT claims attached to each authenticated request."""

    user_id: str
    username: str
    role: str
    team_id: Optional[str]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    """
    FastAPI dependency that decodes and validates the Bearer JWT.

    Raises:
        401 if the token is missing, expired, or invalid.
        403 if the role claim is not one of the recognised values.

    Usage::

        @router.get("/")
        async def list_items(user: CurrentUser = Depends(get_current_user)):
            if user.role != "system_admin":
                raise HTTPException(status_code=403, detail="Admin only.")
            ...
    """
    secret = os.environ["JWT_SECRET"]
    algorithm = os.getenv("JWT_ALGORITHM", "HS256")

    try:
        payload = jwt.decode(credentials.credentials, secret, algorithms=[algorithm])
    except ExpiredSignatureError:
        logger.warning("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        )
    except JWTError as exc:
        logger.warning("Invalid token", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token.",
        )

    role = payload.get("role", "")
    if role not in VALID_ROLES:
        logger.warning("Unrecognised role in token", extra={"role": role})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Unrecognised role '{role}' in token.",
        )

    logger.info("Authenticated user", extra={"user_id": payload.get("sub"), "role": role})
    return CurrentUser(
        user_id=payload.get("sub", ""),
        username=payload.get("username", ""),
        role=role,
        team_id=payload.get("team_id"),
    )


def require_role(*roles: str):
    """
    Return a dependency that enforces one of the given roles.

    Usage::

        @router.post("/", dependencies=[Depends(require_role("system_admin"))])
        async def admin_only_endpoint(): ...
    """
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            logger.warning(
                "Role check failed",
                extra={"user_id": user.user_id, "user_role": user.role, "required": list(roles)},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {', '.join(roles)}. Your role: {user.role}.",
            )
        return user

    return _check
