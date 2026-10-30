# ACME Salary Management

Salary management for ACME's HR team, built incrementally from the supplied
assessment. **Implemented: Phases 1–11.** The backend is complete; a separate React/Vite
application provides login, logout, protected navigation, a responsive layout,
employee listing, creation, editing, details, deactivation, salary history,
salary revisions, and a country-specific compensation dashboard.
Django Admin and staff-only REST APIs
manage employees with salary revisions and history. Admin history stays read-only. See
[requirements](docs/requirements.md), [database design](docs/architecture.md), and
[API documentation](docs/api.md), and [AI usage](docs/ai-usage.md).
Country-specific salary analytics are available through the API and the React
dashboard, including department and salary distribution charts.
Session login/logout, current-user identity, and CSRF bootstrap are available.
See the [backend release runbook](docs/backend-release.md) for provisioning and deployment.
See [frontend setup and separate hosting](frontend/README.md) for the React app.

The deterministic `seed_employees` command can populate 10,000 fictional employees
with current salaries and history. See [seed behavior and verification](docs/seed-data.md).

## Local setup

Requires Python 3.12 (including its venv/ensurepip support) and running PostgreSQL
(verified with PostgreSQL 16). Run all commands from the repository root.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
```

Put the generated secret in `.env` as `DJANGO_SECRET_KEY='generated value'`.
Set `PGPASSWORD` to a local database password, also quoted as a shell value.
Do not commit `.env`. The existing settings use `python-dotenv` to read `.env`
without overriding process environment variables. You may also load it explicitly:

```bash
set -a
source .env
set +a
```

Using your local PostgreSQL administrator account, provision the database:

```bash
psql -U postgres -h 127.0.0.1 -d postgres
```

```sql
CREATE ROLE acme LOGIN CREATEDB;
\password acme
CREATE DATABASE acme_salary OWNER acme;
\q
```

Enter the same password as `PGPASSWORD`. `CREATEDB` is needed only for Django's
local test database; production runtime roles should not have this privilege.
If your PostgreSQL installation uses socket/peer authentication for its admin
account, use that installation's admin login method for provisioning instead.

```bash
python backend/manage.py migrate
python backend/manage.py collectstatic --noinput
python backend/manage.py createsuperuser
python backend/manage.py create_hr_user --username hr-demo --email hr-demo@example.com
python backend/manage.py test config employees compensation
python backend/manage.py runserver 127.0.0.1:8000
```

Visit `http://127.0.0.1:8000/admin/` and sign in using the superuser you created.
Create a department, then add an employee with the required initial salary inline.
Currency derives from country. Employee profile editing and deactivation are
available; country is read-only after creation. Salary history can be viewed in
the employee page and Salary records list. Existing history cannot be changed or
deleted. Staff can append dated revisions through the salary API.

After signing into Admin, use `/api/employees/` to browse the employee API and
`/api/departments/` to list departments. The APIs support employee creation,
detail, profile PATCH, search, filters, and 50-record server-side pages.
See [request/response contracts](docs/api.md). OpenAPI schema and UI routes are
public at `/api/schema/`, `/api/docs/`, and `/api/redoc/`; business data remains
staff-only. Unsafe session requests require CSRF protection.

API clients can GET `/api/csrf/`, POST `/api/login/` with credentials and the
token, GET `/api/me/`, then POST `/api/logout/` with the new token returned at
login. Login itself requires CSRF protection even for anonymous requests.
The HR provisioning command prompts securely and creates a non-superuser staff
account for APIs; use the administrator account for Admin model management.

GET `/api/employees/{id}/salaries/` shows salary history, newest first. POST to
the same URL with `annual_salary` and `effective_from` appends a revision.
The date must be later than the latest salary and no later than today; an
employee created today cannot receive another salary on the same day.
See [salary API details](docs/api.md#salary-history-and-revisions--phase-4).

Staff can read `/api/analytics/overview/?country=IN`,
`/api/analytics/departments/?country=IN`, and
`/api/analytics/distribution/?country=IN`. Each requires one supported country
and summarizes active employees with current salaries in that country's currency.
See [analytics contracts and fixed salary bands](docs/api.md#salary-analytics--phase-5).

```bash
curl --fail http://127.0.0.1:8000/api/health/
```

Expected: HTTP 200 and `{"status": "ok"}`. The public GET-only endpoint executes
`SELECT 1`; database errors return HTTP 503 and `{"status": "unavailable"}`.
It does not certify that migrations are applied; migration checks are a separate
release step. Static collection is needed before tests that render Admin with
manifest storage. Test data is created in a separate `test_<PGDATABASE>` database.

## Frontend

To run the separate frontend while Django is running:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` and sign in with an active HR staff account. The
frontend proxies API requests to port 9000 by default; start Django there with
`python backend/manage.py runserver 127.0.0.1:9000`, or set
`ACME_API_PROXY_TARGET` in `frontend/.env` to match your backend. It builds independently with
`npm run build`. Django does not serve its HTML or bundle, as requested.

## Seed data

To populate a local or demo database after migrations:

```bash
python backend/manage.py seed_employees --count 10000 --seed 42
```

This creates 10,000 employees and 12,500 salary records in an empty database.
Rerunning the same seed/count skips existing employees. Increasing the count
appends employees; reducing it deletes nothing. Different seeds create separate
datasets. Existing data is preserved, and collisions abort the entire command.
See [seed details](docs/seed-data.md) before running against a populated database.

## Production deployment

Use one Python 3.12 application service and one managed PostgreSQL database.
Install `requirements.txt` during the build. Configure these environment variables
through the hosting provider, using a unique generated secret and real DB values:

```text
DJANGO_SECRET_KEY=<unique secret, at least 50 characters>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=<your application hostname>
DJANGO_CSRF_TRUSTED_ORIGINS=https://<your application hostname>
PGDATABASE=<database name>
PGUSER=<database user>
PGPASSWORD=<database password>
PGHOST=<database hostname>
PGPORT=5432
PGSSLMODE=verify-full
```

For a dedicated domain whose entire subdomain tree is permanently HTTPS, also
set `DJANGO_HSTS_INCLUDE_SUBDOMAINS=true` and `DJANGO_HSTS_PRELOAD=true`.
These opt in to a long-lived browser policy and make the strict deployment check
below pass. Without that domain guarantee, leave both false: Django will report
`security.W005` and `security.W021`. Review those two expected warnings and run
`check --deploy --fail-level ERROR` instead; do not enable the policies merely
to remove a warning. Setting preload does not itself register a domain with the
browser preload list.

Use your provider's certificate setup for `verify-full`; configure libpq's
`PGSSLROOTCERT` if it supplies a custom CA. Follow the provider's TLS requirements.
Never use the local development `.env` in production. Production defaults enforce
HTTPS redirects, secure session/CSRF cookies, and HSTS for one year.
Set `DJANGO_TRUST_PROXY=true` only when the hosting provider's trusted proxy strips
incoming `X-Forwarded-Proto` and sets it itself. Otherwise terminate TLS directly
with a correctly configured reverse proxy. Hosting health probes may use HTTP
for `/api/health/`; other production routes require HTTPS.

Release/build checks (with production environment variables loaded):

```bash
python backend/manage.py check --deploy --fail-level WARNING
python backend/manage.py collectstatic --noinput
python backend/manage.py migrate --noinput
python backend/manage.py migrate --check
python backend/manage.py makemigrations --check --dry-run
```

Start command (set `PORT` to the provider's assigned port):

```bash
gunicorn --config gunicorn.conf.py config.wsgi:application
```

Gunicorn reads `PORT` and `WEB_CONCURRENCY` from process environment variables
(defaults 8000 and 2). Export local overrides before starting it. WhiteNoise
serves collected Admin assets; no frontend build is required yet.
Provision the Admin account interactively using `createsuperuser` in a secure
release shell. Verify the actual HTTPS health URL, Admin login and static assets
after deployment. `/api/health/` bypasses HTTPS redirection for hosting readiness
probes; all other HTTP routes still redirect in production. See the
[release runbook](docs/backend-release.md) for the complete deployment procedure.

## Verification and next step

The Phase 1 tests check real database readiness, sanitized database failures,
rejected health writes, Admin access protection, and Admin login rendering.
Run the commands above against PostgreSQL rather than substituting SQLite.
Phase 1 was verified with Python 3.12.7 and PostgreSQL 16.8: all built-in
migrations applied, all five tests passed, no model changes were pending, static
collection succeeded, and development and production Gunicorn HTTP checks served
health, Admin login, and Admin CSS. Production checks passed without warnings
with the dedicated HTTPS domain HSTS options enabled; HTTPS redirect was verified.
No public hosting environment was provisioned.

Phase 1 used an isolated verification database on port 55432 under
`/tmp/acme-phase1-postgres`; Phase 2 uses the database currently configured in
the workspace's ignored `.env`. Set the database connection values for your own
installation. The pre-existing `venv/` was preserved; `.venv/` uses Python 3.12.
This machine lacked Python 3.12's `ensurepip`, so pip from the existing environment
was used with `--python .venv/bin/python` to install dependencies and pip there.

Phase 2 adds the three business models, initial migrations, model/database
validation, and Admin tests. Run the full suite with
`python backend/manage.py test config employees compensation`. The tests cover
uniqueness, positive salaries, supported countries/currencies, date validation,
deactivation/history retention, protected relationships, initial salary rollback,
and Admin restrictions. The database design documents the distinction between
database constraints and application validation.

Phase 2 verification: both initial business migrations applied successfully;
all 33 tests passed against PostgreSQL, including the five Phase 1 tests.
Migration consistency checks, static collection, dependency checks, compilation,
and production deployment checks passed. Development and Gunicorn HTTP checks
served health, Admin login, and Admin CSS, and the production HTTPS redirect
worked. Production checks used the documented dedicated-domain HSTS options
and a generated verification secret. No public deployment was performed.

Phase 3 adds employee and department REST APIs with deterministic tests for
atomic creation, salary validation, search, filters, pagination, profile changes,
deactivation, access control, CSRF, and bounded list-query counts. No schema or
dependency changes are required. All work is left uncommitted at the user's
request.

Phase 3 verification: all 60 tests passed (33 existing and 27 new). Migrations
ran with nothing pending, and no model changes were detected. Static collection,
OpenAPI validation with warnings treated as errors, dependency/compilation checks,
and production deployment checks passed. Development and Gunicorn HTTP checks
served health, Admin login, static CSS, and public documentation; anonymous
business API requests returned 403. The production HTTPS redirect worked. The
production checks used the documented HSTS options and a generated verification
secret. No public deployment was performed.

Phase 4 adds salary history and revision APIs, an atomic revision service with
employee row locking, and service/API/PostgreSQL concurrency tests. No models,
migrations, or dependencies changed. Revisions append records; existing Admin
and profile endpoints cannot edit or delete history. No Git commit is created
by the agent, as instructed.

Phase 4 verification: all 78 tests passed (60 existing and 18 new), including
two real PostgreSQL concurrency tests. Migrations ran with nothing pending and
no model changes were detected. Static collection, strict OpenAPI validation,
dependency/compilation checks, and production deployment checks passed.
Development and Gunicorn HTTP checks served health, Admin login, CSS, and public
documentation, including the new salary operations in the schema. Anonymous
salary requests returned 403, and production HTTPS redirection worked. Production
checks used the documented HSTS options and a generated verification secret.
No public deployment was performed.

Phase 5 adds overview, department, and salary distribution APIs using PostgreSQL
aggregations over current effective salaries. Country is required, inactive
employees are excluded, and currencies are kept separate. Empty summaries and
fixed country-specific salary bands are documented in `docs/api.md`. No models,
migrations, dependencies, or later-phase functionality were added. Changes remain
uncommitted as instructed.

Phase 5 verification: all 98 tests passed (78 existing and 20 new), including
the salary concurrency tests. Each analytics endpoint uses one database
aggregation query in the query-count tests. Migrations ran with nothing pending;
no model changes were detected. Static collection, strict OpenAPI validation,
dependency/compilation checks, and production deployment checks passed.
Development and Gunicorn HTTP checks verified health, Admin, static assets,
public documentation, required-country schema parameters, and anonymous 403
responses for analytics. HTTPS redirection worked. Production checks used the
documented HSTS options and a generated verification secret. No public deployment
was performed.

Phase 6 adds the deterministic, batched `seed_employees` management command and
13 verification tests, including a real 10,000-record run. Faker is the only new
dependency. Existing models, migrations, and API behavior remain unchanged.

Phase 6 verification: all 111 tests passed (98 existing and 13 new), including
the full 10,000-row seed test and PostgreSQL concurrency tests. Migrations ran
with nothing pending, and no model changes were detected. Static collection,
strict OpenAPI validation, dependency/compilation checks, production deployment
checks, development/Gunicorn HTTP checks, and HTTPS redirection passed.
The configured local database was also populated with seed 42: exactly 10,000
employees and 12,500 salary records. A second run created nothing and skipped
all 10,000 employees. Pagination and all country analytics were verified against
that persisted dataset. No public deployment or Git staging/commit was performed.

Phase 7 adds session login/logout, safe current-user identity, CSRF bootstrap,
secure cookie/session configuration, non-superuser HR provisioning, a reusable
Gunicorn configuration, and backend release instructions. No business models,
migrations, dependencies, or frontend were added. No staging or commit is performed.

Phase 7 verification: all 135 tests passed (111 existing and 24 new). Migrations
had nothing pending, and no model changes were detected. Static files, strict
OpenAPI validation, dependency/compilation checks, Gunicorn config validation,
and production deployment checks passed. Real HTTP auth/CSRF and business
read/write flows passed on the development server and production-configured
Gunicorn behind a simulated trusted HTTPS proxy, including logout invalidation,
readiness, docs/static assets, and HTTPS redirection. Temporary fixtures were
removed; 10,000 seeded employees and 12,500 salaries were preserved.
Public deployment remains pending hosting credentials and a target service.

Phase 8 adds an independent React/Vite app in `frontend/`, with Material UI,
React Router, one Fetch client, CSRF-aware login/logout, restored sessions,
protected routes, responsive navigation, and loading/error states. The user
explicitly chose separate frontend hosting and unchanged backend source, overriding
the master prompt's combined Django/React serving plan. Production frontend hosts
must proxy `/api/` and support SPA route refresh; see `frontend/README.md`.
Employee, salary, and dashboard business screens are not implemented in this phase.

Phase 8 verification: clean npm installation, all 12 Fetch-client tests, and the
Vite production build passed. Three Chromium scenarios passed on both dev and
built preview, covering real login/CSRF/logout, protected routes, refresh,
mobile navigation, retries, and pending submissions. Desktop/mobile screenshots
were inspected. All 137 backend tests, migrations, static/schema checks,
production checks, and backend HTTP startup flows passed. Backend source and
the 10,000-employee/12,500-salary dataset were preserved. No deployment, staging,
or commit was performed.

Phase 9 adds the Material UI employee table, 50-record server pagination, search,
combined department/country/status filters, create/edit dialogs, profile details,
current annual salary/currency, and confirmed deactivation/reactivation. URL
filters survive refresh/navigation. Backend field errors, retries, empty/loading
states, and pending-save controls are handled without changing backend contracts.
Country and current salary remain read-only during profile editing. No salary
revision/history or analytics UI was added. See `frontend/README.md` for usage and
disposable browser-test fixtures.

Phase 9 verification: 17 client tests, the production Vite build, and all seven
Chromium scenarios passed on both dev and built preview. The existing 10,000-row
dataset was used for pagination; screenshots were inspected. Backend source and
seeded records were preserved. No staging, commit, or public deployment occurred.
Final backend checks passed all 137 tests, migrations with nothing pending,
model consistency, static/schema validation, production settings, Gunicorn
configuration, and development/production HTTP auth and business flows.

Phase 10 adds newest-first salary history and a revision dialog to employee
details, retaining the existing current salary display. The form validates
positive decimal amounts and effective dates, shows backend validation errors,
keeps currency read-only, prevents duplicate saves, and refreshes current salary
and history after success. Prior records remain intact. No backend source or
dependency changes were needed. See `frontend/README.md` for usage and historical
browser-test fixture setup.

Phase 10 verification: all 23 client tests, the production Vite build, and nine
Chromium scenarios on each of dev and built preview passed. All 137 backend
tests passed again. Migration/model consistency, static collection, strict
OpenAPI validation, production settings, Gunicorn config, and real production
HTTP auth/salary/startup checks passed. Desktop/mobile screenshots were inspected.
Temporary fixtures were removed; the 10,000 seeded employees and 12,500 salaries
remained intact. No public deployment, staging, or commit was performed.

Phase 11 adds the compensation dashboard with a country selector, active employee
count, total/average/minimum/maximum annual base salary, department average-salary
comparison, and salary-band histogram. Recharts is required by the master prompt;
its React-compatible peer is pinned, and charts have a separate Vite chunk.
Loading/error/retry/empty states, exact chart value tables, canceled stale
requests, and refresh/deep links are supported. Backend data remains authoritative,
with no cross-currency totals or client aggregation. No backend source changed.

Phase 11 verification: clean npm ci, all 27 client tests, the production build,
and all 13 Chromium scenarios on each of dev and built preview passed. All 137
backend tests, migrations/model consistency, static/schema validation, production
settings, Gunicorn configuration, and real HTTP analytics/auth/salary checks
passed. The analytics HTTP checks covered all five countries. Screenshots were
inspected; temporary fixtures were cleaned up. The existing seeded dataset was
preserved (10,000 employees, 12,501 salaries at this phase's baseline, including a
pre-existing revision). No public deployment, staging, or commit was performed.

Phase 12 is final integration, deployment, and submission, pending explicit
instruction. No Phase 12 work was performed.
