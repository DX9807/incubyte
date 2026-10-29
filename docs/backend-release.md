# Backend release — Phase 7

The backend runs independently with PostgreSQL, Gunicorn, and WhiteNoise. It
requires no React or frontend build directory. Business APIs require an active
staff session. Readiness, CSRF bootstrap, login (with mandatory CSRF), and
documentation are public. No registration API is exposed.

## Provision HR access

After migrations, run from the repository root in a secure local or hosting shell
with the environment configured:

```bash
source .venv/bin/activate
python backend/manage.py create_hr_user --username hr-demo --email hr-demo@example.com
```

The command prompts twice without echoing the password, uses Django password
validation and hashing, and creates active staff without superuser privileges.
It prints no password and accepts none as a command-line argument. Existing users
are rejected without promotion or credential changes. The account can use HR
APIs; Admin model permissions remain separately managed through Django Admin.
Use `createsuperuser` when an administrator account is needed. No default demo
password is stored or automatically provisioned.

Change a password interactively with:

```bash
python backend/manage.py changepassword hr-demo
```

## Authentication flow

1. GET `/api/csrf/`; retain its `csrfToken` and the CSRF cookie.
2. POST `/api/login/` with JSON `username`/`password` and `X-CSRFToken`.
3. Retain the session cookie and replace the old token with the new `csrfToken`
   in the response. Django rotates CSRF/session keys on login.
4. GET `/api/me/` and business endpoints using that session.
5. Send the current token on every unsafe request, including logout.
6. POST `/api/logout/`; expect 204, then 403 for staff/business data.

Login rejects inactive/non-staff accounts with the same generic error as invalid
credentials. Auth responses use `no-store`. Sessions last eight hours; cookies
are HttpOnly and SameSite=Lax, and session/CSRF cookies are Secure in production.
A non-staff user with an existing session can log out its own session but cannot
access HR data or `/api/me/`. Staff revocation/deactivation takes effect on the
next request. The built-in User model and database sessions remain unchanged.

Swagger sends the live CSRF cookie as one header on same-origin writes. Its manual
CSRF parameter fields were removed to prevent differently cased header names
from being combined by the browser. No page-load token is reused after login.
Refresh `/api/docs/` after updating the server; login needs only credentials there.

## Build and release checks

```bash
python -m pip install -r requirements.txt
python backend/manage.py migrate --noinput
python backend/manage.py migrate --check
python backend/manage.py makemigrations --check --dry-run
python backend/manage.py collectstatic --noinput
python backend/manage.py test config employees compensation
python backend/manage.py spectacular --validate --fail-on-warn --file /tmp/acme-schema.yaml
gunicorn --check-config --config gunicorn.conf.py config.wsgi:application
```

With production variables loaded, run:

```bash
python backend/manage.py check --deploy --fail-level WARNING
```

The README explains optional HSTS subdomain/preload flags. Enable them only for
a domain whose whole subdomain tree is permanently HTTPS. Otherwise review the
expected W005/W021 warnings and use `--fail-level ERROR`, as documented. Production
requires a unique generated secret, explicit hostname/trusted origin, debug off,
and the database provider's TLS configuration. Production database accounts do
not need the test-only CREATEDB privilege.

## Gunicorn and static files

Run from the repository root:

```bash
gunicorn --config gunicorn.conf.py config.wsgi:application
```

The config selects the backend directory, binds `0.0.0.0:$PORT` (default 8000),
uses `$WEB_CONCURRENCY` workers (default 2), a 30-second timeout, and stdout/stderr
logs. Gunicorn reads these variables from the process environment: source/export
`.env` first if changing them locally. Django still loads its settings from `.env`
without overriding process values. Serve behind an HTTPS proxy; enable
`DJANGO_TRUST_PROXY=true` only if it strips incoming `X-Forwarded-Proto` and sets
its own trusted value.

WhiteNoise serves collected Admin/DRF assets from ignored `backend/staticfiles`
using hashed/compressed manifest storage. The Phase 8 frontend is a separately
hosted Vite application, as explicitly requested by the user. Django does not
serve React HTML/assets or require its build. See `frontend/README.md` for the
frontend host's same-origin API proxy and SPA fallback requirements.

Only `/api/health/` is exempt from production HTTPS redirects, so HTTP hosting
probes execute `SELECT 1` and receive real readiness 200/sanitized 503 responses.
Other HTTP routes redirect to HTTPS. Health exposes no private configuration.

## Managed hosting

Use one Python service and one PostgreSQL database. For Render's manual web
service, keep the repository root as working directory and configure Python 3.12
with a provider-supported fully qualified patch version. Configure:

| Setting | Value |
| --- | --- |
| Build | `python -m pip install -r requirements.txt && python backend/manage.py collectstatic --noinput` |
| Pre-deploy/release | `python backend/manage.py migrate --noinput` |
| Start | `gunicorn --config gunicorn.conf.py config.wsgi:application` |
| Health | `/api/health/` |

Use the production environment variables in README and the trusted proxy setting.
Database settings use separate PGDATABASE/PGUSER/PGPASSWORD/PGHOST/PGPORT/PGSSLMODE
values. No DATABASE_URL parser or extra runtime service is needed. If the provider
lacks a pre-deploy command, run migrations in its secure release shell before
directing traffic to the application. Provision HR users and seed demo data
explicitly, rather than on every application start.

Reference: [Render's Django guide](https://render.com/docs/deploy-django). Its
sample dependencies/layout differ; use this repository's Psycopg/Gunicorn commands.

## Verify the deployed URL

- Check readiness, Admin login/CSS, and public schema/documentation.
- Confirm anonymous business requests return 403.
- Exercise CSRF bootstrap, staff login, identity, and logout over HTTPS.
- Exercise search, pagination, employee creation/update, salary revisions/history,
  and all country analytics with a staff session.
- Verify Secure/HttpOnly session cookies, secure CSRF cookies, and HTTPS redirects.
- Verify the explicitly seeded 10,000-employee dataset and repeat-run behavior.

No hosting credentials or target service are configured in this environment.
Public deployment and actual URL verification remain blocked on that access;
local production-compatible verification is reported separately.

## Phase 7 verification results

- Baseline: 111 tests passed before changes. Final suite: 135 tests passed,
  including 24 authentication/provisioning/readiness tests and existing seed and
  PostgreSQL concurrency tests.
- Migrations ran with nothing pending; no model changes were detected.
- Static collection, strict OpenAPI validation, dependency/compilation checks,
  Gunicorn config validation, and strict production deployment checks passed.
- Actual HTTP checks passed on Django's development server and Gunicorn with
  production settings behind a simulated trusted HTTPS proxy: anonymous login
  CSRF rejection, successful login/token rotation, safe identity, session cookies,
  all business reads, employee creation/profile change, salary revision/history,
  analytics, and CSRF-protected logout/session invalidation.
- Public docs/Admin/static assets, database readiness over HTTP, and HTTPS
  redirection for other routes were verified. The verification client's initial
  JSON Accept header for HTML docs was corrected before rerunning HTTP checks.
- Temporary verification users/employees/sessions were removed. The seeded
  10,000 employees and 12,500 salary records were preserved.
- No public HTTPS deployment was performed or claimed. No frontend files,
  staging, or Git commit were created.
