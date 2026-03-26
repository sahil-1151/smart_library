# Smart Library Deployment Guide

## What you can deploy today

The frontend (`index.html`, `styles.css`, `app.js`) is a static site and can be hosted on a CDN-backed platform such as Cloudflare Pages, Netlify, or Vercel.

The current backend is split into:

- `backend_server.py`: serves the app and saves `.txt` datasets
- `email_server.py`: sends OTP and contact emails

This setup is suitable for demos, classroom submissions, and low-traffic internal use.

## Important production limit

The current app does **not** safely support thousands of real users because:

- all application state is loaded into each browser's `localStorage`
- each save writes full dataset snapshots back to the server
- concurrent users can overwrite each other's changes
- OTPs are stored only in memory inside `email_server.py`
- `.txt` files are not a safe multi-user database

If you expect real public traffic, treat the current deployment as a demo release, not a production architecture.

## Fastest way to go live

### Option A: Single-domain deployment

Deploy `backend_server.py` on a VPS or Python web host and let it serve the frontend files directly.

Recommended environment variables:

```bash
PORT=8080
SMART_LIBRARY_DATA_DIR=/var/smart-library-data
SMART_LIBRARY_CORS_ORIGIN=https://your-domain.com
SMART_LIBRARY_TOKEN=replace-with-a-random-secret
```

Start command:

```bash
python3 backend_server.py
```

Run `email_server.py` as a second service:

```bash
PORT=8081
SMART_LIBRARY_CORS_ORIGIN=https://your-domain.com
SMART_LIBRARY_SENDER_EMAIL=your-email@gmail.com
SMART_LIBRARY_APP_PASSWORD=your-gmail-app-password
SMART_LIBRARY_SUPPORT_EMAIL=your-email@gmail.com
python3 email_server.py
```

If the frontend is served by the same domain as `backend_server.py`, leave `config.js` values blank.

### Option B: Static frontend + separate backend

1. Deploy the frontend to Cloudflare Pages, Netlify, or Vercel.
2. Deploy `backend_server.py` to a Python host with persistent storage.
3. Deploy `email_server.py` to a second Python service.
4. Edit `config.js`:

```js
window.SMART_LIBRARY_CONFIG = {
  apiBaseUrl: 'https://your-api-domain.com',
  emailBaseUrl: 'https://your-email-domain.com',
  saveToken: 'same-value-as-SMART_LIBRARY_TOKEN'
};
```

## Recommended hosting shape

For the current codebase:

- frontend: Cloudflare Pages or Netlify
- backend API: Render, Railway, Fly.io, or a VPS with persistent disk
- email API: Render, Railway, Fly.io, or the same VPS

Use a persistent directory for `SMART_LIBRARY_DATA_DIR` so `.txt` files survive restarts.

## What must change for thousands of users

Before you rely on this app for large public traffic, move to:

- PostgreSQL instead of `.txt` files
- server-side APIs for books, users, requests, and bookings
- real authentication instead of client-side state
- Redis or database-backed OTP/session storage
- transactional writes instead of full-file overwrites
- a proper email provider such as Resend, SendGrid, AWS SES, or Postmark

## Immediate safety step

If the old Gmail app password was ever committed or shared, rotate it before deploying anything public.
