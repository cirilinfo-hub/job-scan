# Security and operations

## Controls in place

| Area | Control |
|---|---|
| Passwords | bcrypt, cost 12. Lockout after 5 failed attempts. Same response for unknown emails and wrong passwords |
| Sessions | 15-minute JWT held in memory. Rotating refresh token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, stored as a hash. Replay revokes the whole session family |
| Authorization | Roles and status re-read on every request. Every user-data query filters by owner, and someone else's item returns 404 |
| CSRF | `SameSite=Strict` plus a required custom header on cookie-authenticated routes |
| XSS | Angular escaping. User text is never rendered as HTML. CSP from Helmet, with no inline scripts in the app. Third-party links limited to http(s) |
| SQL injection | Parameterised queries. Sort columns restricted to fixed lists by schema |
| Uploads | Extension and file-signature checks, 5 MB limit, random names, private storage, ownership-checked download, `nosniff`, `no-store` |
| Rate limits | General, auth, upload and AI limits per IP. Monthly plan limits per user |
| AI | Keys only in server environment variables. User content wrapped as data in prompts. Output schema-validated. Nothing saved without acceptance |
| Audit | Admin actions logged with actor, target and IP |
| Logging | Structured logs with auth headers, cookies and passwords redacted. Request logs omit query strings |

## Known limits

Decide on these before launch:

- **Files aren't encrypted at rest.** Resumes and their text are protected by file permissions and database access, not by encryption. Use encrypted volumes where you can.
- **No malware scanning on uploads.** Files are never executed or served inline, but a user could download a harmful file they uploaded themselves. Add a scanner if files will be shared.
- **Rate limits live in memory.** They reset on restart, and each app instance counts separately. This suits one instance; use a shared store if you scale out.
- **Scheduled tasks live in the app process.** Reminders and job sync pause if the host idles the app.
- **Swagger UI is public.** It reveals the API's shape, not data. Block `/api/v1/docs` at the proxy if you prefer.
- **No payment provider.** Plans are assigned by hand, and nothing charges users. Stripe or similar isn't integrated.
- **Email verification isn't enforced.** Unverified accounts can use the app. Enforcement is a product decision.

## Personal data

Resumes contain personal data. Before launch, publish a privacy policy and terms; these aren't included. Decide the following with legal advice for your markets (such as GDPR or India's DPDP Act):

- Lawful basis and consent wording
- Sending resume text to an AI provider. When AI is on, resume text goes to that provider, so disclose this and check the provider's data terms
- Data export. Account deletion exists, but a self-service export doesn't

## Retention

The daily task permanently removes the following:

| Data | When | Setting |
|---|---|---|
| Deleted resumes and their files, applications, cover letters and accounts | 30 days after deletion | `RETENTION_DAYS_DELETED` |
| Usage logs, audit logs and read notifications | After 180 days | `RETENTION_DAYS_LOGS` |
| Expired sessions and one-time tokens | 7 days after expiry | Fixed |

Backups keep data beyond these periods until they rotate out, so include that in your privacy policy.

## Job data terms

Sources are off until an admin enables them. Each has its own rules, so read the current terms first:

- **Remotive:** requires naming and linking back to Remotive. Listings are delayed 24 hours, and may not be passed on to other sites such as Google Jobs or LinkedIn.
- **Adzuna:** needs your own keys and requires attribution. Check whether your use, particularly a paid product, needs a commercial agreement.
- **Arbeitnow:** we found a public API, but no official terms. Confirm its terms before commercial use.

## Operating it

- **Health:** monitor `/api/health`, which returns 503 when the database is unreachable.
- **Logs:** JSON on stdout. Admin actions are also under **Admin > System logs**.
- **Rotating `JWT_SECRET`:** access tokens stop working at once; users stay signed in through the refresh cookie.
- **Upgrades:** run `npm audit` and update dependencies regularly.
