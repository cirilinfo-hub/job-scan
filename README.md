# Rolewise

A job search and career management platform: compare a resume with a job, improve it, find and track jobs, write cover letters, review a LinkedIn profile, and practise interviews.

**Stack:** Angular 21 and Angular Material, Node.js and Express 5 in TypeScript, MySQL 8.

"Rolewise" is a working name, set in `frontend/src/app/core/brand.ts`. Check trademark availability before launch.

## What works without any paid service

| Feature | Without an AI key | With an AI key |
|---|---|---|
| Resume upload, parsing, versions, builder, PDF and DOCX | Yes | Same |
| Resume scanner and match report | Yes, rule-based | Adds keyword ideas |
| Optimizer | Rule-based suggestions | Adds AI suggestions |
| Job search and matching | Needs a synced job source; scoring is rule-based | Adds AI fit explanations |
| Tracker, reminders, dashboard, admin | Yes | Same |
| Cover letters | Fill-in template, labelled as one | AI drafts |
| LinkedIn | Rule-based checklist | Adds AI suggestions |
| Interview prep | Question bank and structure checks | Adds generated questions and feedback |

Without a provider, AI endpoints return `AI_UNAVAILABLE`. They never return placeholder content.

## Run it locally

You need Node.js 20.19 or newer, and MySQL 8.

```bash
npm run setup
cp backend/.env.example backend/.env    # then set DB_*, JWT_SECRET and SEED_ADMIN_*
npm run migrate --prefix backend
npm run seed --prefix backend           # roles, skills, plans, question bank, first admin
npm run seed:demo --prefix backend      # optional: 6 invented jobs, badged "Demo listing"
```

Then run these in two terminals:

```bash
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:4200
```

On Windows, if you'd rather not use your main MySQL server, `scripts/dev-mysql.ps1` starts a private instance on port 3307 with its data in `.dev/`. Set `DB_PORT=3307`, `DB_USER=root` and an empty `DB_PASSWORD`. This instance has no root password, so use it for local development only.

To get real listings, sign in as the admin, open **Admin > Job sources**, and select **Sync now**. Read each provider's terms first.

Without SMTP, verification and reset links are written to the API log during development.

## Optional services

| Setting | Effect |
|---|---|
| `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | Claude. Defaults to `claude-opus-5-5`; override with `AI_MODEL` |
| `AI_PROVIDER=openai-compatible`, `AI_MODEL`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY` | Any service with a `/chat/completions` API, including a local one |
| `AI_COST_INPUT_PER_MTOK`, `AI_COST_OUTPUT_PER_MTOK` | Turns on the cost estimates in the admin portal |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` | Adzuna job listings |
| `SMTP_*` | Sends email. Required in production for password resets and email verification |

## Tests

```bash
npm test --prefix backend                      # needs MySQL; rebuilds a separate rolewise_test database
npm test --prefix frontend -- --watch=false
```

Browser tests are in `e2e/`; see [docs/05-testing.md](docs/05-testing.md).

## Documentation

- [UI/UX specification](docs/01-uiux-specification.md)
- [Architecture and ER diagram](docs/02-architecture.md)
- [REST API](docs/03-api.md), plus live Swagger at `/api/v1/docs`
- [Hostinger deployment](docs/04-deployment-hostinger.md)
- [Testing](docs/05-testing.md)
- [Security and operations](docs/06-security-operations.md)

## Project layout

```
backend/    Express API: routes > controllers > services > repositories; migrations/ holds the SQL
frontend/   Angular app: core/, shared/, layouts/, features/
e2e/        Playwright browser tests
deploy/     PM2, nginx and static-hosting configuration
scripts/    Dev database, release packaging, backups
docs/       Specification, architecture, API, deployment, testing, operations
```
