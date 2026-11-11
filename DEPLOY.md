# Deploy (GitHub -> Render + Turso), all free

1. **Turso (database):** sign up at turso.tech -> Create database (any name) -> copy the
   *Database URL* (libsql://...) and create a *token* (Generate token). Keep both.
2. **GitHub:** create a PRIVATE repo, upload all files from this folder (never upload `.env`).
3. **Render:** sign up at render.com with GitHub -> New -> Blueprint -> pick the repo.
   Fill in: ADMIN_PASSWORD (username is set to `tanvir` in render.yaml), BKASH_NUMBER, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN -> Apply.
4. Open the URL Render gives you (e.g. https://wedding-manager.onrender.com).
   Admin panel: /admin

Free Render servers sleep after ~15 min idle; the first visit after that takes ~30-60 s.
Every `git push` to the repo redeploys automatically.
