# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DocuSyncAI: three-way reconciliation of Purchase Order (PO), Goods Receipt Note (GRN) and Invoice documents, with AI-assisted extraction and a two-level approval workflow (accountant → chief accountant). Docs, comments and UI text are in Vietnamese. See [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Commands

Backend (Python 3.11+, run from repo root, PostgreSQL on `127.0.0.1:5433` via `docker compose up -d postgres`):

```bash
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
pytest tests -v --cov=src                     # CI requires >= 75% coverage
pytest tests/test_api/test_batch_archive.py::test_name -v   # single test
ruff check src tests migrations scripts eval  # lint (config: ruff.toml)
ruff format src tests
python eval/run_eval.py                       # eval XML pipeline on dataset/golden
alembic revision -m "..."                     # new schema change; alembic upgrade head to apply
```

Frontend (`frontend/`): `npm run dev` (port 3000), `npm test` (Vitest), `npm run build`.

Docker: `docker compose up -d --build` (dev, auto-loads `docker-compose.override.yml` with demo data); production uses `docker compose -f docker-compose.yml up -d --build`. After code changes, rebuild with `docker compose up -d --build` so the running app reflects them.

## Architecture

- `src/main.py`: FastAPI entry; on startup runs `alembic upgrade head` (disable with `RUN_MIGRATIONS_ON_STARTUP=false`) and seeds the two default users. Production config refuses to start with default DB password / weak seed password.
- `src/api/`: routers per domain (auth, signup/invitations, admin, uploads/batches, reconciliations, thresholds, audit_logs, notifications incl. WebSocket `/api/v1/notifications/ws`), all under `/api/v1`. Role checks per endpoint: `accountant`, `chief_accountant`, `platform_admin`.
- Roles and onboarding (migration `0004`): `platform_admin` belongs to no company (`organization_id` NULL), may only call `/admin`, `/auth/me`, `/auth/password`, notifications (`PLATFORM_ADMIN_PATHS` in `src/api/auth.py`), sees company info and counts but never documents; created with `scripts/create_platform_admin.py`. Self-signup (`/auth/signup` → email OTP → `/auth/signup/verify`) creates a company with `plan='free'` and a 14-day Pro trial (`trial_ends_at`); the effective plan is computed (`effective_plan` in `services/organizations.py`), no background job. Chief accountants invite users by email (`user_invitations`, token stored hashed). Suspended companies (`organizations.status`) get 403 on login and on every request. Login email is global, so uniqueness checks go through `email_in_use` (a system-mode session), not the RLS-scoped request session. Outside production, missing SMTP logs the OTP/invite link instead of failing.
- Plans and billing (migration `0005`): limits per plan live in `PLAN_LIMITS` (`services/plans.py`: users incl. pending invitations, batches and AI files per month, storage). Check before the work (`ensure_can_*`), count after (`record_usage`, atomic upsert into `usage_counters`, never decremented, so deleting a batch doesn't refund). XML uploads don't count as AI. Over the limit raises `PlanLimitError` → HTTP 402 `{detail, code: "plan_limit", resource}`. Paid plans have `organizations.plan_expires_at`; `paid_plan`/`effective_plan` fall back to Free when expired. Payments: `/billing/checkout` creates a `payments` row with a code (prefix `PAYMENT_CODE_PREFIX`) shown as VietQR (`qr.sepay.vn`); SePay calls `/billing/webhook` (`Authorization: Apikey ...`), matched by code, idempotent on SePay's transaction id; same plan extends from the current expiry, a different plan starts today. 12 months cost 10. Checkout is off until `SEPAY_BANK_CODE`/`SEPAY_BANK_ACCOUNT` are set. `scripts/send_renewal_reminders.py` runs daily from cron (7 and 1 days before expiry).
- Extraction: XML is parsed locally (`services/document_parser.py`: GDT invoices, UBL, Vietnamese schemas `DonDatHang`/`PhieuNhapKho`) and never sent to AI. PDF/images go through `document_ai_extractor.py` / `vision_parser.py` / `parser_strategies.py` (OpenAI or Gemini) with an offline fallback when no API key.
- `services/reconciliation_engine.py`: matches line items (SKU or name), unit price, quantity, VAT, tax ID, totals; classifies `matched` / `minor_diff` / `major_diff` using the `thresholds` table.
- Multi-tenancy (migration `0003`): table `organizations`; every business table has `organization_id` (NOT NULL except `users`/`audit_logs`). Isolation is enforced by Postgres Row-Level Security: the app engine runs `SET ROLE docusync_app` (non-superuser, superusers bypass RLS) and `src/database.py` sets `app.current_org` / `app.rls_bypass` per transaction (`after_begin`). Sessions start in system mode (bypass, for login/OTP/seed); `get_current_user` calls `set_organization_context` so every authenticated request only sees its company. Inserts get `organization_id` from `app.current_org` via the column default, so code rarely passes it. Migrations use `admin_engine`. Tests set `src.database.default_organization_id` to the Demo org (`DEMO_ORGANIZATION_ID`); production leaves it None so a missing context fails loudly. Never compute ids with `MAX(...)+1` (RLS limits it to one company): `users.public_id` uses `users_public_id_seq`. Uploads are stored under `storage/upload/<org_id>/`. Isolation tests: `tests/test_api/test_tenant_isolation.py` (real logins, not `dependency_overrides`).
- Batch lifecycle: `incomplete` → `ready` (all three doc types present) → `approved` → `final_approved` or `rejected`. From `approved` on, adding/deleting documents returns 409. `final_approved` batches are immutable archives, also enforced by DB triggers (migration `0002`) blocking DELETE on `document_batches`, `uploaded_files`, `uploaded_document_extractions`.
- Tolerance rules: tax ID, VAT rate, unit price and quantity must match exactly; money amounts (line total, tax, grand total) may differ by at most 1,000 VND (rounding) → `minor_diff`, otherwise `major_diff`. A percentage threshold of 0 means "not checked by %". Line matching priority: SKU → exact name → closest name (substring matching caused false matches like "gói 10" vs "gói 100").
- AI extraction safeguards: if the sum of extracted lines doesn't match the document total, the AI is called once more, then the result is flagged low quality. A line total that differs from quantity × unit price by more than 1,000 VND is replaced with quantity × unit price (and logged); document totals are read separately, so real tampering still shows up. Production model: `gpt-4o-mini`. AI calls run in a thread pool.
- Golden dataset: `dataset/golden/*` (generated by `scripts/generate_golden_dataset.py`, answers in `ground_truth.json`, decided by the script, not the engine) is used by `tests/test_golden_dataset.py` and `eval/run_eval.py`. `scripts/generate_golden_documents.py` creates PDF/JPG versions for AI tests.
- Login rate limiting is computed from `audit_logs` (no Redis). Sessions: random token stored as SHA-256 hash.
- Schema: Alembic only (`migrations/`); `0001` is an idempotent baseline. Every schema change must be a new revision.
- `src/agents/`: sample LangGraph agent for `/api/v1/chat`, disabled by default (`ENABLE_AGENT_CHAT_API`), unused by frontend.
- Frontend: React 18 + Vite + Tailwind; client-side three-document comparison in `frontend/src/reconciliationCompare.js`. No nginx: the `web` container is Caddy (`deploy/Caddyfile`) serving the built frontend and proxying `/api`, `/health` + WebSocket.
- Deployment: one GCP Compute Engine VM running `docker-compose.yml` (postgres, backend, web), tuned for e2-micro Always Free (1 GB RAM + 2 GB swap, 1 uvicorn worker, small Postgres); moving off the old e2-medium (Singapore) is described in `deploy/gcp/MIGRATE_TO_FREE_TIER.md`. Push to `main` → CI passes → `deploy.yml` builds backend + web images on Actions, pushes them to GHCR, SSHes in and runs `deploy/gcp/update.sh <commit>` (backup, git checkout, pull images, pin `IMAGE_TAG` in `.env`, wait for healthy; `flock`-serialised). The VM never builds. Backups: `deploy/gcp/backup-to-gcs.sh` (7 daily + 4 weekly on GCS), `restore-from-gcs.sh` (`--drill` is safe). Sentry is on only when `SENTRY_DSN` / `VITE_SENTRY_DSN` is set. `deploy/gcp/make-env.sh` rebuilds the server `.env`. Server `.env` lives on the VM, not locally. Email (rejections, OTP) is sent via Gmail SMTP; seed accounts use fake addresses.
- Frontend routes are centralised in `frontend/src/routes.js`, UI strings in `frontend/src/i18n/vi.js`, theme via CSS variable design tokens.

## Project notes

- Repo root is kept minimal: docs go in `docs/` (project rules in `docs/rules/`), sample data in `dataset/` (`raw_data/` is read by the offline extraction fallback, `samples/invoices/` is mounted at `/app/invoice` in dev). `DESIGN.md`/`PRODUCT.md` stay at root because the Impeccable skill reads them there. `hidden/` (work log, internship report, course guide) is git-ignored.
- `hidden/NHAT_KY_CONG_VIEC.md` is the work log used for the internship report (newest first, Vietnamese, no secrets). Add an entry after each piece of work. It also lists pending tasks.

## Testing caveats

- `tests/conftest.py` redirects `DATABASE_URL` to an isolated `<db>_test` database (created automatically) before importing `src.main`. Never run tests or scripts against the dev database: tests purge batch tables.
- Do not call real OpenAI/Gemini APIs in tests or scripts without asking; CI runs with `OPENAI_API_KEY=""`.
