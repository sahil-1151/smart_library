#!/usr/bin/env python3
"""
Import Smart Library legacy .txt files into the PostgreSQL schema in db/schema.sql.

Usage:
    python3 db/import_legacy_txt.py --dsn "$DATABASE_URL" --reset
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import os
import re
import secrets
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg  # type: ignore
except ImportError:  # pragma: no cover
    psycopg = None

try:
    import psycopg2  # type: ignore
except ImportError:  # pragma: no cover
    psycopg2 = None


@dataclass
class MemberRecord:
    user_id: int
    full_name: str
    email: str
    plaintext_password: str
    legacy_source: str
    legacy_source_id: int
    synthetic: bool = False


@dataclass
class AdminRecord:
    user_id: int
    full_name: str
    email: str
    plaintext_password: str
    legacy_source_id: int
    managed_library_label: str


@dataclass
class BookRecord:
    book_id: int
    library_label: str
    title: str
    author: str
    total_copies: int
    available_copies: int


@dataclass
class BorrowRequestRecord:
    member_id: int
    book_id: int
    requested_at: datetime
    status: str
    reviewed_at: datetime | None
    reviewed_by_user_id: int | None
    rejection_reason: str | None


@dataclass
class LoanRecord:
    member_id: int
    book_id: int
    issued_at: datetime
    due_at: datetime


@dataclass
class SlotBookingRecord:
    member_id: int
    book_id: int
    slot_date: date
    slot_id: int


@dataclass
class WaitlistRecord:
    member_id: int
    book_id: int
    position: int


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = SCRIPT_DIR.parent
PLACEHOLDER_DOMAIN = "imported.invalid"
ROLE_MEMBER = "member"
ROLE_ADMIN = "admin"
PASSWORD_HASH_ITERATIONS = 600_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Smart Library legacy text data into PostgreSQL.")
    parser.add_argument(
        "--dsn",
        default=os.environ.get("DATABASE_URL", "").strip(),
        help="PostgreSQL DSN. Defaults to DATABASE_URL.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="Directory containing the legacy .txt files.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Truncate imported tables before loading data.",
    )
    return parser.parse_args()


def require_db_driver() -> Any:
    if psycopg is not None:
        return psycopg
    if psycopg2 is not None:
        return psycopg2
    raise SystemExit(
        "No PostgreSQL driver found. Install `psycopg[binary]` or `psycopg2-binary` before running this importer."
    )


def connect_to_db(dsn: str):
    if not dsn:
        raise SystemExit("Missing database DSN. Pass --dsn or set DATABASE_URL.")
    driver = require_db_driver()
    return driver.connect(dsn)


def read_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "library"


def normalize_library(value: str) -> str:
    normalized = str(value or "").strip().lower()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[_-]+", " ", normalized)
    normalized = re.sub(r"\bbombay\b", "mumbai", normalized)
    normalized = re.sub(r"\bcentre\b", "center", normalized)
    normalized = re.sub(r"\blib\b", "library", normalized)
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def tokenize_library(value: str) -> list[str]:
    return [
        token
        for token in normalize_library(value).split(" ")
        if token and token not in {"library", "center", "knowledge", "central"}
    ]


def libraries_match(first: str, second: str) -> bool:
    first_normalized = normalize_library(first)
    second_normalized = normalize_library(second)
    if not first_normalized or not second_normalized:
        return False
    if first_normalized == second_normalized:
        return True
    first_tokens = tokenize_library(first)
    second_tokens = tokenize_library(second)
    if not first_tokens or not second_tokens:
        return False
    smaller, larger = (first_tokens, second_tokens) if len(first_tokens) <= len(second_tokens) else (second_tokens, first_tokens)
    return all(token in larger for token in smaller)


def looks_like_library_label(value: str) -> bool:
    raw = str(value or "").strip()
    label = raw.lower()
    return (
        "lib" in label
        or "library" in label
        or "centre" in label
        or "center" in label
        or "knowledge" in label
        or re.match(r"^(iit|nit|iiit|jnu|geu|du|bits)[\s_-]", raw, re.IGNORECASE) is not None
    )


def parse_admin_line(line: str) -> tuple[int, str, str, str, str]:
    parts = line.split("|")
    if len(parts) < 5:
        raise ValueError(f"Invalid admin line: {line}")
    legacy_id = int(parts[0])
    first = parts[1].strip()
    second = parts[2].strip()
    swapped = looks_like_library_label(first) and not looks_like_library_label(second)
    name = second if swapped else first
    library_label = first if swapped else second
    email = parts[3].strip()
    password = parts[4].strip()
    return legacy_id, name, library_label, email, password


def parse_date_parts(day: str, month: str, year: str) -> date:
    return date(int(year), int(month), int(day))


def date_to_timestamp(day_value: date) -> datetime:
    # Noon UTC avoids odd timezone conversions during import and reporting.
    return datetime.combine(day_value, time(hour=12, minute=0, tzinfo=timezone.utc))


def normalize_status(status: str) -> str:
    normalized = str(status or "").strip().lower()
    if normalized in {"pending", "approved", "rejected", "cancelled"}:
        return normalized
    return "pending"


def transitional_password_hash(plaintext: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        plaintext.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return "pbkdf2_sha256${iterations}${salt}${digest}".format(
        iterations=PASSWORD_HASH_ITERATIONS,
        salt=base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        digest=base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
    )


def uniquify_email(candidate: str, used: set[str], fallback_prefix: str, warnings: list[str]) -> str:
    email = candidate.strip()
    key = email.lower()
    if email and key not in used:
        used.add(key)
        return email
    replacement = f"{fallback_prefix}@{PLACEHOLDER_DOMAIN}"
    counter = 1
    while replacement.lower() in used:
        counter += 1
        replacement = f"{fallback_prefix}-{counter}@{PLACEHOLDER_DOMAIN}"
    if email:
        warnings.append(f"Duplicate or invalid email '{email}' replaced with '{replacement}'.")
    else:
        warnings.append(f"Missing email replaced with '{replacement}'.")
    used.add(replacement.lower())
    return replacement


def ensure_unique_code(base_label: str, used_codes: set[str]) -> str:
    base = slugify(base_label)
    code = base
    suffix = 2
    while code in used_codes:
        code = f"{base}-{suffix}"
        suffix += 1
    used_codes.add(code)
    return code


def load_legacy_data(data_dir: Path, warnings: list[str]) -> dict[str, Any]:
    user_lines = read_lines(data_dir / "user_login.txt")
    admin_lines = read_lines(data_dir / "admin_login.txt")
    book_lines = read_lines(data_dir / "data_book.txt")
    issue_request_lines = read_lines(data_dir / "issue_request.txt")
    issue_history_lines = read_lines(data_dir / "issue_history.txt")
    issue_book_lines = read_lines(data_dir / "issue_book.txt")
    slot_booking_lines = read_lines(data_dir / "slot_booking.txt")
    queue_lines = read_lines(data_dir / "queue_book.txt")

    books: list[BookRecord] = []
    for line in book_lines:
        parts = line.split("|")
        if len(parts) < 6:
            warnings.append(f"Skipping malformed book row: {line}")
            continue
        try:
            book = BookRecord(
                book_id=int(parts[0]),
                library_label=parts[1].strip(),
                title=parts[2].strip(),
                author=parts[3].strip(),
                total_copies=int(parts[4]),
                available_copies=int(parts[5]),
            )
        except ValueError:
            warnings.append(f"Skipping non-numeric book row: {line}")
            continue
        if not looks_like_library_label(book.library_label):
            warnings.append(
                f"Book {book.book_id} uses unusual library label '{book.library_label}'. It will be imported as its own library."
            )
        books.append(book)

    referenced_member_ids: set[int] = set()
    for line in issue_request_lines + issue_history_lines + issue_book_lines + slot_booking_lines + queue_lines:
        parts = line.split("|")
        if parts and parts[0].strip().isdigit():
            referenced_member_ids.add(int(parts[0]))

    used_emails: set[str] = set()
    members: list[MemberRecord] = []
    known_member_ids: set[int] = set()
    for line in user_lines:
        parts = line.split("|")
        if len(parts) < 4:
            warnings.append(f"Skipping malformed member row: {line}")
            continue
        user_id = int(parts[0])
        known_member_ids.add(user_id)
        members.append(
            MemberRecord(
                user_id=user_id,
                full_name=parts[1].strip() or f"Imported User {user_id}",
                email=uniquify_email(parts[2].strip(), used_emails, f"member-{user_id}", warnings),
                plaintext_password=parts[3].strip() or secrets.token_urlsafe(12),
                legacy_source="user_login",
                legacy_source_id=user_id,
            )
        )

    for missing_member_id in sorted(referenced_member_ids - known_member_ids):
        warnings.append(
            f"Legacy references mention member {missing_member_id}, but no row exists in user_login.txt. "
            "A placeholder member account will be created."
        )
        members.append(
            MemberRecord(
                user_id=missing_member_id,
                full_name=f"Imported User {missing_member_id}",
                email=uniquify_email("", used_emails, f"member-{missing_member_id}", warnings),
                plaintext_password=secrets.token_urlsafe(18),
                legacy_source="synthetic_member",
                legacy_source_id=missing_member_id,
                synthetic=True,
            )
        )

    next_user_id = max((member.user_id for member in members), default=0) + 1
    admins: list[AdminRecord] = []
    for line in admin_lines:
        legacy_id, name, library_label, email, password = parse_admin_line(line)
        admins.append(
            AdminRecord(
                user_id=next_user_id,
                full_name=name.strip() or f"Imported Admin {legacy_id}",
                email=uniquify_email(email, used_emails, f"admin-{legacy_id}", warnings),
                plaintext_password=password.strip() or secrets.token_urlsafe(18),
                legacy_source_id=legacy_id,
                managed_library_label=library_label.strip(),
            )
        )
        next_user_id += 1

    canonical_library_labels: list[str] = []
    for book in books:
        if book.library_label and book.library_label not in canonical_library_labels:
            canonical_library_labels.append(book.library_label)

    alias_to_canonical: dict[str, str] = {}
    for admin in admins:
        matched = next(
            (label for label in canonical_library_labels if libraries_match(admin.managed_library_label, label)),
            None,
        )
        canonical = matched or admin.managed_library_label
        alias_to_canonical[admin.managed_library_label] = canonical
        if canonical not in canonical_library_labels:
            canonical_library_labels.append(canonical)

    request_map: dict[tuple[int, int, datetime], BorrowRequestRecord] = {}
    status_priority = {"approved": 3, "rejected": 2, "cancelled": 1, "pending": 0}

    def absorb_request(record: BorrowRequestRecord) -> None:
        key = (record.member_id, record.book_id, record.requested_at)
        existing = request_map.get(key)
        if existing is None or status_priority[record.status] > status_priority[existing.status]:
            request_map[key] = record

    for line in issue_history_lines:
        parts = line.split("|")
        if len(parts) < 6:
            warnings.append(f"Skipping malformed issue_history row: {line}")
            continue
        request_date = parse_date_parts(parts[2], parts[3], parts[4])
        status = normalize_status(parts[5])
        reviewed_at = None if status == "pending" else date_to_timestamp(request_date)
        rejection_reason = "Imported from legacy data" if status == "rejected" else None
        absorb_request(
            BorrowRequestRecord(
                member_id=int(parts[0]),
                book_id=int(parts[1]),
                requested_at=date_to_timestamp(request_date),
                status=status,
                reviewed_at=reviewed_at,
                reviewed_by_user_id=None,
                rejection_reason=rejection_reason,
            )
        )

    for line in issue_request_lines:
        parts = line.split("|")
        if len(parts) < 5:
            warnings.append(f"Skipping malformed issue_request row: {line}")
            continue
        request_date = parse_date_parts(parts[2], parts[3], parts[4])
        absorb_request(
            BorrowRequestRecord(
                member_id=int(parts[0]),
                book_id=int(parts[1]),
                requested_at=date_to_timestamp(request_date),
                status="pending",
                reviewed_at=None,
                reviewed_by_user_id=None,
                rejection_reason=None,
            )
        )

    borrow_requests = sorted(request_map.values(), key=lambda item: (item.requested_at, item.member_id, item.book_id))
    pending_by_pair: dict[tuple[int, int], list[BorrowRequestRecord]] = defaultdict(list)
    for request in borrow_requests:
        if request.status == "pending":
            pending_by_pair[(request.member_id, request.book_id)].append(request)
    for pair, items in pending_by_pair.items():
        if len(items) <= 1:
            continue
        items.sort(key=lambda item: item.requested_at)
        for stale_item in items[:-1]:
            stale_item.status = "cancelled"
            stale_item.reviewed_at = stale_item.requested_at
            warnings.append(
                f"Multiple pending requests found for member {pair[0]} and book {pair[1]}; older request marked as cancelled."
            )

    loans: list[LoanRecord] = []
    for line in issue_book_lines:
        parts = line.split("|")
        if len(parts) < 8:
            warnings.append(f"Skipping malformed issue_book row: {line}")
            continue
        issue_date = parse_date_parts(parts[2], parts[3], parts[4])
        due_date = parse_date_parts(parts[5], parts[6], parts[7])
        loans.append(
            LoanRecord(
                member_id=int(parts[0]),
                book_id=int(parts[1]),
                issued_at=date_to_timestamp(issue_date),
                due_at=date_to_timestamp(due_date),
            )
        )

    slot_bookings: list[SlotBookingRecord] = []
    for line in slot_booking_lines:
        parts = line.split("|")
        if len(parts) < 6:
            warnings.append(f"Skipping malformed slot_booking row: {line}")
            continue
        slot_bookings.append(
            SlotBookingRecord(
                member_id=int(parts[0]),
                book_id=int(parts[1]),
                slot_date=parse_date_parts(parts[2], parts[3], parts[4]),
                slot_id=int(parts[5]),
            )
        )

    waitlists: list[WaitlistRecord] = []
    waitlist_positions: dict[int, int] = defaultdict(int)
    for line in queue_lines:
        parts = line.split("|")
        if len(parts) < 2:
            warnings.append(f"Skipping malformed queue row: {line}")
            continue
        member_id = int(parts[0])
        book_id = int(parts[1])
        waitlist_positions[book_id] += 1
        waitlists.append(
            WaitlistRecord(
                member_id=member_id,
                book_id=book_id,
                position=waitlist_positions[book_id],
            )
        )

    return {
        "books": books,
        "members": sorted(members, key=lambda item: item.user_id),
        "admins": admins,
        "canonical_library_labels": canonical_library_labels,
        "alias_to_canonical": alias_to_canonical,
        "borrow_requests": borrow_requests,
        "loans": loans,
        "slot_bookings": slot_bookings,
        "waitlists": waitlists,
    }


def table_has_data(cursor) -> bool:
    cursor.execute(
        """
        SELECT EXISTS (
            SELECT 1 FROM libraries
            UNION ALL SELECT 1 FROM users
            UNION ALL SELECT 1 FROM books
            UNION ALL SELECT 1 FROM borrow_requests
            UNION ALL SELECT 1 FROM book_loans
            UNION ALL SELECT 1 FROM slot_bookings
            UNION ALL SELECT 1 FROM waitlist_entries
            UNION ALL SELECT 1 FROM email_otps
        )
        """
    )
    return bool(cursor.fetchone()[0])


def reset_tables(cursor) -> None:
    cursor.execute(
        """
        TRUNCATE TABLE
            email_otps,
            waitlist_entries,
            slot_bookings,
            book_loans,
            borrow_requests,
            users,
            library_aliases,
            books,
            libraries
        RESTART IDENTITY CASCADE
        """
    )


def sync_identity(cursor, table: str, column: str) -> None:
    cursor.execute(
        f"""
        SELECT setval(
            pg_get_serial_sequence('{table}', '{column}'),
            COALESCE((SELECT MAX({column}) FROM {table}), 1),
            TRUE
        )
        """
    )


def insert_libraries(cursor, legacy: dict[str, Any]) -> tuple[dict[str, int], int]:
    label_to_library_id: dict[str, int] = {}
    used_codes: set[str] = set()
    library_count = 0
    for label in legacy["canonical_library_labels"]:
        code = ensure_unique_code(label, used_codes)
        cursor.execute(
            """
            INSERT INTO libraries (code, name)
            VALUES (%s, %s)
            RETURNING library_id
            """,
            (code, label),
        )
        label_to_library_id[label] = int(cursor.fetchone()[0])
        library_count += 1

    for alias_label, canonical_label in legacy["alias_to_canonical"].items():
        if alias_label.strip().lower() == canonical_label.strip().lower():
            continue
        cursor.execute(
            """
            INSERT INTO library_aliases (library_id, alias)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (label_to_library_id[canonical_label], alias_label),
        )
    return label_to_library_id, library_count


def insert_users(cursor, legacy: dict[str, Any], label_to_library_id: dict[str, int]) -> tuple[int, dict[tuple[str, int], int]]:
    now = datetime.now(timezone.utc)
    count = 0
    legacy_user_lookup: dict[tuple[str, int], int] = {}

    for member in legacy["members"]:
        cursor.execute(
            """
            INSERT INTO users (
                user_id, role, full_name, email, password_hash, legacy_source,
                legacy_source_id, email_verified_at, must_reset_password, is_active
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            """,
            (
                member.user_id,
                ROLE_MEMBER,
                member.full_name,
                member.email,
                transitional_password_hash(member.plaintext_password),
                member.legacy_source,
                member.legacy_source_id,
                now,
                True,
            ),
        )
        legacy_user_lookup[(member.legacy_source, member.legacy_source_id)] = member.user_id
        count += 1

    for admin in legacy["admins"]:
        managed_library_id = label_to_library_id.get(legacy["alias_to_canonical"].get(admin.managed_library_label, admin.managed_library_label))
        cursor.execute(
            """
            INSERT INTO users (
                user_id, role, full_name, email, password_hash, legacy_source,
                legacy_source_id, managed_library_id, email_verified_at,
                must_reset_password, is_active
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            """,
            (
                admin.user_id,
                ROLE_ADMIN,
                admin.full_name,
                admin.email,
                transitional_password_hash(admin.plaintext_password),
                "admin_login",
                admin.legacy_source_id,
                managed_library_id,
                now,
                True,
            ),
        )
        legacy_user_lookup[("admin_login", admin.legacy_source_id)] = admin.user_id
        count += 1

    return count, legacy_user_lookup


def insert_books(cursor, legacy: dict[str, Any], label_to_library_id: dict[str, int]) -> int:
    count = 0
    for book in legacy["books"]:
        cursor.execute(
            """
            INSERT INTO books (
                book_id, library_id, title, author, total_copies, available_copies
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                book.book_id,
                label_to_library_id[book.library_label],
                book.title,
                book.author,
                book.total_copies,
                book.available_copies,
            ),
        )
        count += 1
    return count


def insert_borrow_requests(cursor, legacy: dict[str, Any]) -> tuple[int, dict[tuple[int, int], list[int]]]:
    approved_request_ids: dict[tuple[int, int], list[int]] = defaultdict(list)
    count = 0
    for request in legacy["borrow_requests"]:
        cursor.execute(
            """
            INSERT INTO borrow_requests (
                member_id, book_id, requested_at, status, reviewed_at,
                reviewed_by_user_id, rejection_reason
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING borrow_request_id
            """,
            (
                request.member_id,
                request.book_id,
                request.requested_at,
                request.status,
                request.reviewed_at,
                request.reviewed_by_user_id,
                request.rejection_reason,
            ),
        )
        borrow_request_id = int(cursor.fetchone()[0])
        if request.status == "approved":
            approved_request_ids[(request.member_id, request.book_id)].append(borrow_request_id)
        count += 1
    return count, approved_request_ids


def insert_loans(cursor, legacy: dict[str, Any], approved_request_ids: dict[tuple[int, int], list[int]]) -> int:
    count = 0
    for loan in legacy["loans"]:
        linked_request_id = None
        candidates = approved_request_ids.get((loan.member_id, loan.book_id))
        if candidates:
            linked_request_id = candidates.pop(0)
        cursor.execute(
            """
            INSERT INTO book_loans (
                borrow_request_id, member_id, book_id, issued_at, due_at
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                linked_request_id,
                loan.member_id,
                loan.book_id,
                loan.issued_at,
                loan.due_at,
            ),
        )
        count += 1
    return count


def insert_slot_bookings(cursor, legacy: dict[str, Any]) -> int:
    count = 0
    for booking in legacy["slot_bookings"]:
        cursor.execute(
            """
            INSERT INTO slot_bookings (member_id, book_id, slot_id, slot_date, status)
            VALUES (%s, %s, %s, %s, 'active')
            """,
            (
                booking.member_id,
                booking.book_id,
                booking.slot_id,
                booking.slot_date,
            ),
        )
        count += 1
    return count


def insert_waitlist(cursor, legacy: dict[str, Any]) -> int:
    count = 0
    for entry in legacy["waitlists"]:
        cursor.execute(
            """
            INSERT INTO waitlist_entries (member_id, book_id, status, position)
            VALUES (%s, %s, 'waiting', %s)
            """,
            (
                entry.member_id,
                entry.book_id,
                entry.position,
            ),
        )
        count += 1
    return count


def main() -> None:
    args = parse_args()
    warnings: list[str] = []
    data_dir = args.data_dir.resolve()

    if not data_dir.exists():
        raise SystemExit(f"Data directory does not exist: {data_dir}")

    legacy = load_legacy_data(data_dir, warnings)
    conn = connect_to_db(args.dsn)
    try:
        with conn:
            with conn.cursor() as cursor:
                if args.reset:
                    reset_tables(cursor)
                elif table_has_data(cursor):
                    raise SystemExit(
                        "Target database already has Smart Library data. Re-run with --reset to replace it."
                    )

                label_to_library_id, library_count = insert_libraries(cursor, legacy)
                user_count, _legacy_user_lookup = insert_users(cursor, legacy, label_to_library_id)
                book_count = insert_books(cursor, legacy, label_to_library_id)
                borrow_request_count, approved_request_ids = insert_borrow_requests(cursor, legacy)
                loan_count = insert_loans(cursor, legacy, approved_request_ids)
                slot_booking_count = insert_slot_bookings(cursor, legacy)
                waitlist_count = insert_waitlist(cursor, legacy)

                sync_identity(cursor, "users", "user_id")
                sync_identity(cursor, "books", "book_id")

        print("Import completed successfully.")
        print(f"Libraries imported: {library_count}")
        print(f"Users imported: {user_count}")
        print(f"Books imported: {book_count}")
        print(f"Borrow requests imported: {borrow_request_count}")
        print(f"Loans imported: {loan_count}")
        print(f"Slot bookings imported: {slot_booking_count}")
        print(f"Waitlist entries imported: {waitlist_count}")
        if warnings:
            print("\nWarnings:")
            for warning in warnings:
                print(f"- {warning}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
