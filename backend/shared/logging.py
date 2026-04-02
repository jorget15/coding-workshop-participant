"""
Structured JSON logging — shared Lambda layer module.

Provides a pre-configured ``logging.Logger`` that outputs JSON lines
compatible with CloudWatch Logs Insights. Each log entry includes:

    - ``timestamp``  — ISO-8601 UTC
    - ``level``      — DEBUG / INFO / WARNING / ERROR / CRITICAL
    - ``service``    — Lambda function name (e.g. ``individuals``, ``teams``)
    - ``message``    — Human-readable summary
    - ``extra``      — Arbitrary key-value context (user_id, team_id, etc.)

Usage in a Lambda function::

    from shared.logging import get_logger

    logger = get_logger("individuals")
    logger.info("Listed individuals", extra={"count": len(results), "user_id": user.user_id})
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any


class _JsonFormatter(logging.Formatter):
    """Format log records as single-line JSON for CloudWatch."""

    def __init__(self, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self.service,
            "message": record.getMessage(),
        }

        # Merge any extra dict passed via logger.info("msg", extra={...})
        if hasattr(record, "extra") and isinstance(record.extra, dict):
            entry["extra"] = record.extra
        # Also capture standard extra attrs set via logging.LoggerAdapter
        for key in ("user_id", "team_id", "request_id", "method", "path",
                     "status_code", "duration_ms", "error", "rule", "count"):
            val = getattr(record, key, None)
            if val is not None:
                entry.setdefault("extra", {})[key] = val

        # Include exception info if present
        if record.exc_info and record.exc_info[1]:
            entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


def get_logger(service: str) -> logging.Logger:
    """
    Return a named logger with JSON output to ``stdout``.

    Args:
        service: The Lambda/service name (e.g. ``"teams"``, ``"auth"``).

    Returns:
        A :class:`logging.Logger` configured for structured JSON output.
    """
    logger = logging.getLogger(f"acme.{service}")

    # Avoid duplicate handlers if called multiple times (Lambda warm start)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(_JsonFormatter(service))
        logger.addHandler(handler)

    logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))
    logger.propagate = False
    return logger
