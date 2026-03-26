# Smart Library Database Design

This schema targets PostgreSQL and is designed to replace the current `.txt` files with transactional, multi-user storage.

## Why this design

The current project stores shared state in:

- `data_book.txt`
- `user_login.txt`
- `admin_login.txt`
- `issue_request.txt`
- `issue_history.txt`
- `issue_book.txt`
- `slot_booking.txt`
- `queue_book.txt`

That works for a demo, but it breaks down when many users act at the same time. The new schema keeps the same features while moving shared state into tables with keys, constraints, and indexes.

## Main tables

- `libraries`: canonical library records
- `library_aliases`: old names like `geu-lib` or `IIT-MUMBAI`
- `users`: both members and admins, separated by `role`
- `books`: library inventory
- `borrow_requests`: replaces both pending requests and request status history
- `book_loans`: active and returned issued books
- `visit_slots`: the 4 fixed time slots
- `slot_bookings`: library visit bookings
- `waitlist_entries`: queue/waitlist records
- `email_otps`: OTP verification and password reset codes

## Old file to new table mapping

- `data_book.txt` -> `books`
- `user_login.txt` -> `users` with `role = 'member'`
- `admin_login.txt` -> `users` with `role = 'admin'` and `managed_library_id`
- `issue_request.txt` -> `borrow_requests` with `status = 'pending'`
- `issue_history.txt` -> `borrow_requests` history rows with `pending/approved/rejected`
- `issue_book.txt` -> `book_loans`
- `slot_booking.txt` -> `slot_bookings`
- `queue_book.txt` -> `waitlist_entries`

## Important design choices

### 1. Users and admins are in one table

Your current app keeps users and admins separately. In a production backend, one `users` table is easier to secure and avoids duplicate email collisions.

To make migration easier, the schema also includes `legacy_source` and `legacy_source_id` so imported records can still be traced back to the original files.

### 2. Request history is no longer duplicated

The current project uses both `issue_request.txt` and `issue_history.txt`.

In the database:

- one row in `borrow_requests` represents one borrow attempt
- the `status` column shows whether it is pending, approved, rejected, or cancelled

That means you no longer need a separate request-history file.

### 3. Loans are separate from requests

A request can be rejected or approved. A loan exists only when a request is approved and a book is actually issued.

### 4. Queue support is kept

The current queue file is barely used in the frontend, but the schema keeps a proper `waitlist_entries` table so you can build it later without another migration.

## How to create the database

Example with `psql`:

```bash
createdb smart_library
psql -d smart_library -f db/schema.sql
```

## Import your current `.txt` data

After creating the schema, run:

```bash
python3 db/import_legacy_txt.py --dsn "$DATABASE_URL" --reset
```

Defaults:

- reads source files from the project root
- preserves existing member IDs when possible
- remaps admin IDs into new user IDs because `users` is now a single table
- creates placeholder member accounts if legacy files reference missing users
- forces imported accounts to reset their passwords later

## Backend rules that still need transactions

Schema alone is not enough. The API must also use transactions for the critical flows.

### Approve a borrow request

Do this in one transaction:

1. lock the `books` row with `FOR UPDATE`
2. confirm `available_copies > 0`
3. mark the request as approved
4. insert the loan row
5. decrement `available_copies`

### Create a slot booking

Do this in one transaction:

1. lock the `books` row
2. count active bookings for `(book_id, slot_date, slot_id)`
3. compare the count against `available_copies`
4. insert the slot booking only if capacity remains

## Notes for migration

- The importer stores transitional PBKDF2 hashes and marks imported accounts with `must_reset_password = true`.
- For long-term production auth, move to bcrypt or Argon2 in your real login backend.
- When migrating from the current files, do not keep the old plaintext passwords anywhere after import.
- If you want, the next step can be a migration script plus backend API models for this schema.
