# Skully Visitor Sign-In System

A touch-screen visitor kiosk for school offices, with administrator settings, teacher management, sign-in logs, SQLite storage, session authentication, and optional email notifications.

## Folder structure

```text
.
├── src/                  React kiosk interface
├── server/               Express API, session, database, and email integration
├── database/schema.sql   Portable SQLite schema
├── database/seed.sql     Default application settings
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── vite.config.ts
```

## Install and run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000`.

On the first launch, press `Esc`, then create an administrator password of at least 8 characters. The kiosk starts locked. Use `Esc` from the sign-in screen to unlock it.

In `Settings`, use **Teachers and visit reasons** before accepting public sign-ins. The management popup allows administrators to add, edit, remove, and reorder teachers and visit reasons. Configure SMTP for automatic notifications, or leave SMTP values empty to record email status as `not_sent`.

Settings, unlock, reset, and management popups can be closed with their close button or by clicking outside the popup.

## Production build

```bash
npm run build
npm start
```

Open `http://localhost:3000`. Set a strong `SESSION_SECRET`, configure `DATABASE_PATH`, and serve the site behind HTTPS. The Express process stores administrator sessions in SQLite.

## Deploy with GitHub Pages

GitHub Pages cannot run the Express API or SQLite database. For the complete working kiosk, host the Express server on a Node.js provider and use GitHub Pages for the React frontend.

The included `.github/workflows/deploy-pages.yml` workflow deploys the frontend automatically whenever `main` is updated.

1. Deploy the Express server to a Node.js host such as Render, Railway, or Fly.io with a persistent writable disk for SQLite.
2. Enable HTTPS and CORS for the Pages origin on the Express host. Set `SECURE_COOKIES=true` and `ALLOWED_ORIGINS=https://your-account.github.io` to the exact Pages origin.
3. In the GitHub repository, open **Settings → Pages** and select **GitHub Actions**.
4. Open **Settings → Secrets and variables → Actions → Variables** and add:
   - Variable name: `SKULLY_API_URL`
   - Value: the full HTTPS URL of the deployed Express server, for example `https://skully-api.example.com`
5. Push the code to `main`. The workflow builds the frontend with the project repository base path and deploys it to GitHub Pages.
6. Use the Pages URL shown by the deployment workflow or under **Settings → Pages**.

The GitHub Pages frontend is not functional without a running backend configured through `SKULLY_API_URL`. GitHub does not provide a persistent server, SQLite storage, or session support for Pages sites.

For a completely self-contained GitHub Pages deployment, Express, SQLite, login sessions, and email delivery would need to be replaced by browser-compatible services, which is not supported by GitHub Pages.

If this repository is deployed as `owner.github.io`, change the workflow base path from `"/${{ github.event.repository.name }}/"` to `"/"`.

## Docker deployment

```bash
SESSION_SECRET="$(openssl rand -hex 32)" docker compose up --build -d
```

The application is available at `http://localhost:3000`. Database data persists in the `scopely-data` Docker volume.

## Environment variables

Copy `.env.example` to `.env`. `SESSION_SECRET` is required for every production deployment. `DATABASE_PATH` should point to a writable location. SMTP settings are optional; when notification email and SMTP host are set, each sign-in is emailed and its delivery status is recorded in the log.

## Database

The server creates and migrates its SQLite database automatically. The schema and seed SQL are also provided in `database/schema.sql` and `database/seed.sql` for inspection or manual installation.

## Security

- Passwords use bcrypt with cost 12.
- Administrator routes require an authenticated server-side session.
- HTTP cookies are HTTP-only, SameSite strict, and secure in production.
- Helmet security headers and JSON size limits are enabled.
- All user-controlled values are validated by Zod.
- The SQLite database and Docker volume should receive regular backups.
