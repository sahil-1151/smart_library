#!/usr/bin/env python3
"""
Smart Library PostgreSQL API server.

This server is the next step after importing legacy text data into PostgreSQL.
It exposes JSON endpoints for the core Smart Library flows:

- auth (register/login)
- libraries and books
- direct loan issue/return
- borrow request review flow
- visit slot booking
- waitlist

Configuration:
    DATABASE_URL       Required PostgreSQL connection string
    API_HOST           Optional, defaults to 127.0.0.1
    API_PORT           Optional, defaults to 5000
    DEFAULT_LOAN_DAYS  Optional, defaults to 14
"""

from __future__ import annotations

import json
import os
import random
from threading import Lock
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from time import monotonic
from typing import Any

import psycopg
from flask import Flask, g, request
from psycopg.errors import ForeignKeyViolation, UniqueViolation
from psycopg.rows import dict_row
from waitress import serve
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def load_local_env_file():
    """Load a simple .env file from the project root without extra dependencies."""
    env_path = os.path.join(PROJECT_ROOT, ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_local_env_file()

app = Flask(__name__)

DEFAULT_LOAN_DAYS = int(os.environ.get("DEFAULT_LOAN_DAYS", "14"))
HASH_PREFIXES = ("pbkdf2:", "scrypt:", "argon2:")
OPEN_SLOT_BOOKING_STATUSES = ("pending", "approved")
OPEN_SLOT_BOOKING_STATUS_SQL = "('pending', 'approved')"
RESERVED_SLOT_BOOKING_STATUSES = ("approved",)
RESERVED_SLOT_BOOKING_STATUS_SQL = "('approved')"
CATALOG_CACHE_TTL_SECONDS = max(1, int(os.environ.get("CATALOG_CACHE_TTL_SECONDS", "30")))
DASHBOARD_CACHE_TTL_SECONDS = max(1, int(os.environ.get("DASHBOARD_CACHE_TTL_SECONDS", "1")))
ACTIVE_SESSION_WINDOW_MINUTES = max(
    1, int(os.environ.get("SMART_LIBRARY_ACTIVE_WINDOW_MINUTES", "5"))
)
DEFAULT_DEVELOPER_EMAIL = os.environ.get(
    "SMART_LIBRARY_DEVELOPER_EMAIL",
    "developer@smartlibrary.local",
).strip()
DEFAULT_DEVELOPER_PASSWORD = os.environ.get(
    "SMART_LIBRARY_DEVELOPER_PASSWORD",
    "developer123",
)
AUDIT_LOG_PATH = os.environ.get(
    "SMART_LIBRARY_AUDIT_LOG_PATH",
    os.path.join(PROJECT_ROOT, "logs", "activity.log"),
).strip()
if AUDIT_LOG_PATH and not os.path.isabs(AUDIT_LOG_PATH):
    AUDIT_LOG_PATH = os.path.join(PROJECT_ROOT, AUDIT_LOG_PATH)
CACHE_LOCK = Lock()
AUDIT_LOG_LOCK = Lock()
SCHEMA_LOCK = Lock()
CATALOG_CACHE: dict[str, Any] = {"expires_at": 0.0, "value": None}
DASHBOARD_CACHE: dict[str, dict[str, Any]] = {}
SCHEMA_READY = False
SENSITIVE_AUDIT_FIELDS = {
    "password",
    "new_password",
    "password_hash",
    "otp",
    "otp_hash",
}
AUDIT_RESPONSE_FIELDS = (
    "user_id",
    "role",
    "email",
    "book_id",
    "library_id",
    "borrow_request_id",
    "purchase_request_id",
    "loan_id",
    "slot_booking_id",
    "waitlist_entry_id",
    "status",
)


class ApiError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_cached_value(cache_key: str, ttl_seconds: int, loader) -> Any:
    now = monotonic()
    with CACHE_LOCK:
        if cache_key == "catalog":
            entry = CATALOG_CACHE
        else:
            entry = DASHBOARD_CACHE.get(cache_key)
        if entry and entry.get("expires_at", 0.0) > now:
            return entry["value"]

    value = loader()
    expires_at = now + ttl_seconds
    with CACHE_LOCK:
        entry = {"value": value, "expires_at": expires_at}
        if cache_key == "catalog":
            CATALOG_CACHE.update(entry)
        else:
            DASHBOARD_CACHE[cache_key] = entry
    return value


def invalidate_catalog_cache() -> None:
    with CACHE_LOCK:
        CATALOG_CACHE["value"] = None
        CATALOG_CACHE["expires_at"] = 0.0


def invalidate_dashboard_cache() -> None:
    with CACHE_LOCK:
        DASHBOARD_CACHE.clear()


def invalidate_all_caches() -> None:
    invalidate_catalog_cache()
    invalidate_dashboard_cache()


def sanitize_audit_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sanitize_audit_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_audit_value(item) for item in value[:20]]
    if isinstance(value, tuple):
        return [sanitize_audit_value(item) for item in value[:20]]
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        trimmed = value.strip()
        if len(trimmed) > 300:
            return f"{trimmed[:300]}..."
        return trimmed
    return value


def sanitize_audit_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        sanitized: dict[str, Any] = {}
        for key, value in payload.items():
            normalized_key = str(key).strip().lower()
            if normalized_key in SENSITIVE_AUDIT_FIELDS or normalized_key.endswith("_password"):
                sanitized[str(key)] = "[redacted]"
                continue
            sanitized[str(key)] = sanitize_audit_payload(value)
        return sanitized
    if isinstance(payload, list):
        return [sanitize_audit_payload(item) for item in payload[:20]]
    if isinstance(payload, tuple):
        return [sanitize_audit_payload(item) for item in payload[:20]]
    return sanitize_audit_value(payload)


def set_audit_actor(user: dict[str, Any] | None) -> None:
    if not user:
        return
    g.audit_actor = {
        "actor_id": user.get("user_id") or user.get("id"),
        "actor_role": user.get("role"),
        "actor_email": user.get("email"),
    }


def get_actor_id(value: Any) -> int | str | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        parsed = str(value).strip()
        return parsed or None


def get_client_ip() -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
    if forwarded_for:
        return forwarded_for
    remote_addr = str(request.remote_addr or "").strip()
    return remote_addr or None


def collect_response_audit_summary(resp) -> dict[str, Any]:
    payload = resp.get_json(silent=True)
    if not isinstance(payload, dict):
        return {}

    summary: dict[str, Any] = {}
    if "ok" in payload:
        summary["ok"] = bool(payload["ok"])
    if payload.get("error"):
        summary["error"] = sanitize_audit_value(payload["error"])

    data = payload.get("data")
    if isinstance(data, dict):
        data_summary = {
            field: sanitize_audit_value(data[field])
            for field in AUDIT_RESPONSE_FIELDS
            if field in data and data[field] not in (None, "")
        }
        if data_summary:
            summary["data"] = data_summary
    elif isinstance(data, list):
        summary["item_count"] = len(data)

    return summary


def build_audit_entry(resp) -> dict[str, Any]:
    timestamp = getattr(g, "audit_timestamp", utc_now())
    started_at = getattr(g, "audit_started_at", None)
    duration_ms = None
    if started_at is not None:
        duration_ms = round((monotonic() - started_at) * 1000, 2)

    route_rule = request.url_rule.rule if request.url_rule else None
    payload = sanitize_audit_payload(getattr(g, "audit_payload", None))
    actor_override = getattr(g, "audit_actor", {}) or {}

    actor_id = actor_override.get("actor_id") or request.headers.get("X-Smart-Library-Actor-Id")
    actor_role = actor_override.get("actor_role") or request.headers.get("X-Smart-Library-Actor-Role")
    actor_email = actor_override.get("actor_email") or request.headers.get("X-Smart-Library-Actor-Email")

    if isinstance(payload, dict):
        if actor_role in (None, ""):
            actor_role = payload.get("role")
        if actor_email in (None, ""):
            actor_email = payload.get("email")
        if actor_id in (None, ""):
            actor_id = (
                payload.get("user_id")
                or payload.get("member_id")
                or payload.get("issued_by_user_id")
                or payload.get("reviewed_by_user_id")
            )

    entry = {
        "timestamp": timestamp.isoformat(),
        "year": timestamp.year,
        "month": timestamp.month,
        "day": timestamp.day,
        "session_id": request.headers.get("X-Smart-Library-Session", "").strip() or None,
        "actor_id": get_actor_id(actor_id),
        "actor_role": sanitize_audit_value(actor_role) if actor_role not in (None, "") else None,
        "actor_email": sanitize_audit_value(actor_email) if actor_email not in (None, "") else None,
        "client_ip": get_client_ip(),
        "method": request.method,
        "path": request.path,
        "route": route_rule,
        "endpoint": request.endpoint,
        "status_code": resp.status_code,
        "duration_ms": duration_ms,
        "query": sanitize_audit_payload(request.args.to_dict(flat=True)) if request.args else None,
        "path_params": sanitize_audit_payload(request.view_args) if request.view_args else None,
        "payload": payload if payload not in ({}, [], None) else None,
        "response": collect_response_audit_summary(resp),
    }
    entry["action"] = entry["endpoint"] or f"{request.method} {request.path}"
    return {key: value for key, value in entry.items() if value not in (None, "", {}, [])}


def write_audit_log_entry(resp) -> None:
    if request.method == "OPTIONS":
        return
    entry = build_audit_entry(resp)
    log_directory = os.path.dirname(AUDIT_LOG_PATH)
    if log_directory:
        os.makedirs(log_directory, exist_ok=True)
    with AUDIT_LOG_LOCK:
        with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(entry, ensure_ascii=True))
            log_file.write("\n")


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: json_safe(val) for key, val in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def response(payload: dict[str, Any], status_code: int = 200):
    return app.json.response(json_safe(payload)), status_code


def success(data: Any | None = None, status_code: int = 200):
    payload = {"ok": True}
    if data is not None:
        payload["data"] = data
    return response(payload, status_code)


def get_json_body() -> dict[str, Any]:
    if not request.is_json:
        raise ApiError("Expected application/json request body.", 415)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("Invalid JSON body.", 400)
    g.audit_payload = payload
    return payload


def require_text(payload: dict[str, Any], field_name: str) -> str:
    value = str(payload.get(field_name, "")).strip()
    if not value:
        raise ApiError(f"{field_name} is required.", 400)
    return value


def parse_int(value: Any, field_name: str, *, minimum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ApiError(f"{field_name} must be an integer.", 400) from exc
    if minimum is not None and parsed < minimum:
        raise ApiError(f"{field_name} must be at least {minimum}.", 400)
    return parsed


def parse_date(value: Any, field_name: str) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise ApiError(f"{field_name} must be a valid YYYY-MM-DD date.", 400) from exc


def parse_bool_arg(name: str, default: bool = False) -> bool:
    raw = request.args.get(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def parse_bool_value(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return datetime.now().astimezone().replace(tzinfo=None)


def normalize_local_time(value: time) -> time:
    return value.replace(tzinfo=None) if getattr(value, "tzinfo", None) else value


def slot_has_started(slot_date: date, slot_start_time: time) -> bool:
    return datetime.combine(slot_date, normalize_local_time(slot_start_time)) <= local_now()


def get_db_connection():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise ApiError("DATABASE_URL is not configured.", 500)
    try:
        return psycopg.connect(database_url, row_factory=dict_row)
    except psycopg.Error as exc:
        raise ApiError(f"Database connection failed: {exc}", 500) from exc


def generate_random_purchase_price() -> float:
    return round(random.uniform(300, 600), 2)


def ensure_default_developer_user(conn: psycopg.Connection[Any]) -> None:
    email = normalize_email(DEFAULT_DEVELOPER_EMAIL or "developer@smartlibrary.local")
    if not email:
        return
    existing = conn.execute(
        """
        SELECT user_id
        FROM users
        WHERE LOWER(email) = %s
        """,
        (email,),
    ).fetchone()
    if existing is not None:
        return

    conn.execute(
        """
        INSERT INTO users (
            role,
            full_name,
            email,
            password_hash,
            managed_library_id,
            email_verified_at,
            is_active
        )
        VALUES ('developer', 'Developer', %s, %s, NULL, %s, TRUE)
        """,
        (email, generate_password_hash(DEFAULT_DEVELOPER_PASSWORD), utc_now()),
    )


def ensure_database_features() -> None:
    global SCHEMA_READY
    with SCHEMA_LOCK:
        if SCHEMA_READY:
            return

        with get_db_connection() as conn:
            conn.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
            conn.execute(
                """
                ALTER TABLE users
                ADD CONSTRAINT users_role_check
                CHECK (role IN ('member', 'admin', 'developer'))
                """
            )
            conn.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_library_check")
            conn.execute(
                """
                ALTER TABLE users
                ADD CONSTRAINT users_admin_library_check
                CHECK (
                    (role = 'member' AND managed_library_id IS NULL)
                    OR (role = 'admin' AND managed_library_id IS NOT NULL)
                    OR (role = 'developer' AND managed_library_id IS NULL)
                )
                """
            )

            conn.execute(
                """
                ALTER TABLE books
                ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2)
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ADD COLUMN IF NOT EXISTS issue_total_copies INTEGER
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ADD COLUMN IF NOT EXISTS slot_booking_copies INTEGER
                """
            )
            conn.execute(
                """
                UPDATE books
                SET purchase_price = ROUND((300 + random() * 300)::numeric, 2)
                WHERE purchase_price IS NULL OR purchase_price <= 0
                """
            )
            conn.execute(
                """
                UPDATE books
                SET issue_total_copies = total_copies
                WHERE issue_total_copies IS NULL OR issue_total_copies < 0
                """
            )
            conn.execute(
                """
                UPDATE books
                SET available_copies = LEAST(GREATEST(available_copies, 0), issue_total_copies)
                WHERE available_copies < 0 OR available_copies > issue_total_copies
                """
            )
            conn.execute(
                """
                UPDATE books
                SET slot_booking_copies = total_copies
                WHERE slot_booking_copies IS NULL OR slot_booking_copies < 0
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ALTER COLUMN purchase_price SET NOT NULL
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ALTER COLUMN issue_total_copies SET NOT NULL
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ALTER COLUMN slot_booking_copies SET NOT NULL
                """
            )
            conn.execute("ALTER TABLE books DROP CONSTRAINT IF EXISTS books_available_copies_check")
            conn.execute("ALTER TABLE books DROP CONSTRAINT IF EXISTS books_issue_total_copies_check")
            conn.execute("ALTER TABLE books DROP CONSTRAINT IF EXISTS books_slot_booking_copies_check")
            conn.execute(
                """
                ALTER TABLE books
                ADD CONSTRAINT books_issue_total_copies_check CHECK (
                    issue_total_copies >= 0
                    AND issue_total_copies <= total_copies
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ADD CONSTRAINT books_available_copies_check CHECK (
                    available_copies >= 0
                    AND available_copies <= issue_total_copies
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE books
                ADD CONSTRAINT books_slot_booking_copies_check CHECK (
                    slot_booking_copies >= 0
                    AND slot_booking_copies <= total_copies
                )
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS purchase_requests (
                    purchase_request_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    member_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
                    book_id BIGINT NOT NULL REFERENCES books(book_id) ON DELETE RESTRICT,
                    requested_price NUMERIC(10,2) NOT NULL,
                    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    status TEXT NOT NULL DEFAULT 'pending',
                    reviewed_at TIMESTAMPTZ,
                    reviewed_by_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
                    rejection_reason TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT purchase_requests_status_check CHECK (
                        status IN ('pending', 'approved', 'rejected', 'cancelled')
                    ),
                    CONSTRAINT purchase_requests_requested_price_check CHECK (requested_price >= 0),
                    CONSTRAINT purchase_requests_review_fields_check CHECK (
                        (status = 'pending' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND rejection_reason IS NULL)
                        OR (status <> 'pending' AND reviewed_at IS NOT NULL)
                    ),
                    CONSTRAINT purchase_requests_rejection_reason_check CHECK (
                        (status = 'rejected' AND rejection_reason IS NOT NULL)
                        OR status <> 'rejected'
                    )
                )
                """
            )
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_one_pending_per_member_book_uidx
                ON purchase_requests (member_id, book_id)
                WHERE status = 'pending'
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS purchase_requests_book_status_idx
                ON purchase_requests (book_id, status, requested_at DESC)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS purchase_requests_member_idx
                ON purchase_requests (member_id, requested_at DESC)
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    session_id TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    email TEXT NOT NULL,
                    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    logged_out_at TIMESTAMPTZ,
                    last_method TEXT,
                    last_path TEXT,
                    client_ip TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS user_sessions_user_last_seen_idx
                ON user_sessions (user_id, last_seen_at DESC)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS user_sessions_last_seen_idx
                ON user_sessions (last_seen_at DESC)
                """
            )

            conn.execute(
                """
                INSERT INTO visit_slots (slot_id, label, start_time, end_time, sort_order)
                VALUES
                    (1, '08:00 - 10:00', TIME '08:00', TIME '10:00', 1),
                    (2, '10:00 - 12:00', TIME '10:00', TIME '12:00', 2),
                    (3, '12:00 - 14:00', TIME '12:00', TIME '14:00', 3),
                    (4, '14:00 - 16:00', TIME '14:00', TIME '16:00', 4),
                    (5, '16:00 - 18:00', TIME '16:00', TIME '18:00', 5)
                ON CONFLICT (slot_id) DO UPDATE
                SET
                    label = EXCLUDED.label,
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    sort_order = EXCLUDED.sort_order
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS slot_bookings (
                    slot_booking_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    member_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
                    book_id BIGINT NOT NULL REFERENCES books(book_id) ON DELETE RESTRICT,
                    slot_id SMALLINT NOT NULL REFERENCES visit_slots(slot_id) ON DELETE RESTRICT,
                    slot_date DATE NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    reviewed_at TIMESTAMPTZ,
                    reviewed_by_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
                    rejection_reason TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    cancelled_at TIMESTAMPTZ,
                    fulfilled_at TIMESTAMPTZ
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD COLUMN IF NOT EXISTS reviewed_by_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD COLUMN IF NOT EXISTS rejection_reason TEXT
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ALTER COLUMN status SET DEFAULT 'pending'
                """
            )
            conn.execute("ALTER TABLE slot_bookings DROP CONSTRAINT IF EXISTS slot_bookings_status_check")
            conn.execute("ALTER TABLE slot_bookings DROP CONSTRAINT IF EXISTS slot_bookings_cancelled_at_check")
            conn.execute("ALTER TABLE slot_bookings DROP CONSTRAINT IF EXISTS slot_bookings_fulfilled_at_check")
            conn.execute("ALTER TABLE slot_bookings DROP CONSTRAINT IF EXISTS slot_bookings_review_fields_check")
            conn.execute("ALTER TABLE slot_bookings DROP CONSTRAINT IF EXISTS slot_bookings_rejection_reason_check")
            conn.execute("DROP INDEX IF EXISTS slot_bookings_one_active_per_member_book_uidx")
            conn.execute("DROP INDEX IF EXISTS slot_bookings_active_capacity_idx")
            conn.execute(
                """
                UPDATE slot_bookings
                SET status = 'approved'
                WHERE status = 'active'
                """
            )
            conn.execute(
                """
                UPDATE slot_bookings
                SET
                    reviewed_at = CASE
                        WHEN reviewed_at IS NULL OR reviewed_by_user_id IS NULL THEN NULL
                        ELSE reviewed_at
                    END,
                    reviewed_by_user_id = CASE
                        WHEN reviewed_at IS NULL OR reviewed_by_user_id IS NULL THEN NULL
                        ELSE reviewed_by_user_id
                    END,
                    rejection_reason = NULL
                WHERE status = 'approved'
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD CONSTRAINT slot_bookings_status_check CHECK (
                    status IN ('pending', 'approved', 'rejected', 'cancelled', 'fulfilled', 'expired')
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD CONSTRAINT slot_bookings_cancelled_at_check CHECK (
                    (status = 'cancelled' AND cancelled_at IS NOT NULL)
                    OR status <> 'cancelled'
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD CONSTRAINT slot_bookings_fulfilled_at_check CHECK (
                    (status = 'fulfilled' AND fulfilled_at IS NOT NULL)
                    OR status <> 'fulfilled'
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD CONSTRAINT slot_bookings_review_fields_check CHECK (
                    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND rejection_reason IS NULL)
                    OR (
                        status = 'approved'
                        AND rejection_reason IS NULL
                        AND (
                            (reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
                            OR (reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL)
                        )
                    )
                    OR (status = 'rejected' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND rejection_reason IS NOT NULL)
                    OR (status NOT IN ('pending', 'approved', 'rejected'))
                )
                """
            )
            conn.execute(
                """
                ALTER TABLE slot_bookings
                ADD CONSTRAINT slot_bookings_rejection_reason_check CHECK (
                    (status = 'rejected' AND rejection_reason IS NOT NULL)
                    OR status <> 'rejected'
                )
                """
            )
            conn.execute(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS slot_bookings_one_active_per_member_book_uidx
                ON slot_bookings (member_id, book_id)
                WHERE status IN {OPEN_SLOT_BOOKING_STATUS_SQL}
                """
            )
            conn.execute(
                f"""
                CREATE INDEX IF NOT EXISTS slot_bookings_active_capacity_idx
                ON slot_bookings (book_id, slot_date)
                WHERE status IN {OPEN_SLOT_BOOKING_STATUS_SQL}
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS slot_bookings_member_idx
                ON slot_bookings (member_id, slot_date DESC)
                """
            )

            conn.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_trigger
                        WHERE tgname = 'purchase_requests_set_updated_at'
                    ) THEN
                        CREATE TRIGGER purchase_requests_set_updated_at
                        BEFORE UPDATE ON purchase_requests
                        FOR EACH ROW
                        EXECUTE FUNCTION set_updated_at();
                    END IF;
                END $$;
                """
            )
            conn.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_trigger
                        WHERE tgname = 'user_sessions_set_updated_at'
                    ) THEN
                        CREATE TRIGGER user_sessions_set_updated_at
                        BEFORE UPDATE ON user_sessions
                        FOR EACH ROW
                        EXECUTE FUNCTION set_updated_at();
                    END IF;
                END $$;
                """
            )
            conn.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_trigger
                        WHERE tgname = 'slot_bookings_set_updated_at'
                    ) THEN
                        CREATE TRIGGER slot_bookings_set_updated_at
                        BEFORE UPDATE ON slot_bookings
                        FOR EACH ROW
                        EXECUTE FUNCTION set_updated_at();
                    END IF;
                END $$;
                """
            )

            ensure_default_developer_user(conn)

        SCHEMA_READY = True


def expire_stale_slot_bookings(conn: psycopg.Connection[Any]) -> None:
    conn.execute(
        f"""
        UPDATE slot_bookings AS sb
        SET status = 'expired'
        FROM visit_slots AS vs
        WHERE sb.status IN {OPEN_SLOT_BOOKING_STATUS_SQL}
          AND sb.slot_id = vs.slot_id
          AND (
              sb.slot_date < CURRENT_DATE
              OR (sb.slot_date = CURRENT_DATE AND vs.end_time <= LOCALTIME)
          )
        """
    )


def count_reserved_slot_bookings(
    conn: psycopg.Connection[Any],
    book_id: int,
    *,
    slot_date: date | None = None,
) -> int:
    params: list[Any] = [book_id]
    slot_date_sql = ""
    if slot_date is not None:
        slot_date_sql = "AND slot_date = %s"
        params.append(slot_date)

    row = conn.execute(
        f"""
        SELECT COUNT(*) AS reserved_count
        FROM slot_bookings
        WHERE book_id = %s
          AND status IN {RESERVED_SLOT_BOOKING_STATUS_SQL}
          {slot_date_sql}
        """,
        tuple(params),
    ).fetchone()
    return int((row or {}).get("reserved_count", 0))


def ensure_book_can_be_fulfilled(
    conn: psycopg.Connection[Any],
    book: dict[str, Any] | None,
    *,
    unavailable_message: str,
) -> None:
    if book is None:
        raise ApiError("Book not found.", 404)
    available_copies = int(book.get("available_copies", 0))
    if available_copies < 1:
        raise ApiError(unavailable_message, 409)


def fetch_public_user(conn: psycopg.Connection[Any], user_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT
            u.user_id,
            u.role,
            u.full_name,
            u.email,
            u.legacy_source,
            u.legacy_source_id,
            u.managed_library_id,
            u.email_verified_at,
            u.must_reset_password,
            u.is_active,
            u.last_login_at,
            u.created_at,
            u.updated_at,
            l.code AS managed_library_code,
            l.name AS managed_library_name
        FROM users u
        LEFT JOIN libraries l ON l.library_id = u.managed_library_id
        WHERE u.user_id = %s
        """,
        (user_id,),
    ).fetchone()


def fetch_book(conn: psycopg.Connection[Any], book_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT
            b.book_id,
            b.library_id,
            b.title,
            b.author,
            b.isbn,
            b.purchase_price,
            b.total_copies,
            b.issue_total_copies,
            b.available_copies,
            b.slot_booking_copies,
            b.created_at,
            b.updated_at,
            l.code AS library_code,
            l.name AS library_name,
            l.city AS library_city,
            l.state AS library_state,
            l.is_active AS library_is_active
        FROM books b
        JOIN libraries l ON l.library_id = b.library_id
        WHERE b.book_id = %s
        """,
        (book_id,),
    ).fetchone()


def fetch_loan(conn: psycopg.Connection[Any], loan_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT
            bl.loan_id,
            bl.borrow_request_id,
            bl.member_id,
            bl.book_id,
            bl.issued_by_user_id,
            bl.issued_at,
            bl.due_at,
            bl.returned_at,
            bl.fine_amount,
            bl.created_at,
            bl.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name
        FROM book_loans bl
        JOIN books b ON b.book_id = bl.book_id
        JOIN libraries l ON l.library_id = b.library_id
        WHERE bl.loan_id = %s
        """,
        (loan_id,),
    ).fetchone()


def fetch_library(conn: psycopg.Connection[Any], library_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT
            l.library_id,
            l.code,
            l.name,
            l.city,
            l.state,
            l.is_active,
            l.created_at,
            l.updated_at
        FROM libraries l
        WHERE l.library_id = %s
        """,
        (library_id,),
    ).fetchone()


def fetch_catalog_snapshot(conn: psycopg.Connection[Any]) -> dict[str, Any]:
    libraries = conn.execute(
        """
        SELECT
            l.library_id,
            l.code,
            l.name,
            l.city,
            l.state,
            l.is_active,
            l.created_at,
            l.updated_at,
            COALESCE(
                json_agg(la.alias ORDER BY la.alias)
                FILTER (WHERE la.alias IS NOT NULL),
                '[]'::json
            ) AS aliases
        FROM libraries l
        LEFT JOIN library_aliases la ON la.library_id = l.library_id
        WHERE l.is_active = TRUE
        GROUP BY l.library_id
        ORDER BY l.name ASC
        """
    ).fetchall()

    books = conn.execute(
        """
        SELECT
            b.book_id,
            b.library_id,
            b.title,
            b.author,
            b.isbn,
            b.purchase_price,
            b.total_copies,
            b.issue_total_copies,
            b.available_copies,
            b.slot_booking_copies,
            b.created_at,
            b.updated_at,
            l.code AS library_code,
            l.name AS library_name,
            l.city AS library_city,
            l.state AS library_state,
            l.is_active AS library_is_active
        FROM books b
        JOIN libraries l ON l.library_id = b.library_id
        WHERE l.is_active = TRUE
        ORDER BY b.title ASC, b.book_id ASC
        """
    ).fetchall()

    visit_slots = conn.execute(
        """
        SELECT slot_id, label, start_time, end_time, sort_order
        FROM visit_slots
        ORDER BY sort_order ASC
        """
    ).fetchall()

    return {
        "libraries": libraries,
        "books": books,
        "visit_slots": visit_slots,
    }


def fetch_user_dashboard_snapshot(conn: psycopg.Connection[Any], user_id: int) -> dict[str, Any]:
    expire_stale_slot_bookings(conn)
    borrow_requests = conn.execute(
        """
        SELECT
            br.borrow_request_id,
            br.member_id,
            br.book_id,
            br.requested_at,
            br.status,
            br.reviewed_at,
            br.reviewed_by_user_id,
            br.rejection_reason,
            br.created_at,
            br.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name
        FROM borrow_requests br
        JOIN books b ON b.book_id = br.book_id
        JOIN libraries l ON l.library_id = b.library_id
        WHERE br.member_id = %s
        ORDER BY br.requested_at DESC
        """,
        (user_id,),
    ).fetchall()

    purchase_requests = conn.execute(
        """
        SELECT
            pr.purchase_request_id,
            pr.member_id,
            pr.book_id,
            pr.requested_price,
            pr.requested_at,
            pr.status,
            pr.reviewed_at,
            pr.reviewed_by_user_id,
            pr.rejection_reason,
            pr.created_at,
            pr.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name
        FROM purchase_requests pr
        JOIN books b ON b.book_id = pr.book_id
        JOIN libraries l ON l.library_id = b.library_id
        WHERE pr.member_id = %s
        ORDER BY pr.requested_at DESC
        """,
        (user_id,),
    ).fetchall()

    loans = conn.execute(
        """
        SELECT
            bl.loan_id,
            bl.borrow_request_id,
            bl.member_id,
            bl.book_id,
            bl.issued_by_user_id,
            bl.issued_at,
            bl.due_at,
            bl.returned_at,
            bl.fine_amount,
            bl.created_at,
            bl.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name
        FROM book_loans bl
        JOIN books b ON b.book_id = bl.book_id
        JOIN libraries l ON l.library_id = b.library_id
        WHERE bl.member_id = %s
          AND bl.returned_at IS NULL
        ORDER BY bl.issued_at DESC
        """,
        (user_id,),
    ).fetchall()

    slot_bookings = conn.execute(
        """
        SELECT
            sb.slot_booking_id,
            sb.member_id,
            sb.book_id,
            sb.slot_id,
            sb.slot_date,
            sb.status,
            sb.reviewed_at,
            sb.reviewed_by_user_id,
            sb.rejection_reason,
            sb.created_at,
            sb.updated_at,
            sb.cancelled_at,
            sb.fulfilled_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name,
            vs.label AS slot_label,
            vs.start_time,
            vs.end_time
        FROM slot_bookings sb
        JOIN books b ON b.book_id = sb.book_id
        JOIN libraries l ON l.library_id = b.library_id
        JOIN visit_slots vs ON vs.slot_id = sb.slot_id
        WHERE sb.member_id = %s
        ORDER BY sb.slot_date DESC, vs.sort_order ASC
        """,
        (user_id,),
    ).fetchall()

    return {
        "borrow_requests": borrow_requests,
        "purchase_requests": purchase_requests,
        "loans": loans,
        "slot_bookings": slot_bookings,
    }


def fetch_admin_dashboard_snapshot(
    conn: psycopg.Connection[Any], library_id: int
) -> dict[str, Any]:
    expire_stale_slot_bookings(conn)
    library = fetch_library(conn, library_id)
    if library is None:
        raise ApiError("Library not found.", 404)

    borrow_requests = conn.execute(
        """
        SELECT
            br.borrow_request_id,
            br.member_id,
            br.book_id,
            br.requested_at,
            br.status,
            br.reviewed_at,
            br.reviewed_by_user_id,
            br.rejection_reason,
            br.created_at,
            br.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name,
            u.full_name AS member_name,
            u.email AS member_email
        FROM borrow_requests br
        JOIN books b ON b.book_id = br.book_id
        JOIN libraries l ON l.library_id = b.library_id
        JOIN users u ON u.user_id = br.member_id
        WHERE b.library_id = %s
          AND br.status = 'pending'
        ORDER BY br.requested_at DESC
        """,
        (library_id,),
    ).fetchall()

    purchase_requests = conn.execute(
        """
        SELECT
            pr.purchase_request_id,
            pr.member_id,
            pr.book_id,
            pr.requested_price,
            pr.requested_at,
            pr.status,
            pr.reviewed_at,
            pr.reviewed_by_user_id,
            pr.rejection_reason,
            pr.created_at,
            pr.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name,
            u.full_name AS member_name,
            u.email AS member_email
        FROM purchase_requests pr
        JOIN books b ON b.book_id = pr.book_id
        JOIN libraries l ON l.library_id = b.library_id
        JOIN users u ON u.user_id = pr.member_id
        WHERE b.library_id = %s
          AND pr.status = 'pending'
        ORDER BY pr.requested_at DESC
        """,
        (library_id,),
    ).fetchall()

    loans = conn.execute(
        """
        SELECT
            bl.loan_id,
            bl.borrow_request_id,
            bl.member_id,
            bl.book_id,
            bl.issued_by_user_id,
            bl.issued_at,
            bl.due_at,
            bl.returned_at,
            bl.fine_amount,
            bl.created_at,
            bl.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name,
            u.full_name AS member_name,
            u.email AS member_email
        FROM book_loans bl
        JOIN books b ON b.book_id = bl.book_id
        JOIN libraries l ON l.library_id = b.library_id
        JOIN users u ON u.user_id = bl.member_id
        WHERE b.library_id = %s
          AND bl.returned_at IS NULL
        ORDER BY bl.issued_at DESC
        """,
        (library_id,),
    ).fetchall()

    slot_bookings = conn.execute(
        """
        SELECT
            sb.slot_booking_id,
            sb.member_id,
            sb.book_id,
            sb.slot_id,
            sb.slot_date,
            sb.status,
            sb.reviewed_at,
            sb.reviewed_by_user_id,
            sb.rejection_reason,
            sb.created_at,
            sb.updated_at,
            sb.cancelled_at,
            sb.fulfilled_at,
            b.title AS book_title,
            b.author AS book_author,
            l.library_id,
            l.name AS library_name,
            vs.label AS slot_label,
            vs.start_time,
            vs.end_time,
            u.full_name AS member_name,
            u.email AS member_email
        FROM slot_bookings sb
        JOIN books b ON b.book_id = sb.book_id
        JOIN libraries l ON l.library_id = b.library_id
        JOIN visit_slots vs ON vs.slot_id = sb.slot_id
        JOIN users u ON u.user_id = sb.member_id
        WHERE b.library_id = %s
        ORDER BY sb.slot_date DESC, vs.sort_order ASC
        """,
        (library_id,),
    ).fetchall()

    return {
        "library": library,
        "borrow_requests": borrow_requests,
        "purchase_requests": purchase_requests,
        "loans": loans,
        "slot_bookings": slot_bookings,
    }


def get_request_actor_context() -> tuple[str | None, int | str | None, str | None, str | None]:
    payload = getattr(g, "audit_payload", None)
    actor_override = getattr(g, "audit_actor", {}) or {}

    actor_id = actor_override.get("actor_id") or request.headers.get("X-Smart-Library-Actor-Id")
    actor_role = actor_override.get("actor_role") or request.headers.get("X-Smart-Library-Actor-Role")
    actor_email = actor_override.get("actor_email") or request.headers.get("X-Smart-Library-Actor-Email")

    if isinstance(payload, dict):
        if actor_id in (None, ""):
            actor_id = (
                payload.get("user_id")
                or payload.get("member_id")
                or payload.get("reviewer_user_id")
                or payload.get("issued_by_user_id")
            )
        if actor_role in (None, ""):
            actor_role = payload.get("role")
        if actor_email in (None, ""):
            actor_email = payload.get("email")

    session_id = request.headers.get("X-Smart-Library-Session", "").strip() or None
    normalized_role = str(actor_role or "").strip().lower() or None
    normalized_email = normalize_email(str(actor_email or "")) if actor_email not in (None, "") else None
    return session_id, get_actor_id(actor_id), normalized_role, normalized_email


def sync_user_session_activity(resp) -> None:
    if request.method == "OPTIONS":
        return

    session_id, actor_id, actor_role, actor_email = get_request_actor_context()
    if not session_id or actor_id in (None, "") or actor_role not in {"member", "admin", "developer"}:
        return

    timestamp = utc_now()
    logged_out_at = timestamp if request.path == "/api/auth/logout" and resp.status_code < 400 else None

    try:
        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_sessions (
                    session_id,
                    user_id,
                    role,
                    email,
                    login_at,
                    last_seen_at,
                    logged_out_at,
                    last_method,
                    last_path,
                    client_ip
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_id) DO UPDATE
                SET
                    user_id = EXCLUDED.user_id,
                    role = EXCLUDED.role,
                    email = EXCLUDED.email,
                    last_seen_at = EXCLUDED.last_seen_at,
                    logged_out_at = EXCLUDED.logged_out_at,
                    last_method = EXCLUDED.last_method,
                    last_path = EXCLUDED.last_path,
                    client_ip = EXCLUDED.client_ip
                """,
                (
                    session_id,
                    actor_id,
                    actor_role,
                    actor_email or "",
                    timestamp,
                    timestamp,
                    logged_out_at,
                    request.method,
                    request.path,
                    get_client_ip(),
                ),
            )
    except Exception:
        return


def read_recent_audit_logs(limit: int = 200) -> list[dict[str, Any]]:
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500
    if not os.path.exists(AUDIT_LOG_PATH):
        return []

    with open(AUDIT_LOG_PATH, "r", encoding="utf-8") as log_file:
        lines = log_file.readlines()

    entries: list[dict[str, Any]] = []
    for raw_line in reversed(lines[-limit:]):
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            parsed = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            entries.append(parsed)
    return entries


def fetch_developer_dashboard_snapshot(conn: psycopg.Connection[Any], limit: int = 200) -> dict[str, Any]:
    expire_stale_slot_bookings(conn)
    users = conn.execute(
        """
        WITH latest_sessions AS (
            SELECT DISTINCT ON (us.user_id)
                us.user_id,
                us.login_at,
                us.last_seen_at,
                us.logged_out_at,
                us.last_method,
                us.last_path,
                us.client_ip
            FROM user_sessions us
            ORDER BY us.user_id, us.last_seen_at DESC
        )
        SELECT
            u.user_id,
            u.role,
            u.full_name,
            u.email,
            u.is_active,
            u.last_login_at,
            ls.login_at AS session_login_at,
            ls.last_seen_at,
            ls.logged_out_at,
            ls.last_method,
            ls.last_path,
            ls.client_ip,
            CASE
                WHEN u.is_active = TRUE
                    AND ls.last_seen_at IS NOT NULL
                    AND ls.last_seen_at >= NOW() - (%s * INTERVAL '1 minute')
                    AND COALESCE(ls.logged_out_at, TIMESTAMPTZ 'epoch') < ls.last_seen_at
                THEN TRUE
                ELSE FALSE
            END AS is_currently_active
        FROM users u
        LEFT JOIN latest_sessions ls ON ls.user_id = u.user_id
        ORDER BY
            CASE u.role
                WHEN 'developer' THEN 0
                WHEN 'admin' THEN 1
                ELSE 2
            END,
            u.full_name ASC
        """,
        (ACTIVE_SESSION_WINDOW_MINUTES,),
    ).fetchall()

    metrics = conn.execute(
        """
        SELECT
            COUNT(*) AS total_users,
            COUNT(*) FILTER (WHERE role = 'member') AS member_count,
            COUNT(*) FILTER (WHERE role = 'admin') AS admin_count,
            COUNT(*) FILTER (WHERE role = 'developer') AS developer_count,
            COUNT(*) FILTER (WHERE is_active = TRUE) AS enabled_count
        FROM users
        """
    ).fetchone()

    active_count = sum(1 for user in users if user.get("is_currently_active"))

    return {
        "metrics": {
            **(metrics or {}),
            "currently_active_count": active_count,
        },
        "users": users,
        "logs": read_recent_audit_logs(limit),
    }


def require_developer_access() -> None:
    _session_id, actor_id, actor_role, _actor_email = get_request_actor_context()
    if actor_role != "developer" or actor_id in (None, ""):
        raise ApiError("Developer access required.", 403)


def password_matches(stored_password: str, incoming_password: str) -> bool:
    if stored_password.startswith(HASH_PREFIXES):
        return check_password_hash(stored_password, incoming_password)
    return stored_password == incoming_password


def maybe_upgrade_password_hash(
    conn: psycopg.Connection[Any], user_id: int, stored_password: str, incoming_password: str
) -> None:
    if stored_password.startswith(HASH_PREFIXES):
        return
    if stored_password != incoming_password:
        return
    conn.execute(
        "UPDATE users SET password_hash = %s WHERE user_id = %s",
        (generate_password_hash(incoming_password), user_id),
    )


@app.before_request
def capture_request_metadata():
    if not SCHEMA_READY:
        ensure_database_features()
    g.audit_started_at = monotonic()
    g.audit_timestamp = utc_now()
    g.audit_payload = None
    g.audit_actor = {}


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = (
        "Content-Type, Authorization, X-Smart-Library-Session, "
        "X-Smart-Library-Actor-Id, X-Smart-Library-Actor-Role, X-Smart-Library-Actor-Email"
    )
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    try:
        sync_user_session_activity(resp)
    except Exception as exc:
        print(f"Session activity sync failed: {exc}")
    try:
        write_audit_log_entry(resp)
    except Exception as exc:
        print(f"Audit log write failed: {exc}")
    return resp


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return response({"ok": False, "error": err.message}, err.status_code)


@app.errorhandler(404)
def handle_not_found(_err):
    return response({"ok": False, "error": "Not found."}, 404)


@app.errorhandler(Exception)
def handle_unexpected_error(err: Exception):
    if isinstance(err, HTTPException):
        return response({"ok": False, "error": err.description}, err.code or 500)
    return response({"ok": False, "error": str(err)}, 500)


@app.route("/api", methods=["OPTIONS"])
@app.route("/api/<path:_path>", methods=["OPTIONS"])
def api_options(_path: str | None = None):
    return ("", 204)


@app.get("/api/ping")
@app.get("/api/health")
def health_check():
    with get_db_connection() as conn:
        conn.execute("SELECT 1")
    return success({"status": "ok"})


@app.get("/api/catalog")
def get_catalog_snapshot():
    def load_snapshot():
        with get_db_connection() as conn:
            return fetch_catalog_snapshot(conn)

    snapshot = get_cached_value("catalog", CATALOG_CACHE_TTL_SECONDS, load_snapshot)
    return success(snapshot)


@app.get("/api/libraries")
def list_libraries():
    include_inactive = parse_bool_arg("include_inactive", default=False)
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                l.library_id,
                l.code,
                l.name,
                l.city,
                l.state,
                l.is_active,
                l.created_at,
                l.updated_at,
                COALESCE(
                    json_agg(la.alias ORDER BY la.alias)
                    FILTER (WHERE la.alias IS NOT NULL),
                    '[]'::json
                ) AS aliases
            FROM libraries l
            LEFT JOIN library_aliases la ON la.library_id = l.library_id
            WHERE (%s OR l.is_active = TRUE)
            GROUP BY l.library_id
            ORDER BY l.name ASC
            """,
            (include_inactive,),
        ).fetchall()
    return success(rows)


@app.get("/api/books")
def list_books():
    q = request.args.get("q", "").strip().lower()
    library_id_raw = request.args.get("library_id")
    limit = parse_int(request.args.get("limit", 100), "limit", minimum=1)
    offset = parse_int(request.args.get("offset", 0), "offset", minimum=0)
    only_available = parse_bool_arg("only_available", default=False)
    include_inactive_libraries = parse_bool_arg("include_inactive_libraries", default=False)

    if limit > 200:
        raise ApiError("limit cannot be greater than 200.", 400)

    params: list[Any] = []
    clauses = []

    if library_id_raw is not None:
        clauses.append("b.library_id = %s")
        params.append(parse_int(library_id_raw, "library_id", minimum=1))
    if q:
        clauses.append(
            """
            (
                LOWER(b.title) LIKE %s
                OR LOWER(b.author) LIKE %s
                OR LOWER(COALESCE(b.isbn, '')) LIKE %s
                OR LOWER(l.name) LIKE %s
                OR LOWER(l.code) LIKE %s
            )
            """
        )
        like = f"%{q}%"
        params.extend([like, like, like, like, like])
    if only_available:
        clauses.append("(b.available_copies > 0 OR b.slot_booking_copies > 0)")
    if not include_inactive_libraries:
        clauses.append("l.is_active = TRUE")

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with get_db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                b.book_id,
                b.library_id,
                b.title,
                b.author,
                b.isbn,
                b.purchase_price,
                b.total_copies,
                b.issue_total_copies,
                b.available_copies,
                b.slot_booking_copies,
                b.created_at,
                b.updated_at,
                l.code AS library_code,
                l.name AS library_name,
                l.city AS library_city,
                l.state AS library_state,
                l.is_active AS library_is_active
            FROM books b
            JOIN libraries l ON l.library_id = b.library_id
            {where_sql}
            ORDER BY b.title ASC, b.book_id ASC
            LIMIT %s OFFSET %s
            """,
            (*params, limit, offset),
        ).fetchall()
    return success(rows)


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    with get_db_connection() as conn:
        row = fetch_book(conn, book_id)
    if row is None:
        raise ApiError("Book not found.", 404)
    return success(row)


@app.post("/api/books")
def create_book():
    payload = get_json_body()
    requested_book_id = payload.get("book_id")
    library_id = parse_int(payload.get("library_id"), "library_id", minimum=1)
    title = require_text(payload, "title")
    author = require_text(payload, "author")
    isbn = str(payload.get("isbn", "")).strip() or None
    purchase_price = payload.get("purchase_price")
    total_copies = parse_int(payload.get("total_copies"), "total_copies", minimum=0)
    issue_total_copies = parse_int(
        payload.get("issue_total_copies", total_copies), "issue_total_copies", minimum=0
    )
    available_copies = parse_int(
        payload.get("available_copies", issue_total_copies), "available_copies", minimum=0
    )
    slot_booking_copies = parse_int(
        payload.get("slot_booking_copies", total_copies), "slot_booking_copies", minimum=0
    )
    if purchase_price is None or str(purchase_price).strip() == "":
        purchase_price = generate_random_purchase_price()
    else:
        try:
            purchase_price = round(float(purchase_price), 2)
        except (TypeError, ValueError) as exc:
            raise ApiError("purchase_price must be a number.", 400) from exc
        if purchase_price < 0:
            raise ApiError("purchase_price cannot be negative.", 400)

    if issue_total_copies > total_copies:
        raise ApiError("issue_total_copies cannot be greater than total_copies.", 400)
    if available_copies > issue_total_copies:
        raise ApiError("available_copies cannot be greater than issue_total_copies.", 400)
    if slot_booking_copies > total_copies:
        raise ApiError("slot_booking_copies cannot be greater than total_copies.", 400)

    try:
        with get_db_connection() as conn:
            if requested_book_id is not None:
                requested_book_id = parse_int(requested_book_id, "book_id", minimum=1)
                row = conn.execute(
                    """
                    INSERT INTO books (
                        book_id,
                        library_id,
                        title,
                        author,
                        isbn,
                        purchase_price,
                        total_copies,
                        issue_total_copies,
                        available_copies,
                        slot_booking_copies
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING book_id
                    """,
                    (
                        requested_book_id,
                        library_id,
                        title,
                        author,
                        isbn,
                        purchase_price,
                        total_copies,
                        issue_total_copies,
                        available_copies,
                        slot_booking_copies,
                    ),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    INSERT INTO books (
                        library_id,
                        title,
                        author,
                        isbn,
                        purchase_price,
                        total_copies,
                        issue_total_copies,
                        available_copies,
                        slot_booking_copies
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING book_id
                    """,
                    (
                        library_id,
                        title,
                        author,
                        isbn,
                        purchase_price,
                        total_copies,
                        issue_total_copies,
                        available_copies,
                        slot_booking_copies,
                    ),
                ).fetchone()
            created = fetch_book(conn, row["book_id"])
    except UniqueViolation as exc:
        raise ApiError("book_id already exists.", 409) from exc
    except ForeignKeyViolation as exc:
        raise ApiError("library_id does not exist.", 404) from exc

    invalidate_catalog_cache()
    return success(created, 201)


@app.put("/api/books/<int:book_id>")
def update_book(book_id: int):
    payload = get_json_body()

    with get_db_connection() as conn:
        current = conn.execute(
            """
            SELECT
                book_id,
                library_id,
                title,
                author,
                isbn,
                purchase_price,
                total_copies,
                issue_total_copies,
                available_copies,
                slot_booking_copies
            FROM books
            WHERE book_id = %s
            """,
            (book_id,),
        ).fetchone()
        if current is None:
            raise ApiError("Book not found.", 404)

        next_library_id = parse_int(
            payload.get("library_id", current["library_id"]), "library_id", minimum=1
        )
        next_title = str(payload.get("title", current["title"])).strip()
        next_author = str(payload.get("author", current["author"])).strip()
        next_isbn = str(payload.get("isbn", current["isbn"] or "")).strip() or None
        if "purchase_price" in payload:
            try:
                next_purchase_price = round(float(payload.get("purchase_price")), 2)
            except (TypeError, ValueError) as exc:
                raise ApiError("purchase_price must be a number.", 400) from exc
            if next_purchase_price < 0:
                raise ApiError("purchase_price cannot be negative.", 400)
        else:
            next_purchase_price = float(current["purchase_price"])

        if not next_title:
            raise ApiError("title cannot be blank.", 400)
        if not next_author:
            raise ApiError("author cannot be blank.", 400)

        active_issue_count = current["issue_total_copies"] - current["available_copies"]
        if "total_copies" in payload:
            next_total = parse_int(payload.get("total_copies"), "total_copies", minimum=0)
        else:
            next_total = current["total_copies"]

        if "issue_total_copies" in payload:
            next_issue_total = parse_int(
                payload.get("issue_total_copies"), "issue_total_copies", minimum=0
            )
        else:
            next_issue_total = current["issue_total_copies"]

        if "available_copies" in payload:
            next_available = parse_int(
                payload.get("available_copies"), "available_copies", minimum=0
            )
        elif "issue_total_copies" in payload:
            next_available = next_issue_total - active_issue_count
        else:
            next_available = current["available_copies"]

        if "slot_booking_copies" in payload:
            next_slot_booking_copies = parse_int(
                payload.get("slot_booking_copies"), "slot_booking_copies", minimum=0
            )
        else:
            next_slot_booking_copies = current["slot_booking_copies"]

        if next_issue_total > next_total:
            raise ApiError("issue_total_copies cannot be greater than total_copies.", 400)
        if next_available < 0:
            raise ApiError(
                "issue_total_copies cannot be reduced below the number of currently issued copies.",
                400,
            )
        if next_available > next_issue_total:
            raise ApiError("available_copies cannot be greater than issue_total_copies.", 400)
        if next_slot_booking_copies > next_total:
            raise ApiError("slot_booking_copies cannot be greater than total_copies.", 400)

        try:
            conn.execute(
                """
                UPDATE books
                SET
                    library_id = %s,
                    title = %s,
                    author = %s,
                    isbn = %s,
                    purchase_price = %s,
                    total_copies = %s,
                    issue_total_copies = %s,
                    available_copies = %s,
                    slot_booking_copies = %s
                WHERE book_id = %s
                """,
                (
                    next_library_id,
                    next_title,
                    next_author,
                    next_isbn,
                    next_purchase_price,
                    next_total,
                    next_issue_total,
                    next_available,
                    next_slot_booking_copies,
                    book_id,
                ),
            )
        except ForeignKeyViolation as exc:
            raise ApiError("library_id does not exist.", 404) from exc

        updated = fetch_book(conn, book_id)

    invalidate_catalog_cache()
    return success(updated)


@app.delete("/api/books/<int:book_id>")
def delete_book(book_id: int):
    try:
        with get_db_connection() as conn:
            deleted = conn.execute(
                "DELETE FROM books WHERE book_id = %s RETURNING book_id",
                (book_id,),
            ).fetchone()
    except ForeignKeyViolation as exc:
        raise ApiError(
            "This book is referenced by active library data and cannot be deleted.", 409
        ) from exc

    if deleted is None:
        raise ApiError("Book not found.", 404)
    invalidate_catalog_cache()
    return success({"book_id": book_id})


@app.post("/api/auth/register")
def register_user():
    payload = get_json_body()
    role = require_text(payload, "role").lower()
    full_name = require_text(payload, "full_name")
    email = normalize_email(require_text(payload, "email"))
    password = require_text(payload, "password")
    managed_library_id = payload.get("managed_library_id")
    legacy_source = str(payload.get("legacy_source", "")).strip() or None
    legacy_source_id = payload.get("legacy_source_id")

    if role not in {"member", "admin"}:
        raise ApiError("role must be either 'member' or 'admin'.", 400)
    if role == "admin" and managed_library_id is None:
        raise ApiError("managed_library_id is required for admin users.", 400)
    if role == "member":
        managed_library_id = None
    elif managed_library_id is not None:
        managed_library_id = parse_int(managed_library_id, "managed_library_id", minimum=1)

    if legacy_source_id is not None:
        legacy_source_id = parse_int(legacy_source_id, "legacy_source_id", minimum=1)

    try:
        with get_db_connection() as conn:
            row = conn.execute(
                """
                INSERT INTO users (
                    role,
                    full_name,
                    email,
                    password_hash,
                    legacy_source,
                    legacy_source_id,
                    managed_library_id,
                    email_verified_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING user_id
                """,
                (
                    role,
                    full_name,
                    email,
                    generate_password_hash(password),
                    legacy_source,
                    legacy_source_id,
                    managed_library_id,
                    utc_now() if parse_bool_value(payload.get("email_verified")) else None,
                ),
            ).fetchone()
            created = fetch_public_user(conn, row["user_id"])
    except UniqueViolation as exc:
        raise ApiError("A user with this email or legacy identity already exists.", 409) from exc
    except ForeignKeyViolation as exc:
        raise ApiError("managed_library_id does not exist.", 404) from exc

    set_audit_actor(created)
    return success(created, 201)


@app.post("/api/auth/login")
def login_user():
    payload = get_json_body()
    email = normalize_email(require_text(payload, "email"))
    password = require_text(payload, "password")

    with get_db_connection() as conn:
        user = conn.execute(
            """
            SELECT
                u.user_id,
                u.role,
                u.full_name,
                u.email,
                u.password_hash,
                u.managed_library_id,
                u.email_verified_at,
                u.must_reset_password,
                u.is_active,
                u.last_login_at,
                u.created_at,
                u.updated_at,
                l.code AS managed_library_code,
                l.name AS managed_library_name
            FROM users u
            LEFT JOIN libraries l ON l.library_id = u.managed_library_id
            WHERE LOWER(u.email) = %s
            """,
            (email,),
        ).fetchone()

        if user is None or not password_matches(user["password_hash"], password):
            raise ApiError("Invalid email or password.", 401)
        if not user["is_active"]:
            raise ApiError("This account is inactive.", 403)

        maybe_upgrade_password_hash(conn, user["user_id"], user["password_hash"], password)
        conn.execute(
            "UPDATE users SET last_login_at = %s WHERE user_id = %s",
            (utc_now(), user["user_id"]),
        )
        refreshed = fetch_public_user(conn, user["user_id"])

    set_audit_actor(refreshed)
    return success(refreshed)


@app.post("/api/auth/password-reset")
def reset_password():
    payload = get_json_body()
    email = normalize_email(require_text(payload, "email"))
    new_password = require_text(payload, "new_password")

    with get_db_connection() as conn:
        user = conn.execute(
            """
            SELECT user_id
            FROM users
            WHERE LOWER(email) = %s
            """,
            (email,),
        ).fetchone()
        if user is None:
            raise ApiError("No account found for this email.", 404)

        conn.execute(
            """
            UPDATE users
            SET
                password_hash = %s,
                must_reset_password = FALSE
            WHERE user_id = %s
            """,
            (generate_password_hash(new_password), user["user_id"]),
        )

        updated = fetch_public_user(conn, user["user_id"])

    set_audit_actor(updated)
    return success(updated)


@app.post("/api/auth/logout")
def logout_user():
    return success({"logged_out": True})


@app.post("/api/loans")
def issue_loan():
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)
    book_id = parse_int(payload.get("book_id"), "book_id", minimum=1)
    due_days = parse_int(payload.get("due_days", DEFAULT_LOAN_DAYS), "due_days", minimum=1)
    issued_by_user_id = payload.get("issued_by_user_id")
    borrow_request_id = payload.get("borrow_request_id")

    if issued_by_user_id is not None:
        issued_by_user_id = parse_int(issued_by_user_id, "issued_by_user_id", minimum=1)
    if borrow_request_id is not None:
        borrow_request_id = parse_int(borrow_request_id, "borrow_request_id", minimum=1)

    try:
        with get_db_connection() as conn:
            expire_stale_slot_bookings(conn)
            member = conn.execute(
                """
                SELECT user_id, role, is_active
                FROM users
                WHERE user_id = %s
                """,
                (member_id,),
            ).fetchone()
            if member is None or member["role"] != "member":
                raise ApiError("member_id must belong to an active member user.", 404)
            if not member["is_active"]:
                raise ApiError("This member account is inactive.", 403)

            if issued_by_user_id is not None:
                issuer = conn.execute(
                    "SELECT user_id, role, is_active FROM users WHERE user_id = %s",
                    (issued_by_user_id,),
                ).fetchone()
                if issuer is None or issuer["role"] != "admin":
                    raise ApiError("issued_by_user_id must belong to an admin user.", 404)
                if not issuer["is_active"]:
                    raise ApiError("The issuing admin account is inactive.", 403)

            borrow_request = None
            if borrow_request_id is not None:
                borrow_request = conn.execute(
                    """
                    SELECT borrow_request_id, member_id, book_id, status
                    FROM borrow_requests
                    WHERE borrow_request_id = %s
                    FOR UPDATE
                    """,
                    (borrow_request_id,),
                ).fetchone()
                if borrow_request is None:
                    raise ApiError("borrow_request_id not found.", 404)
                if borrow_request["member_id"] != member_id or borrow_request["book_id"] != book_id:
                    raise ApiError("borrow_request_id does not match member_id and book_id.", 400)
                if borrow_request["status"] != "pending":
                    raise ApiError("Only pending borrow requests can be issued.", 409)

            book = conn.execute(
                """
                SELECT book_id, available_copies
                FROM books
                WHERE book_id = %s
                FOR UPDATE
                """,
                (book_id,),
            ).fetchone()
            ensure_book_can_be_fulfilled(
                conn,
                book,
                unavailable_message="No copies are available for this book.",
            )

            existing = conn.execute(
                """
                SELECT loan_id
                FROM book_loans
                WHERE member_id = %s AND book_id = %s AND returned_at IS NULL
                """,
                (member_id, book_id),
            ).fetchone()
            if existing is not None:
                raise ApiError("This member already has an active loan for the book.", 409)

            if borrow_request is not None:
                conn.execute(
                    """
                    UPDATE borrow_requests
                    SET
                        status = 'approved',
                        reviewed_at = %s,
                        reviewed_by_user_id = %s,
                        rejection_reason = NULL
                    WHERE borrow_request_id = %s
                    """,
                    (utc_now(), issued_by_user_id, borrow_request_id),
                )

            due_at = utc_now() + timedelta(days=due_days)
            loan_row = conn.execute(
                """
                INSERT INTO book_loans (
                    borrow_request_id,
                    member_id,
                    book_id,
                    issued_by_user_id,
                    due_at
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING loan_id
                """,
                (borrow_request_id, member_id, book_id, issued_by_user_id, due_at),
            ).fetchone()

            conn.execute(
                """
                UPDATE books
                SET available_copies = available_copies - 1
                WHERE book_id = %s
                """,
                (book_id,),
            )

            created = fetch_loan(conn, loan_row["loan_id"])
    except UniqueViolation as exc:
        raise ApiError("A duplicate active loan already exists.", 409) from exc
    except ForeignKeyViolation as exc:
        raise ApiError("A related user, book, or request record was not found.", 404) from exc

    invalidate_all_caches()
    return success(created, 201)


@app.get("/api/users/<int:user_id>/loans")
def list_user_loans(user_id: int):
    active_only = parse_bool_arg("active_only", default=False)
    params: list[Any] = [user_id]
    active_filter = ""
    if active_only:
        active_filter = "AND bl.returned_at IS NULL"

    with get_db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                bl.loan_id,
                bl.borrow_request_id,
                bl.member_id,
                bl.book_id,
                bl.issued_by_user_id,
                bl.issued_at,
                bl.due_at,
                bl.returned_at,
                bl.fine_amount,
                bl.created_at,
                bl.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name
            FROM book_loans bl
            JOIN books b ON b.book_id = bl.book_id
            JOIN libraries l ON l.library_id = b.library_id
            WHERE bl.member_id = %s
            {active_filter}
            ORDER BY bl.issued_at DESC
            """,
            tuple(params),
        ).fetchall()
    return success(rows)


@app.post("/api/loans/<int:loan_id>/return")
def return_loan(loan_id: int):
    payload = get_json_body()
    try:
        fine_amount = float(payload.get("fine_amount", 0))
    except (TypeError, ValueError) as exc:
        raise ApiError("fine_amount must be a number.", 400) from exc
    if fine_amount < 0:
        raise ApiError("fine_amount cannot be negative.", 400)

    with get_db_connection() as conn:
        loan = conn.execute(
            """
            SELECT loan_id, book_id, returned_at
            FROM book_loans
            WHERE loan_id = %s
            FOR UPDATE
            """,
            (loan_id,),
        ).fetchone()
        if loan is None:
            raise ApiError("Loan not found.", 404)
        if loan["returned_at"] is not None:
            raise ApiError("This loan has already been returned.", 409)

        conn.execute(
            """
            UPDATE book_loans
            SET returned_at = %s, fine_amount = %s
            WHERE loan_id = %s
            """,
            (utc_now(), fine_amount, loan_id),
        )
        conn.execute(
            """
            UPDATE books
            SET available_copies = available_copies + 1
            WHERE book_id = %s
            """,
            (loan["book_id"],),
        )
        updated = fetch_loan(conn, loan_id)

    invalidate_all_caches()
    return success(updated)


@app.post("/api/borrow-requests")
def create_borrow_request():
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)
    book_id = parse_int(payload.get("book_id"), "book_id", minimum=1)

    try:
        with get_db_connection() as conn:
            member = conn.execute(
                """
                SELECT user_id, role, is_active
                FROM users
                WHERE user_id = %s
                """,
                (member_id,),
            ).fetchone()
            if member is None or member["role"] != "member":
                raise ApiError("member_id must belong to a member user.", 404)
            if not member["is_active"]:
                raise ApiError("This member account is inactive.", 403)

            book = conn.execute(
                "SELECT book_id FROM books WHERE book_id = %s",
                (book_id,),
            ).fetchone()
            if book is None:
                raise ApiError("Book not found.", 404)

            created = conn.execute(
                """
                INSERT INTO borrow_requests (member_id, book_id)
                VALUES (%s, %s)
                RETURNING
                    borrow_request_id,
                    member_id,
                    book_id,
                    requested_at,
                    status,
                    reviewed_at,
                    reviewed_by_user_id,
                    rejection_reason,
                    created_at,
                    updated_at
                """,
                (member_id, book_id),
            ).fetchone()
    except UniqueViolation as exc:
        raise ApiError("A pending request already exists for this member and book.", 409) from exc

    invalidate_dashboard_cache()
    return success(created, 201)


@app.get("/api/users/<int:user_id>/borrow-requests")
def list_user_borrow_requests(user_id: int):
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                br.borrow_request_id,
                br.member_id,
                br.book_id,
                br.requested_at,
                br.status,
                br.reviewed_at,
                br.reviewed_by_user_id,
                br.rejection_reason,
                br.created_at,
                br.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name
            FROM borrow_requests br
            JOIN books b ON b.book_id = br.book_id
            JOIN libraries l ON l.library_id = b.library_id
            WHERE br.member_id = %s
            ORDER BY br.requested_at DESC
            """,
            (user_id,),
        ).fetchall()
    return success(rows)


@app.get("/api/users/<int:user_id>/dashboard")
def get_user_dashboard_snapshot(user_id: int):
    def load_snapshot():
        with get_db_connection() as conn:
            return fetch_user_dashboard_snapshot(conn, user_id)

    snapshot = get_cached_value(
        f"user_dashboard:{user_id}",
        DASHBOARD_CACHE_TTL_SECONDS,
        load_snapshot,
    )
    return success(snapshot)


@app.post("/api/borrow-requests/<int:borrow_request_id>/cancel")
def cancel_borrow_request(borrow_request_id: int):
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)

    with get_db_connection() as conn:
        borrow_request = conn.execute(
            """
            SELECT borrow_request_id, member_id, status
            FROM borrow_requests
            WHERE borrow_request_id = %s
            FOR UPDATE
            """,
            (borrow_request_id,),
        ).fetchone()
        if borrow_request is None:
            raise ApiError("Borrow request not found.", 404)
        if borrow_request["member_id"] != member_id:
            raise ApiError("This request does not belong to the provided member.", 403)
        if borrow_request["status"] != "pending":
            raise ApiError("Only pending borrow requests can be cancelled.", 409)

        conn.execute(
            """
            UPDATE borrow_requests
            SET
                status = 'cancelled',
                reviewed_at = %s,
                reviewed_by_user_id = NULL,
                rejection_reason = NULL
            WHERE borrow_request_id = %s
            """,
            (utc_now(), borrow_request_id),
        )
        updated_request = conn.execute(
            """
            SELECT
                borrow_request_id,
                member_id,
                book_id,
                requested_at,
                status,
                reviewed_at,
                reviewed_by_user_id,
                rejection_reason,
                created_at,
                updated_at
            FROM borrow_requests
            WHERE borrow_request_id = %s
            """,
            (borrow_request_id,),
        ).fetchone()

    invalidate_dashboard_cache()
    return success(updated_request)


@app.post("/api/purchase-requests")
def create_purchase_request():
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)
    book_id = parse_int(payload.get("book_id"), "book_id", minimum=1)

    try:
        with get_db_connection() as conn:
            member = conn.execute(
                """
                SELECT user_id, role, is_active
                FROM users
                WHERE user_id = %s
                """,
                (member_id,),
            ).fetchone()
            if member is None or member["role"] != "member":
                raise ApiError("member_id must belong to a member user.", 404)
            if not member["is_active"]:
                raise ApiError("This member account is inactive.", 403)

            book = conn.execute(
                """
                SELECT book_id, purchase_price
                FROM books
                WHERE book_id = %s
                """,
                (book_id,),
            ).fetchone()
            if book is None:
                raise ApiError("Book not found.", 404)

            created = conn.execute(
                """
                INSERT INTO purchase_requests (member_id, book_id, requested_price)
                VALUES (%s, %s, %s)
                RETURNING
                    purchase_request_id,
                    member_id,
                    book_id,
                    requested_price,
                    requested_at,
                    status,
                    reviewed_at,
                    reviewed_by_user_id,
                    rejection_reason,
                    created_at,
                    updated_at
                """,
                (member_id, book_id, book["purchase_price"]),
            ).fetchone()
    except UniqueViolation as exc:
        raise ApiError("A pending purchase request already exists for this member and book.", 409) from exc

    invalidate_dashboard_cache()
    return success(created, 201)


@app.get("/api/users/<int:user_id>/purchase-requests")
def list_user_purchase_requests(user_id: int):
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                pr.purchase_request_id,
                pr.member_id,
                pr.book_id,
                pr.requested_price,
                pr.requested_at,
                pr.status,
                pr.reviewed_at,
                pr.reviewed_by_user_id,
                pr.rejection_reason,
                pr.created_at,
                pr.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name
            FROM purchase_requests pr
            JOIN books b ON b.book_id = pr.book_id
            JOIN libraries l ON l.library_id = b.library_id
            WHERE pr.member_id = %s
            ORDER BY pr.requested_at DESC
            """,
            (user_id,),
        ).fetchall()
    return success(rows)


@app.post("/api/purchase-requests/<int:purchase_request_id>/cancel")
def cancel_purchase_request(purchase_request_id: int):
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)

    with get_db_connection() as conn:
        purchase_request = conn.execute(
            """
            SELECT purchase_request_id, member_id, status
            FROM purchase_requests
            WHERE purchase_request_id = %s
            FOR UPDATE
            """,
            (purchase_request_id,),
        ).fetchone()
        if purchase_request is None:
            raise ApiError("Purchase request not found.", 404)
        if purchase_request["member_id"] != member_id:
            raise ApiError("This purchase request does not belong to the provided member.", 403)
        if purchase_request["status"] != "pending":
            raise ApiError("Only pending purchase requests can be cancelled.", 409)

        conn.execute(
            """
            UPDATE purchase_requests
            SET
                status = 'cancelled',
                reviewed_at = %s,
                reviewed_by_user_id = NULL,
                rejection_reason = NULL
            WHERE purchase_request_id = %s
            """,
            (utc_now(), purchase_request_id),
        )
        updated = conn.execute(
            """
            SELECT
                purchase_request_id,
                member_id,
                book_id,
                requested_price,
                requested_at,
                status,
                reviewed_at,
                reviewed_by_user_id,
                rejection_reason,
                created_at,
                updated_at
            FROM purchase_requests
            WHERE purchase_request_id = %s
            """,
            (purchase_request_id,),
        ).fetchone()

    invalidate_dashboard_cache()
    return success(updated)


@app.get("/api/admin/libraries/<int:library_id>/purchase-requests")
def list_admin_library_purchase_requests(library_id: int):
    status = request.args.get("status", "").strip().lower()
    params: list[Any] = [library_id]
    status_sql = ""
    if status:
        if status not in {"pending", "approved", "rejected", "cancelled"}:
            raise ApiError("Unsupported status filter.", 400)
        status_sql = "AND pr.status = %s"
        params.append(status)

    with get_db_connection() as conn:
        library = fetch_library(conn, library_id)
        if library is None:
            raise ApiError("Library not found.", 404)

        rows = conn.execute(
            f"""
            SELECT
                pr.purchase_request_id,
                pr.member_id,
                pr.book_id,
                pr.requested_price,
                pr.requested_at,
                pr.status,
                pr.reviewed_at,
                pr.reviewed_by_user_id,
                pr.rejection_reason,
                pr.created_at,
                pr.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name,
                u.full_name AS member_name,
                u.email AS member_email
            FROM purchase_requests pr
            JOIN books b ON b.book_id = pr.book_id
            JOIN libraries l ON l.library_id = b.library_id
            JOIN users u ON u.user_id = pr.member_id
            WHERE b.library_id = %s
            {status_sql}
            ORDER BY pr.requested_at DESC
            """,
            tuple(params),
        ).fetchall()

    return success(rows)


@app.post("/api/purchase-requests/<int:purchase_request_id>/review")
def review_purchase_request(purchase_request_id: int):
    payload = get_json_body()
    reviewer_user_id = parse_int(payload.get("reviewer_user_id"), "reviewer_user_id", minimum=1)
    action = require_text(payload, "action").lower()

    if action not in {"approved", "rejected"}:
        raise ApiError("action must be 'approved' or 'rejected'.", 400)

    with get_db_connection() as conn:
        reviewer = conn.execute(
            """
            SELECT user_id, role, is_active, managed_library_id
            FROM users
            WHERE user_id = %s
            """,
            (reviewer_user_id,),
        ).fetchone()
        if reviewer is None or reviewer["role"] != "admin":
            raise ApiError("reviewer_user_id must belong to an admin user.", 404)
        if not reviewer["is_active"]:
            raise ApiError("This admin account is inactive.", 403)

        purchase_request = conn.execute(
            """
            SELECT
                pr.purchase_request_id,
                pr.member_id,
                pr.book_id,
                pr.status,
                b.library_id
            FROM purchase_requests pr
            JOIN books b ON b.book_id = pr.book_id
            WHERE pr.purchase_request_id = %s
            FOR UPDATE
            """,
            (purchase_request_id,),
        ).fetchone()
        if purchase_request is None:
            raise ApiError("Purchase request not found.", 404)
        if purchase_request["status"] != "pending":
            raise ApiError("Only pending purchase requests can be reviewed.", 409)
        if reviewer["managed_library_id"] != purchase_request["library_id"]:
            raise ApiError("This admin cannot review requests for another library.", 403)

        # Purchase approvals are handled independently from issue and slot workflows.
        rejection_reason = None
        if action == "rejected":
            rejection_reason = require_text(payload, "rejection_reason")

        conn.execute(
            """
            UPDATE purchase_requests
            SET
                status = %s,
                reviewed_at = %s,
                reviewed_by_user_id = %s,
                rejection_reason = %s
            WHERE purchase_request_id = %s
            """,
            (action, utc_now(), reviewer_user_id, rejection_reason, purchase_request_id),
        )
        updated = conn.execute(
            """
            SELECT
                purchase_request_id,
                member_id,
                book_id,
                requested_price,
                requested_at,
                status,
                reviewed_at,
                reviewed_by_user_id,
                rejection_reason,
                created_at,
                updated_at
            FROM purchase_requests
            WHERE purchase_request_id = %s
            """,
            (purchase_request_id,),
        ).fetchone()

    invalidate_dashboard_cache()
    return success(updated)


@app.get("/api/admin/libraries/<int:library_id>/borrow-requests")
def list_admin_library_borrow_requests(library_id: int):
    status = request.args.get("status", "").strip().lower()
    params: list[Any] = [library_id]
    status_sql = ""
    if status:
        if status not in {"pending", "approved", "rejected", "cancelled"}:
            raise ApiError("Unsupported status filter.", 400)
        status_sql = "AND br.status = %s"
        params.append(status)

    with get_db_connection() as conn:
        library = fetch_library(conn, library_id)
        if library is None:
            raise ApiError("Library not found.", 404)

        rows = conn.execute(
            f"""
            SELECT
                br.borrow_request_id,
                br.member_id,
                br.book_id,
                br.requested_at,
                br.status,
                br.reviewed_at,
                br.reviewed_by_user_id,
                br.rejection_reason,
                br.created_at,
                br.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name,
                u.full_name AS member_name,
                u.email AS member_email
            FROM borrow_requests br
            JOIN books b ON b.book_id = br.book_id
            JOIN libraries l ON l.library_id = b.library_id
            JOIN users u ON u.user_id = br.member_id
            WHERE b.library_id = %s
            {status_sql}
            ORDER BY br.requested_at DESC
            """,
            tuple(params),
        ).fetchall()

    return success(rows)


@app.get("/api/admin/libraries/<int:library_id>/dashboard")
def get_admin_dashboard_snapshot(library_id: int):
    def load_snapshot():
        with get_db_connection() as conn:
            return fetch_admin_dashboard_snapshot(conn, library_id)

    snapshot = get_cached_value(
        f"admin_dashboard:{library_id}",
        DASHBOARD_CACHE_TTL_SECONDS,
        load_snapshot,
    )
    return success(snapshot)


@app.get("/api/developer/dashboard")
def get_developer_dashboard():
    require_developer_access()
    limit = parse_int(request.args.get("limit", 200), "limit", minimum=1)

    def load_snapshot():
        with get_db_connection() as conn:
            return fetch_developer_dashboard_snapshot(conn, limit)

    snapshot = get_cached_value(
        "developer_dashboard",
        DASHBOARD_CACHE_TTL_SECONDS,
        load_snapshot,
    )
    return success(snapshot)


@app.post("/api/borrow-requests/<int:borrow_request_id>/review")
def review_borrow_request(borrow_request_id: int):
    payload = get_json_body()
    reviewer_user_id = parse_int(payload.get("reviewer_user_id"), "reviewer_user_id", minimum=1)
    action = require_text(payload, "action").lower()

    if action not in {"approved", "rejected"}:
        raise ApiError("action must be either 'approved' or 'rejected'.", 400)

    with get_db_connection() as conn:
        expire_stale_slot_bookings(conn)
        reviewer = conn.execute(
            "SELECT user_id, role, is_active FROM users WHERE user_id = %s",
            (reviewer_user_id,),
        ).fetchone()
        if reviewer is None or reviewer["role"] != "admin":
            raise ApiError("reviewer_user_id must belong to an admin user.", 404)
        if not reviewer["is_active"]:
            raise ApiError("The reviewing admin account is inactive.", 403)

        borrow_request = conn.execute(
            """
            SELECT borrow_request_id, member_id, book_id, status
            FROM borrow_requests
            WHERE borrow_request_id = %s
            FOR UPDATE
            """,
            (borrow_request_id,),
        ).fetchone()
        if borrow_request is None:
            raise ApiError("Borrow request not found.", 404)
        if borrow_request["status"] != "pending":
            raise ApiError("Only pending borrow requests can be reviewed.", 409)

        reviewed_at = utc_now()

        if action == "rejected":
            rejection_reason = require_text(payload, "rejection_reason")
            conn.execute(
                """
                UPDATE borrow_requests
                SET
                    status = 'rejected',
                    reviewed_at = %s,
                    reviewed_by_user_id = %s,
                    rejection_reason = %s
                WHERE borrow_request_id = %s
                """,
                (reviewed_at, reviewer_user_id, rejection_reason, borrow_request_id),
            )
            updated_request = conn.execute(
                """
                SELECT
                    borrow_request_id,
                    member_id,
                    book_id,
                    requested_at,
                    status,
                    reviewed_at,
                    reviewed_by_user_id,
                    rejection_reason,
                    created_at,
                    updated_at
                FROM borrow_requests
                WHERE borrow_request_id = %s
                """,
                (borrow_request_id,),
            ).fetchone()
            invalidate_dashboard_cache()
            return success(updated_request)

        due_days = parse_int(payload.get("due_days", DEFAULT_LOAN_DAYS), "due_days", minimum=1)
        book = conn.execute(
            """
            SELECT book_id, available_copies
            FROM books
            WHERE book_id = %s
            FOR UPDATE
            """,
            (borrow_request["book_id"],),
        ).fetchone()
        ensure_book_can_be_fulfilled(
            conn,
            book,
            unavailable_message="No copies are available for this book.",
        )

        existing = conn.execute(
            """
            SELECT loan_id
            FROM book_loans
            WHERE member_id = %s AND book_id = %s AND returned_at IS NULL
            """,
            (borrow_request["member_id"], borrow_request["book_id"]),
        ).fetchone()
        if existing is not None:
            raise ApiError("This member already has an active loan for the book.", 409)

        conn.execute(
            """
            UPDATE borrow_requests
            SET
                status = 'approved',
                reviewed_at = %s,
                reviewed_by_user_id = %s,
                rejection_reason = NULL
            WHERE borrow_request_id = %s
            """,
            (reviewed_at, reviewer_user_id, borrow_request_id),
        )

        loan_row = conn.execute(
            """
            INSERT INTO book_loans (
                borrow_request_id,
                member_id,
                book_id,
                issued_by_user_id,
                due_at
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING loan_id
            """,
            (
                borrow_request_id,
                borrow_request["member_id"],
                borrow_request["book_id"],
                reviewer_user_id,
                utc_now() + timedelta(days=due_days),
            ),
        ).fetchone()
        conn.execute(
            """
            UPDATE books
            SET available_copies = available_copies - 1
            WHERE book_id = %s
            """,
            (borrow_request["book_id"],),
        )

        updated_request = conn.execute(
            """
            SELECT
                borrow_request_id,
                member_id,
                book_id,
                requested_at,
                status,
                reviewed_at,
                reviewed_by_user_id,
                rejection_reason,
                created_at,
                updated_at
            FROM borrow_requests
            WHERE borrow_request_id = %s
            """,
            (borrow_request_id,),
        ).fetchone()
        created_loan = fetch_loan(conn, loan_row["loan_id"])

    invalidate_all_caches()
    return success({"borrow_request": updated_request, "loan": created_loan})


@app.get("/api/visit-slots")
def list_visit_slots():
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT slot_id, label, start_time, end_time, sort_order
            FROM visit_slots
            ORDER BY sort_order ASC
            """
        ).fetchall()
    return success(rows)


@app.post("/api/slot-bookings")
def create_slot_booking():
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)
    book_id = parse_int(payload.get("book_id"), "book_id", minimum=1)
    slot_id = parse_int(payload.get("slot_id"), "slot_id", minimum=1)
    slot_date = parse_date(payload.get("slot_date"), "slot_date")

    if slot_date < date.today():
        raise ApiError("slot_date cannot be in the past.", 400)

    try:
        with get_db_connection() as conn:
            expire_stale_slot_bookings(conn)
            member = conn.execute(
                "SELECT user_id, role, is_active FROM users WHERE user_id = %s",
                (member_id,),
            ).fetchone()
            if member is None or member["role"] != "member":
                raise ApiError("member_id must belong to a member user.", 404)
            if not member["is_active"]:
                raise ApiError("This member account is inactive.", 403)

            book = conn.execute(
                """
                SELECT book_id, slot_booking_copies
                FROM books
                WHERE book_id = %s
                FOR UPDATE
                """,
                (book_id,),
            ).fetchone()
            if book is None:
                raise ApiError("Book not found.", 404)
            if book["slot_booking_copies"] < 1:
                raise ApiError("No copies are configured for slot booking for this book.", 409)

            slot = conn.execute(
                """
                SELECT slot_id, start_time, end_time
                FROM visit_slots
                WHERE slot_id = %s
                """,
                (slot_id,),
            ).fetchone()
            if slot is None:
                raise ApiError("slot_id not found.", 404)
            if slot_has_started(slot_date, slot["start_time"]):
                raise ApiError(
                    "This slot has already started for the selected date. Choose a later slot or tomorrow.",
                    409,
                )

            reserved_count = count_reserved_slot_bookings(
                conn,
                book_id,
                slot_date=slot_date,
            )
            if reserved_count >= int(book["slot_booking_copies"]):
                raise ApiError(
                    "All slot-booking copies for this book are already booked for the selected date.",
                    409,
                )

            created = conn.execute(
                """
                INSERT INTO slot_bookings (member_id, book_id, slot_id, slot_date)
                VALUES (%s, %s, %s, %s)
                RETURNING
                    slot_booking_id,
                    member_id,
                    book_id,
                    slot_id,
                    slot_date,
                    status,
                    reviewed_at,
                    reviewed_by_user_id,
                    rejection_reason,
                    created_at,
                    updated_at,
                    cancelled_at,
                    fulfilled_at
                """,
                (member_id, book_id, slot_id, slot_date),
            ).fetchone()
    except UniqueViolation as exc:
        raise ApiError("This member already has a pending or approved slot booking for the book.", 409) from exc

    invalidate_dashboard_cache()
    return success(created, 201)


@app.get("/api/users/<int:user_id>/slot-bookings")
def list_user_slot_bookings(user_id: int):
    active_only = parse_bool_arg("active_only", default=False)
    status_filter = f"AND sb.status IN {OPEN_SLOT_BOOKING_STATUS_SQL}" if active_only else ""

    with get_db_connection() as conn:
        expire_stale_slot_bookings(conn)
        rows = conn.execute(
            f"""
            SELECT
                sb.slot_booking_id,
                sb.member_id,
                sb.book_id,
                sb.slot_id,
                sb.slot_date,
                sb.status,
                sb.reviewed_at,
                sb.reviewed_by_user_id,
                sb.rejection_reason,
                sb.created_at,
                sb.updated_at,
                sb.cancelled_at,
                sb.fulfilled_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name,
                vs.label AS slot_label,
                vs.start_time,
                vs.end_time
            FROM slot_bookings sb
            JOIN books b ON b.book_id = sb.book_id
            JOIN libraries l ON l.library_id = b.library_id
            JOIN visit_slots vs ON vs.slot_id = sb.slot_id
            WHERE sb.member_id = %s
            {status_filter}
            ORDER BY sb.slot_date DESC, vs.sort_order ASC
            """,
            (user_id,),
        ).fetchall()
    return success(rows)


@app.get("/api/admin/libraries/<int:library_id>/loans")
def list_admin_library_loans(library_id: int):
    active_only = parse_bool_arg("active_only", default=False)
    params: list[Any] = [library_id]
    active_sql = "AND bl.returned_at IS NULL" if active_only else ""

    with get_db_connection() as conn:
        library = fetch_library(conn, library_id)
        if library is None:
            raise ApiError("Library not found.", 404)

        rows = conn.execute(
            f"""
            SELECT
                bl.loan_id,
                bl.borrow_request_id,
                bl.member_id,
                bl.book_id,
                bl.issued_by_user_id,
                bl.issued_at,
                bl.due_at,
                bl.returned_at,
                bl.fine_amount,
                bl.created_at,
                bl.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name,
                u.full_name AS member_name,
                u.email AS member_email
            FROM book_loans bl
            JOIN books b ON b.book_id = bl.book_id
            JOIN libraries l ON l.library_id = b.library_id
            JOIN users u ON u.user_id = bl.member_id
            WHERE b.library_id = %s
            {active_sql}
            ORDER BY bl.issued_at DESC
            """,
            tuple(params),
        ).fetchall()

    return success(rows)


@app.post("/api/slot-bookings/<int:slot_booking_id>/cancel")
def cancel_slot_booking(slot_booking_id: int):
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)

    with get_db_connection() as conn:
        booking = conn.execute(
            """
            SELECT slot_booking_id, member_id, status
            FROM slot_bookings
            WHERE slot_booking_id = %s
            FOR UPDATE
            """,
            (slot_booking_id,),
        ).fetchone()
        if booking is None:
            raise ApiError("Slot booking not found.", 404)
        if booking["member_id"] != member_id:
            raise ApiError("This slot booking does not belong to the provided member.", 403)
        if booking["status"] not in OPEN_SLOT_BOOKING_STATUSES:
            raise ApiError("Only pending or approved slot bookings can be cancelled.", 409)

        conn.execute(
            """
            UPDATE slot_bookings
            SET status = 'cancelled', cancelled_at = %s
            WHERE slot_booking_id = %s
            """,
            (utc_now(), slot_booking_id),
        )
        updated = conn.execute(
            """
            SELECT
                slot_booking_id,
                member_id,
                book_id,
                slot_id,
                slot_date,
                status,
                reviewed_at,
                reviewed_by_user_id,
                rejection_reason,
                created_at,
                updated_at,
                cancelled_at,
                fulfilled_at
            FROM slot_bookings
            WHERE slot_booking_id = %s
            """,
            (slot_booking_id,),
        ).fetchone()

    invalidate_dashboard_cache()
    return success(updated)


@app.post("/api/slot-bookings/<int:slot_booking_id>/review")
def review_slot_booking(slot_booking_id: int):
    payload = get_json_body()
    reviewer_user_id = parse_int(payload.get("reviewer_user_id"), "reviewer_user_id", minimum=1)
    action = require_text(payload, "action").lower()

    if action not in {"approved", "rejected"}:
        raise ApiError("action must be 'approved' or 'rejected'.", 400)

    with get_db_connection() as conn:
        expire_stale_slot_bookings(conn)
        reviewer = conn.execute(
            """
            SELECT user_id, role, is_active, managed_library_id
            FROM users
            WHERE user_id = %s
            """,
            (reviewer_user_id,),
        ).fetchone()
        if reviewer is None or reviewer["role"] != "admin":
            raise ApiError("reviewer_user_id must belong to an admin user.", 404)
        if not reviewer["is_active"]:
            raise ApiError("This admin account is inactive.", 403)

        booking = conn.execute(
            """
            SELECT
                sb.slot_booking_id,
                sb.member_id,
                sb.book_id,
                sb.slot_id,
                sb.slot_date,
                sb.status,
                b.library_id,
                b.slot_booking_copies,
                vs.start_time
            FROM slot_bookings sb
            JOIN books b ON b.book_id = sb.book_id
            JOIN visit_slots vs ON vs.slot_id = sb.slot_id
            WHERE sb.slot_booking_id = %s
            FOR UPDATE
            """,
            (slot_booking_id,),
        ).fetchone()
        if booking is None:
            raise ApiError("Slot booking not found.", 404)
        if booking["status"] != "pending":
            raise ApiError("Only pending slot bookings can be reviewed.", 409)
        if reviewer["managed_library_id"] != booking["library_id"]:
            raise ApiError("This admin cannot review slot bookings for another library.", 403)

        reviewed_at = utc_now()
        rejection_reason = None
        if action == "approved":
            if slot_has_started(booking["slot_date"], booking["start_time"]):
                raise ApiError(
                    "This slot has already started and can no longer be approved. Ask the member to choose another future slot.",
                    409,
                )
            conn.execute(
                """
                SELECT book_id
                FROM books
                WHERE book_id = %s
                FOR UPDATE
                """,
                (booking["book_id"],),
            ).fetchone()
            reserved_count = count_reserved_slot_bookings(
                conn,
                int(booking["book_id"]),
                slot_date=booking["slot_date"],
            )
            if reserved_count >= int(booking["slot_booking_copies"]):
                raise ApiError(
                    "All slot-booking copies for this book are already booked for the selected date.",
                    409,
                )
        if action == "rejected":
            rejection_reason = require_text(payload, "rejection_reason")

        conn.execute(
            """
            UPDATE slot_bookings
            SET
                status = %s,
                reviewed_at = %s,
                reviewed_by_user_id = %s,
                rejection_reason = %s
            WHERE slot_booking_id = %s
            """,
            (action, reviewed_at, reviewer_user_id, rejection_reason, slot_booking_id),
        )
        updated = conn.execute(
            """
            SELECT
                slot_booking_id,
                member_id,
                book_id,
                slot_id,
                slot_date,
                status,
                reviewed_at,
                reviewed_by_user_id,
                rejection_reason,
                created_at,
                updated_at,
                cancelled_at,
                fulfilled_at
            FROM slot_bookings
            WHERE slot_booking_id = %s
            """,
            (slot_booking_id,),
        ).fetchone()

    invalidate_dashboard_cache()
    return success(updated)


@app.get("/api/admin/libraries/<int:library_id>/slot-bookings")
def list_admin_library_slot_bookings(library_id: int):
    active_only = parse_bool_arg("active_only", default=False)
    active_sql = f"AND sb.status IN {OPEN_SLOT_BOOKING_STATUS_SQL}" if active_only else ""

    with get_db_connection() as conn:
        expire_stale_slot_bookings(conn)
        library = fetch_library(conn, library_id)
        if library is None:
            raise ApiError("Library not found.", 404)

        rows = conn.execute(
            f"""
            SELECT
                sb.slot_booking_id,
                sb.member_id,
                sb.book_id,
                sb.slot_id,
                sb.slot_date,
                sb.status,
                sb.reviewed_at,
                sb.reviewed_by_user_id,
                sb.rejection_reason,
                sb.created_at,
                sb.updated_at,
                sb.cancelled_at,
                sb.fulfilled_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name,
                vs.label AS slot_label,
                vs.start_time,
                vs.end_time,
                u.full_name AS member_name,
                u.email AS member_email
            FROM slot_bookings sb
            JOIN books b ON b.book_id = sb.book_id
            JOIN libraries l ON l.library_id = b.library_id
            JOIN visit_slots vs ON vs.slot_id = sb.slot_id
            JOIN users u ON u.user_id = sb.member_id
            WHERE b.library_id = %s
            {active_sql}
            ORDER BY sb.slot_date DESC, vs.sort_order ASC
            """,
            (library_id,),
        ).fetchall()

    return success(rows)


@app.post("/api/waitlist")
def create_waitlist_entry():
    payload = get_json_body()
    member_id = parse_int(payload.get("member_id"), "member_id", minimum=1)
    book_id = parse_int(payload.get("book_id"), "book_id", minimum=1)

    try:
        with get_db_connection() as conn:
            member = conn.execute(
                "SELECT user_id, role, is_active FROM users WHERE user_id = %s",
                (member_id,),
            ).fetchone()
            if member is None or member["role"] != "member":
                raise ApiError("member_id must belong to a member user.", 404)
            if not member["is_active"]:
                raise ApiError("This member account is inactive.", 403)

            book = conn.execute(
                "SELECT book_id FROM books WHERE book_id = %s",
                (book_id,),
            ).fetchone()
            if book is None:
                raise ApiError("Book not found.", 404)

            last_position = conn.execute(
                """
                SELECT position
                FROM waitlist_entries
                WHERE book_id = %s AND status = 'waiting'
                ORDER BY position DESC NULLS LAST, created_at DESC
                LIMIT 1
                """,
                (book_id,),
            ).fetchone()
            next_position = (last_position["position"] if last_position else 0) + 1

            created = conn.execute(
                """
                INSERT INTO waitlist_entries (member_id, book_id, position)
                VALUES (%s, %s, %s)
                RETURNING
                    waitlist_entry_id,
                    member_id,
                    book_id,
                    status,
                    position,
                    notified_at,
                    fulfilled_at,
                    cancelled_at,
                    created_at,
                    updated_at
                """,
                (member_id, book_id, next_position),
            ).fetchone()
    except UniqueViolation as exc:
        raise ApiError("This member is already waiting for the selected book.", 409) from exc

    return success(created, 201)


@app.get("/api/users/<int:user_id>/waitlist")
def list_user_waitlist(user_id: int):
    active_only = parse_bool_arg("active_only", default=False)
    status_filter = "AND w.status = 'waiting'" if active_only else ""

    with get_db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                w.waitlist_entry_id,
                w.member_id,
                w.book_id,
                w.status,
                w.position,
                w.notified_at,
                w.fulfilled_at,
                w.cancelled_at,
                w.created_at,
                w.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                l.library_id,
                l.name AS library_name
            FROM waitlist_entries w
            JOIN books b ON b.book_id = w.book_id
            JOIN libraries l ON l.library_id = b.library_id
            WHERE w.member_id = %s
            {status_filter}
            ORDER BY w.created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return success(rows)


@app.post("/api/waitlist/<int:waitlist_entry_id>/cancel")
def cancel_waitlist_entry(waitlist_entry_id: int):
    with get_db_connection() as conn:
        entry = conn.execute(
            """
            SELECT waitlist_entry_id, status
            FROM waitlist_entries
            WHERE waitlist_entry_id = %s
            FOR UPDATE
            """,
            (waitlist_entry_id,),
        ).fetchone()
        if entry is None:
            raise ApiError("Waitlist entry not found.", 404)
        if entry["status"] != "waiting":
            raise ApiError("Only waiting entries can be cancelled.", 409)

        conn.execute(
            """
            UPDATE waitlist_entries
            SET status = 'cancelled', cancelled_at = %s
            WHERE waitlist_entry_id = %s
            """,
            (utc_now(), waitlist_entry_id),
        )
        updated = conn.execute(
            """
            SELECT
                waitlist_entry_id,
                member_id,
                book_id,
                status,
                position,
                notified_at,
                fulfilled_at,
                cancelled_at,
                created_at,
                updated_at
            FROM waitlist_entries
            WHERE waitlist_entry_id = %s
            """,
            (waitlist_entry_id,),
        ).fetchone()

    return success(updated)


def run():
    ensure_database_features()
    host = os.environ.get("API_HOST", "0.0.0.0").strip() or "0.0.0.0"
    port_value = os.environ.get("PORT", "").strip() or os.environ.get("API_PORT", "5000")
    port = parse_int(port_value, "PORT", minimum=1)
    serve(app, host=host, port=port, threads=8)


if __name__ == "__main__":
    run()
