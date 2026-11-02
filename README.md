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

## Deploy the frontend with GitHub Pages Actions

GitHub Pages can publish the React interface, but it cannot run the Express API, SQLite database, administrator sessions, or email delivery. The published static page is therefore a frontend preview; backend features require a Node.js host for the Express server and a persistent database.

1. Push the project to the repository's `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions**.
4. Add `.github/workflows/deploy-pages.yml` with this workflow:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build -- --base=/${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

Commit and push the workflow. Open the repository's **Actions** tab, wait for **Deploy to GitHub Pages** to finish, then use the published URL shown there or under **Settings → Pages**.

If the repository is configured for a username-level `owner.github.io` site instead of a project site, change the build command to:

```bash
npm run build -- --base=/
```

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
