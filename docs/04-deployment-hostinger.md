# Deploying to Hostinger

This guide uses Hostinger's support articles as read in November 2026. Plans and panels change, so confirm the items marked **Verify** on your own account. The application hasn't been deployed to Hostinger yet; these steps have not been run there.

## 1. Choose a plan

Not every Hostinger plan runs Node.js.

| Plan | Runs this app? | Notes |
|---|---|---|
| Single or Premium web hosting | **No** | No managed Node.js apps; upgrade first |
| Agency | **No** | Static front ends only |
| Business web hosting, Cloud | Yes | Managed Node.js web app (Node 18, 20, 22 or 24). **Use 22 or 24** |
| VPS | Yes | Full control and the most reliable background jobs; you manage the server |

**Verify before buying:**

1. **MySQL access.** Hostinger's Database Connect Wizard covers only Supabase and MongoDB Atlas, and the Node.js articles don't say how a web app reaches a hPanel MySQL database. Ask support to confirm that a Node.js web app can connect to it, and which host name to use.
2. **Persistent storage.** Files in `public_html` and `hbuilds/` are **overwritten on every deployment**. Resumes must be stored elsewhere. Confirm with support that a directory outside those two survives redeployments, and that the app can write to it.
3. **Always-on process.** Reminders and job sync run on timers inside the app. If a managed app sleeps when idle, those timers pause. Reminders still catch up when a user is active, but scheduled job sync won't run.

If support can't confirm item 1 or 2, use a **VPS**.

## 2. Prepare

Generate a secret, and keep it out of Git:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Environment variables:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Use what the host provides, if it sets one |
| `APP_URL` | `https://yourdomain.com` |
| `CORS_ORIGINS` | `https://yourdomain.com` |
| `TRUST_PROXY` | `1` (behind Hostinger's proxy, so rate limits see real visitor addresses) |
| `SERVE_FRONTEND` | `true` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | From hPanel > Databases |
| `JWT_SECRET` | The generated secret |
| `STORAGE_DIR` | Absolute path outside `public_html` and `hbuilds/` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | A mailbox. **Without this, users can't reset passwords or verify email** |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | First admin. Remove both after seeding |

Add the AI and Adzuna settings from the README if you use them.

## 3. Domain, DNS and SSL

1. Node.js sites must be created as a **new website**. An existing WordPress or PHP site can't be converted, and removing a site deletes it permanently, so back it up first.
2. If the domain is registered elsewhere, point its nameservers to Hostinger, or add the A record hPanel shows. If you use email on the domain, check that MX records stay unchanged.
3. Create subdomains, such as `app.yourdomain.com`, as their own websites rather than subfolders.
4. Turn on SSL in hPanel for the domain, and confirm `https://yourdomain.com` loads. **Verify** the exact steps in hPanel, because the deployment article doesn't cover SSL.

The refresh cookie is marked `Secure`, so sign-in won't work in production over plain HTTP.

## 4. Create the database

1. In hPanel, go to **Databases** and create a MySQL database and user. Record the details.
2. **Verify** in phpMyAdmin that the version is MySQL 8 (`SELECT VERSION();`). The schema also relies on JSON columns and `FULLTEXT` indexes.

The migration runner tolerates hosts that forbid `CREATE DATABASE`.

## 5. Deploy on Business or Cloud

### Option A: GitHub

1. Push this repository to GitHub, then in hPanel go to **Websites > Create site > Web App > Import Git Repository**.
2. Choose the repository and branch, and enter these settings. Hostinger may not detect them correctly, because this is a monorepo; choose **Other** if needed.

| Setting | Value |
|---|---|
| Node.js version | 22.x or 24.x |
| Build command | `npm run build` |
| Output directory | `backend/dist` |
| Entry file | `backend/dist/server.js` |

3. Add the environment variables, then deploy.

### Option B: Zip upload

Use this if the host's build fails or runs out of memory. On your own computer:

```bash
bash scripts/package-release.sh
```

Then go to **Websites > Create site > Web App > Upload your website files** and upload `release/rolewise-<version>.zip`. Set the entry file to `backend/dist/server.js`, with no build step.

## 6. Run migrations and seed

Hostinger's managed plans don't run npm commands over SSH, so this is the easiest route: run them from your own computer against the production database, if hPanel's **Remote MySQL** allows your IP address.

```bash
cd backend
npm run build
# production values in a temporary file, kept out of Git
node --env-file=.env.production dist/db/migrate.js
node --env-file=.env.production dist/db/seed.js
```

Delete the file, and remove your IP from Remote MySQL, once you're done. **Verify** that Remote MySQL is available on your plan. If it isn't, import `backend/migrations/*.sql` in order through phpMyAdmin, then ask for help seeding, or use a VPS.

Never run `seed:demo` in production. It refuses to run there.

## 7. Verify production

- [ ] `https://yourdomain.com/api/health` shows `"database":"ok"`
- [ ] The site loads, and refreshing on `/jobs` doesn't return a 404
- [ ] You can register, sign out, sign in, and reload while staying signed in
- [ ] Verification and password-reset emails arrive
- [ ] Upload a resume, run a scan, and download a PDF
- [ ] **Redeploy, then confirm the uploaded resume can still be downloaded**
- [ ] Admin portal: sign in, sync one job source, check the AI page's real status
- [ ] Remove `SEED_ADMIN_*` from the environment
- [ ] The browser console shows no errors

## 8. VPS route

1. Create an Ubuntu LTS VPS. Install Node.js 22 or 24, MySQL 8, nginx and PM2.
2. Create the database and user. Put settings in `backend/.env`, set `TRUST_PROXY=1`, and use a storage folder such as `/var/lib/rolewise/storage` with `chmod 700`.
3. Build and start:

```bash
npm run build
npm run migrate && npm run seed
pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup
```

4. Copy `deploy/nginx.conf` to nginx with your domain, and add a certificate with `certbot --nginx`.
5. Keep MySQL bound to localhost, and allow only ports 22, 80 and 443 through the firewall.

## 9. Split front end and API (optional)

Use this only if the API runs on another host. A same-site subdomain such as `api.yourdomain.com` works; a different registrable domain won't, because the refresh cookie is `SameSite=Strict`.

1. Set `apiUrl` in `frontend/src/environments/environment.prod.ts` to the full API URL, then build.
2. Upload `frontend/dist/frontend/browser/` with `deploy/spa.htaccess` renamed to `.htaccess`.
3. On the API, set `SERVE_FRONTEND=false`, and add the site's origin to `CORS_ORIGINS`.

## 10. Backups

- **Database and files:** run `scripts/backup-db.sh` daily where cron and `mysqldump` are available. Copy the results off the server.
- **hPanel backups:** check what your plan includes, and whether it covers your storage folder.
- **Test a restore** before launch and at least quarterly. An untested backup can't be relied on.

## 11. Rollback

1. **Back up the database first.**
2. Redeploy the previous Git commit or the previous release zip, using the panel's deployment history where available.
3. Migrations only run forward. If a release changed the schema incompatibly, restore the backup taken before it, and accept the loss of data written since.
4. Check everything in section 7 again.

Don't use the panel's site removal as a stop button: it deletes all deployments and can't be undone. For planned downtime, deploy a maintenance page instead.
