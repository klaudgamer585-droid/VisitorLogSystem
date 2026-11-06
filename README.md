# VisitorLog

VisitorLog is a responsive visitor-management web application with a check-in kiosk and security desk for use on a single trusted kiosk device. It uses React, Vite, Express, and MariaDB.

## Features

- Visitor check-in, returning-visitor lookup, gate pass, and check-out
- Security desk with live headcount, individual check-out, and emergency-roster CSV export; no sign-in is required on the trusted kiosk
- Persistent visitor profiles and visit history in MariaDB
- Keyboard-friendly controls, visible focus states, and reduced-motion support
- Production mode serves the built web application and API from one Express process

## Local setup

1. Install Node.js 20 or newer and start a local MariaDB service.
2. Install dependencies:

   ```sh
   npm ci
   ```

3. Configure the database and application account:

   ```sh
   npm run db:setup
   ```

   By default, setup connects to local MariaDB as `root` with no password, creates the `visitorlog` database and a restricted `visitorlog_app` user, seeds the initial sample data once, and writes database settings to `.env`.
4. Start the API and development server:

   ```sh
   npm start
   ```

5. Open <http://127.0.0.1:4173/>. Use **Security desk** in the top navigation to switch between check-in and the dashboard.

To connect to a MariaDB instance with different settings, set `MARIADB_ADMIN_USER`, `MARIADB_ADMIN_PASSWORD`, and optionally `MARIADB_ADMIN_HOST` before database setup, or edit the corresponding application settings in `.env`.

## Production

1. Provide `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_DATABASE`, `MARIADB_USER`, and `MARIADB_PASSWORD` through a deployment secret store. The runtime database account needs only `SELECT`, `INSERT`, and `UPDATE` access.
2. Set `NODE_ENV=production` and run:

   ```sh
   npm ci
   npm run start:production
   ```

   This builds the frontend and starts Express, which serves both the static app and `/api` endpoints.
3. Keep the service bound to `127.0.0.1` or an isolated, trusted facility network. **There is no sign-in or authorization:** anyone who can reach the app or API can view visitor records, check visitors in and out, and download the roster. Do not expose it directly to the public internet. If remote access is needed, put it behind an appropriately protected private network or access-controlled gateway.

Run VisitorLog only on the dedicated kiosk device or a network limited to trusted facility staff. Visitor profile lookup is designed for use by people at the kiosk, so the app does not require user credentials.

## Sharing the project

Share the project source as a ZIP or upload the source files to a GitHub repository. Include `package.json`, `package-lock.json`, `.env.example`, `README.md`, `index.html`, the Vite/Tailwind/PostCSS configuration files, and the `src/` and `server/` folders. Exclude `.env`, `node_modules/`, `dist/`, database backups, and local `.github/modernize/` workflow artifacts. The root `.gitignore` excludes these local or generated files.

Recipients need their own Node.js installation and MariaDB database. They should extract or clone the source, follow **Local setup**, and create their own `.env` by running `npm run db:setup`; do not share a populated `.env` or real visitor database export. The first-time database setup uses sample visitors, so recipients can try the app without receiving your visitor records.

This project does not currently include an open-source license. Add a license before granting others permission to reuse, modify, or redistribute the code.

## Verification

```sh
npm test
npm run build
```

`npm run db:setup` is safe to rerun for an existing database; it adds sample profiles but does not reseed visit history after the initial setup.
