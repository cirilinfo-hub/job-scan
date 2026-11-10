# REST API

- **Base path:** `/api/v1`
- **Interactive docs:** `/api/v1/docs` (Swagger UI) and `/api/v1/openapi.json`
- **Health check:** `/api/health`

## Conventions

```jsonc
// Success
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
// Failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Some fields need attention.", "details": [{ "path": "email", "message": "..." }] } }
```

**Authentication:** send `Authorization: Bearer <accessToken>`. The token lasts 15 minutes. `POST /auth/refresh` issues a new one from the `HttpOnly` cookie, and requires the header `X-Requested-With: rolewise`.

**Lists:** `page` and `pageSize` where supported, with filtering and sorting parameters per endpoint.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | The request can't be processed, for example a claim that wasn't confirmed |
| 400 | `SOURCE_NOT_CONFIGURED` | The job source needs server settings |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `NO_SESSION`, `INVALID_CREDENTIALS` | Sign-in problem |
| 403 | `FORBIDDEN`, `FEATURE_DISABLED`, `ACCOUNT_SUSPENDED` | Not allowed |
| 404 | `NOT_FOUND` | Missing, or belongs to someone else |
| 409 | `CONFLICT` | For example, an email already registered |
| 413 | `FILE_TOO_LARGE` | Upload is over the limit |
| 422 | `VALIDATION_ERROR`, `UNREADABLE_FILE` | Invalid input or a damaged file |
| 423 | `ACCOUNT_LOCKED` | Too many failed sign-ins |
| 429 | `RATE_LIMITED`, `LIMIT_REACHED` | Too many requests, or a plan limit |
| 502 | `AI_BAD_OUTPUT`, `SOURCE_SYNC_FAILED` | An outside service returned something unusable |
| 503 | `AI_UNAVAILABLE` | No AI provider, AI turned off, or provider unreachable |

## Endpoints

| Area | Base | Main operations |
|---|---|---|
| Config | `/config` | Public feature flags, announcement, support email |
| Auth | `/auth` | `register`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `verify-email`, `resend-verification` |
| Users | `/users` | `me`, `me/password`, `me/profile`, `me/profile-completion`, `me/sessions`, `skills` |
| Dashboard | `/dashboard` | Everything on the dashboard. Query: `days`, or `from` and `to` |
| Resumes | `/resumes` | List, upload, read, update, delete, `default`, `download`, `versions`, `versions/:id/restore` |
| Scanner | `/resume-scanner` | Run, history, report, `excluded-terms`, `rescan`, `rules`, `ai-status`, `ai-keywords` |
| Optimizer | `/resume-optimizer` | `resumes/:id`, `ai-suggestions`, `suggestions/:id/decision`, `rescore`, `save` |
| Builder | `/resume-builder` | `templates`, create, `render` |
| Jobs | `/jobs` | Search, detail, save, unsave |
| Matching | `/job-matching` | Ranked matches, `refresh`, `:id/ai-explain` |
| Tracker | `/job-tracker` | Board, create, `from-job`, update, `move`, `notes`, `interviews` |
| Cover letters | `/cover-letters` | Create, `regenerate`, `versions`, `export` |
| LinkedIn | `/linkedin` | Save, `analyze`, `ai-suggestions` |
| Interviews | `/interviews` | `guide`, `questions`, `questions/generate`, `sessions`, answers, `ai-feedback`, `complete` |
| Notifications | `/notifications` | List, `unread-count`, `read-all`, read, delete |
| Admin | `/admin` | `overview`, `users`, `roles`, `job-sources`, `job-categories`, `skills`, `plans`, `features`, `scoring-rules`, `ai`, `logs`, `settings` |

Admin routes need the admin role. Changing plans, features, scoring rules, AI settings and app settings needs super admin.
