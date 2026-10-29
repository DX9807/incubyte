# ACME Salary Management

Salary management for ACME's HR team, built incrementally from the supplied
assessment. **Implemented: Phase 1 only.** No employee/salary models or React UI
exist yet. See [requirements](docs/requirements.md) and [AI usage](docs/ai-usage.md).

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
Do not commit `.env`. Configuration uses process environment variables;
Django does not automatically read `.env`. Load it before management commands:

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
python backend/manage.py test config
python backend/manage.py runserver 127.0.0.1:8000
```

Visit `http://127.0.0.1:8000/admin/` and sign in using the superuser you created.
Only built-in users and groups are available in this phase.

```bash
curl --fail http://127.0.0.1:8000/api/health/
```

Expected: HTTP 200 and `{"status": "ok"}`. The public GET-only endpoint executes
`SELECT 1`; database errors return HTTP 503 and `{"status": "unavailable"}`.
It does not certify that migrations are applied; migration checks are a separate
release step. Static collection is needed before tests that render Admin with
manifest storage. Test data is created in a separate `test_acme_salary` database.

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

The current workspace has an ignored `.env` pointing to an isolated verification
database on port 55432 under `/tmp/acme-phase1-postgres`. Its local-only trust
authentication is for this temporary verification instance. For a persistent
setup, provision a password-protected database using the instructions above and
update `.env`. The pre-existing `venv/` was preserved; `.venv/` uses Python 3.12.
This machine lacked Python 3.12's `ensurepip`, so pip from the existing environment
was used with `--python .venv/bin/python` to install dependencies and pip there.

Phase 2 will introduce Department, Employee, SalaryRecord, migrations, model
validation, and Admin management after an explicit instruction to continue.
