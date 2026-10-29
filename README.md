# ACME Salary Management

Salary management for ACME's HR team, built incrementally from the supplied
assessment. **Implemented: Phases 1–4.** Django Admin and staff-only REST APIs
manage employees with salary revisions and history. Admin history stays read-only. See
[requirements](docs/requirements.md), [database design](docs/architecture.md), and
[API documentation](docs/api.md), and [AI usage](docs/ai-usage.md).
Analytics and React are not implemented yet.

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

GET `/api/employees/{id}/salaries/` shows salary history, newest first. POST to
the same URL with `annual_salary` and `effective_from` appends a revision.
The date must be later than the latest salary and no later than today; an
employee created today cannot receive another salary on the same day.
See [salary API details](docs/api.md#salary-history-and-revisions--phase-4).

```bash
curl --fail http://127.0.0.1:8000/api/health/
```

Expected: HTTP 200 and `{"status": "ok"}`. The public GET-only endpoint executes
`SELECT 1`; database errors return HTTP 503 and `{"status": "unavailable"}`.
It does not certify that migrations are applied; migration checks are a separate
release step. Static collection is needed before tests that render Admin with
manifest storage. Test data is created in a separate `test_<PGDATABASE>` database.

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
with a correctly configured reverse proxy. Configure a proxy deployment's health
probe to send `X-Forwarded-Proto: https` or probe via HTTPS.

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
gunicorn --chdir backend config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --access-logfile -
```

WhiteNoise serves collected Admin assets; no frontend build is required yet.
Provision the Admin account interactively using `createsuperuser` in a secure
release shell. Verify the actual HTTPS health URL, Admin login and static assets
after deployment. No public deployment is created in Phase 1.

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

Phase 5 will introduce salary analytics APIs after an explicit instruction
to continue.
