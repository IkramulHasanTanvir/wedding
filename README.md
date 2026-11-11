# Friends Wedding Manager

Private site for collecting friends' Panjabi sizes and tracking payments (bKash / cash).
Node.js + Express + SQLite (local file) / Turso (production). No payment gateway. Admin confirms every payment manually.

## Run

```bash
npm install
cp .env.example .env     # then edit .env (admin password, bKash number)
npm start                # http://localhost:3000
```

Requires Node 18+. The database is created automatically at `data/wedding.db`.

## Pages

| URL       | Who    | What                                                     |
|-----------|--------|----------------------------------------------------------|
| `/`       | Friends | Register (name, Panjabi size, mobile, bKash or cash)     |
| `/status` | Friends | Check status by mobile number or unique ID (`FW-XXXXX`)  |
| `/admin`  | Admin  | Password login, table, mark paid, edit, delete, totals   |

## Settings (`.env`)

- `ADMIN_USERNAME` (default `admin`) and `ADMIN_PASSWORD` (required, 8+ chars) – the admin login; the server refuses to start without a password
- `BKASH_NUMBER`, `BKASH_ACCOUNT_NAME` – shown on the bKash panel with a Copy button
- `CASH_RECEIVER` – name in the cash checkbox (default: Tanvir Hridoy)
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` – permanent hosted database (required on Render; leave empty locally)
- `EVENT_TITLE`, `PORT`, `DB_PATH`

## Notes

- Duplicates are blocked by a unique mobile number (also enforced in the database).
- The status page re-checks every 10 s, so admin changes show up without a reload.
- Admin session is an HttpOnly, SameSite=Strict signed cookie (12 h). Login is rate-limited.
- Behind HTTPS (Nginx, Caddy, Render, etc.) the cookie automatically becomes `Secure`.
- Locally, back up by copying `data/wedding.db`. On Turso, use its dashboard.
- Deploy: push to GitHub → Render "New Blueprint" (uses `render.yaml`). See DEPLOY.md.
