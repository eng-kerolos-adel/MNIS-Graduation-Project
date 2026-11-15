# MNIS API — one backend for the Next.js portal and the Flutter app

NestJS 11 · Prisma 6 · PostgreSQL · JWT (access + rotating refresh) · RBAC · encrypted PII · audit trail.

```
Flutter ─┐
         ├─►  https://<your-api>.onrender.com/v1/*  ─►  Neon Postgres
Next.js ─┘
```

## Free hosting (no local setup)
| Piece | Service | Notes |
|---|---|---|
| Database | **Neon** (free) | Scales to zero; use both the *pooled* and *direct* connection strings |
| API | **Render** (free web service) | Sleeps after ~15 min idle, 30–60 s cold start. Free tier is for demos, not real patients |
| Portal | **Vercel** (free hobby) | Set `NEXT_PUBLIC_API_URL` to the Render URL |

Free-tier limits change often — re-check each provider's pricing page before relying on them.

## Deploy steps
1. Push this folder to a GitHub repo (`mnis-api`).
2. **Neon** → new project → copy the *pooled* string (→ `DATABASE_URL`) and the *direct* string (→ `DIRECT_URL`).
3. Generate the encryption key on any machine with Node (or an online Node REPL): `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` → `ENCRYPTION_KEY`. **Back it up somewhere safe: lose it and every encrypted national ID is unrecoverable.**
4. **Render** → New → Blueprint → pick the repo (uses `render.yaml`). Fill `DATABASE_URL`, `DIRECT_URL`, `ENCRYPTION_KEY`, `CORS_ORIGINS` (your portal's exact origin, e.g. `https://mnis.vercel.app`). Other secrets are auto-generated.
5. First deploy only: set `SEED_ON_DEPLOY=true` and `SEED_PASSWORD=<12+ chars>` to create demo users (`doctor@`, `pharmacist@`, `lab1@`/`lab2@`, `er@`, `exec@`, `reception@`, `admin@mnis.demo`, plus a demo citizen who logs in with national ID `29304151234567`). **Then set `SEED_ON_DEPLOY=false` and remove `SEED_PASSWORD`.**
6. Check `https://<api>/health` → `{"status":"ok"}`.

The build runs `prisma db push` on the first deploy (no migrations folder yet). Before any real data, create proper migrations (`npx prisma migrate dev --name init` from any environment with Node — e.g. GitHub Codespaces) and commit `prisma/migrations`; the build will then use `migrate deploy` automatically.

## API surface (all under `/v1`, Bearer JWT unless noted)
| Area | Endpoints | Roles |
|---|---|---|
| Auth | `POST /auth/login` (`identifier` = staff email **or** citizen 14-digit national ID), `/auth/refresh`, `/auth/logout` (public); `GET /auth/me`, `POST /auth/change-password` | any |
| Admin | `GET/POST /admin/users`, `PATCH :id/active`, `POST :id/reset-password` | admin |
| Reception | `POST /reception/citizens` (opens a citizen account, returns a one-time temporary password), `POST /reception/citizens/:patientId/reset-password` | receptionist, admin |
| Appointments | `GET /appointments`, `POST :id/confirm`, `POST :id/reject`, `GET /doctors` | receptionist (+doctor reads own) |
| Renewals | `GET /renewals`, `POST :id/approve` (creates a DRAFT for the doctor to review and sign), `POST :id/reject` | doctor |
| QR share | `POST /shares/redeem` `{code}` → patient summary | doctor |
| **Citizen (`/me/*`)** | `profile`, `emergency-card`, `prescriptions`, `lab-results` (verified only), `visits`, `appointments` (GET/POST — `type: CLINIC\|LAB`, `testPanel` required for LAB; `POST :id/cancel`), `renewals`, `POST prescriptions/:id/renewal`, `POST share` (10-min one-time code), `documents` (GET list, `POST` upload, `GET :id/file`) | patient |

Documents are citizen-uploaded files (e.g. a photo/PDF of an external lab result) stored inline as base64 in Postgres — there is no object-storage service wired up, so uploads are capped at ~4MB and 50 files per citizen. `GET /me/documents` returns metadata only (no file bytes, so the list loads fast); fetch the actual file from `GET /me/documents/:id/file`. There is no lab-portal review screen for these yet — they sit as `PENDING_REVIEW` until that module is built.
| Patients | `GET /patients?q=`, `GET /patients/:id`, `POST /patients` | doctor, pharmacist, lab, hospital (create: doctor, hospital) |
| Queue | `GET/POST /queue`, `POST /queue/call-next`, `PATCH /queue/:id/status` | doctor, hospital |
| Prescriptions | `POST`, `GET`, `POST :id/sign`, `:id/verify`, `:id/dispense`, `:id/reject` | doctor (create/sign), pharmacist (verify/dispense/reject) |
| Lab | `GET/POST /lab/samples`, `PATCH :id/status`, `POST :id/results`, `POST :id/verify` | lab tech (+doctor orders) |
| Hospital | `GET /hospital/beds`, `PATCH beds/:id/status`, `GET/POST /hospital/er`, `POST er/:id/admit` | hospital staff, doctor |
| Analytics | `GET /analytics/kpis` | executive, admin |
| Health | `GET /health` (no `/v1`) | public |

Swagger UI at `/docs` (off in production unless `SWAGGER_ENABLED=true`); `/docs-json` feeds `openapi-generator` for the Dart client and `openapi-typescript` for Next.js.

## Citizen flow
1. Reception calls `POST /reception/citizens` on the first visit → gets `loginId` (national ID) + `temporaryPassword`, hands it over.
2. Citizen logs in with national ID + temporary password. Every call except `/auth/me`, `/auth/change-password`, `/auth/logout` returns `403 PASSWORD_CHANGE_REQUIRED` until they change it (all sessions are then signed out; log in again).
3. Citizen requests an appointment → reception confirms/rejects → citizen sees the status in `/me/appointments`.
4. Citizen requests a renewal of a *dispensed* prescription → doctor approves → a DRAFT copy appears for the doctor to review and sign.
5. Citizen taps "share" → app shows the 10-character code as a QR → doctor enters/scans it at `POST /shares/redeem` → sees a summary; the code is single-use and expires in 10 minutes.
The citizen's patient id always comes from the signed token, never from the request, so one citizen can never ask for another's record.

## Client integration
**Flutter** – call `/auth/login`; store `accessToken` + `refreshToken` in `flutter_secure_storage`; on 401 call `/auth/refresh` with `{ "refreshToken": ... }` (refresh tokens rotate: always save the new one).

**Next.js** – send header `X-Client-Type: web` on auth calls and `credentials: "include"`. The refresh token lives in an httpOnly cookie you never touch; keep the access token in memory only (not localStorage). Because the cookie is cross-site (Vercel → Render), prefer putting both under one custom domain later (e.g. `app.` and `api.` on the same parent domain) and switching the cookie to `SameSite=Lax`.

## Security built in
- argon2id passwords; 5 failed logins → 15 min lock; identical error for every login failure (no user enumeration)
- 15-min access JWT (HS256 pinned); refresh tokens hashed at rest, rotated on use, reuse of an old token revokes the whole session family
- Deny-by-default RBAC on the server (never rely on hidden UI); clinical fields minimised per role (pharmacy/lab see only the last 4 digits of the national ID)
- National ID encrypted with AES-256-GCM + HMAC blind index for lookup
- Prescriptions: HMAC integrity seal, conditional state transitions (no double-dispense), lab dual sign-off (verifier ≠ enterer), atomic bed assignment
- helmet, exact-origin CORS, global rate limit + strict login limit, whitelist validation (unknown fields rejected), no stack traces to clients, fail-fast env validation
- Audit log of who accessed which resource (metadata only, no bodies)

## Not solved yet
- This is a graduation project on free tiers: use only fake data. Free tiers have no SLA and limited backups; real patient data would need a legal review (Egypt's Personal Data Protection Law 151/2020, Ministry of Health rules) and proper hosting.
- The prescription "signature" is an HMAC seal, not a qualified PKI e-signature.
- No MFA, no password-reset flow, no user-admin endpoints, no automated tests or CI yet. This code was written without being installed or compiled (the authoring sandbox had no network), so expect to fix small type or dependency errors on the first `npm run build`.
