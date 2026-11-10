# Testing

| Suite | Command | Covers |
|---|---|---|
| Backend unit and API | `npm test --prefix backend` | Scoring, parsing, matching, optimizer rules; auth, uploads, ownership, tracker, AI integrity, admin permissions |
| Frontend unit | `npm test --prefix frontend -- --watch=false` | Token handling, guards, API client, highlighting, shared components |
| Browser | See below | Full journeys in Chrome, three screen sizes, console errors |

## Backend

API tests run against real MySQL, in a database named `rolewise_test` that's dropped and rebuilt each run. The setup refuses any database whose name doesn't end in `_test`.

The AI tests use a test double, injected through `setAiProviderForTests`, to check validation, retries, usage logging and the approval flow. **They don't call a real provider, and they say nothing about the quality of real AI output.**

## Browser

The tests use your installed Chrome, and expect the built app on one origin. Create a separate database first:

```bash
npm run build
cd backend
# Use a separate database, and NODE_ENV=test to relax rate limits during the run
export DB_NAME=rolewise_e2e NODE_ENV=test STORAGE_DIR=./.e2e-storage SERVE_FRONTEND=true PORT=4100 \
       APP_URL=http://localhost:4100 CORS_ORIGINS=http://localhost:4100 SCHEDULER_ENABLED=false
node --env-file=.env dist/db/migrate.js
node --env-file=.env dist/db/seed.js
npx tsx --env-file=.env src/db/seed-demo.ts
node --env-file=.env dist/server.js
```

Then, in another terminal:

```bash
cd e2e
npm install
E2E_BASE_URL=http://localhost:4100 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npx playwright test
```

The tests need `tests/fixtures/resume.pdf`, a simple resume whose name is Ana Silva and email is ana@example.com. Add `E2E_SHOTS=<folder>` to save screenshots of each screen.

Each journey fails on a browser console error, an uncaught exception, or a 5xx response. The responsive tests check every workspace route at 375, 820 and 1440 px for sideways scrolling.

## Before each release

Automated tests don't cover these, so check them by hand:

- Real AI provider: each AI feature, including output quality and whether invented claims appear
- Real email delivery
- Resumes from your target users. Parsing is heuristic, so try multi-column PDFs and unusual headings
- Screen reader and keyboard pass on the main journeys
- Safari and Firefox (the browser tests run in Chrome only)
