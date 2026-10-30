# ACME Salary Management frontend — Phases 8–9

A separate React/Vite application using Material UI, React Router, and native
Fetch. The Django backend source is unchanged. Login, logout, identity/session
checks, protected routes, responsive layout, and navigation work against the
existing APIs. Employee listing, creation, profile editing, details, and active
status management are implemented. Dashboard remains a placeholder; salary
history/revision screens and analytics UI belong to later phases.

## Run locally

Requires Node 22.12+ and the configured Django/PostgreSQL backend. From repository
root, use one terminal for Django:

```bash
source .venv/bin/activate
python backend/manage.py migrate
python backend/manage.py runserver 127.0.0.1:9000
```

If needed, provision an HR account with the existing interactive command:

```bash
python backend/manage.py create_hr_user --username hr-demo --email hr-demo@example.com
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. Use the username/password of an active Django staff
account. There are no default credentials. The Vite server proxies `/api/` to
`http://127.0.0.1:9000`, retaining the browser's Host/Origin pair for CSRF checks.
No backend CORS or source changes are required. For a different local backend,
copy `.env.example` to `.env`, change `ACME_API_PROXY_TARGET`, and restart Vite.
That variable is server-side proxy configuration, not browser-bundled data.

## Authentication contract

- GET `/api/me/` restores an existing staff session. A 403 redirects protected
  routes to `/login`; service/network failures offer a retry instead.
- Before each unsafe request, the central client GETs `/api/csrf/`, retaining its
  cookie and sending the exact returned token in one `X-CSRFToken` header.
- POST `/api/login/` sends `username` and `password` unchanged except username
  whitespace trimming. Success uses the response's `user` object. Fresh bootstrap
  on subsequent writes handles Django's login token rotation and other tabs.
- POST `/api/logout/` clears the backend session before clearing frontend identity.
  If logout returns 403, the client checks `/api/me/` and only treats it as already
  logged out when the session is confirmed expired. Other failures keep the user
  signed in and display an error.
- Requests use relative `/api/` URLs and `credentials: 'same-origin'`. No password,
  CSRF token, or user/session information is saved in local/session storage.

The central client preserves structured API errors and handles HTML CSRF errors,
network failures, empty 204 responses, and cancellation. It remains available for
business screens without changing backend contracts.

## Build and preview

```bash
npm test
npm run build
npm run preview
```

`dist/` is a standalone static build with hashed assets. Preview serves it at
`http://127.0.0.1:4173` with the same local API proxy. Vite preview is a verification
server, not the production hosting service. Dependencies are pinned and locked;
Material UI styling uses Emotion. No external images or font services are needed.

## Separate production hosting

Deploy only `frontend/dist/` to the frontend host. Do not add it to Django templates
or static settings. Configure these rules, in this order:

| Browser path | Frontend host behavior |
| --- | --- |
| `/api/*` | Reverse-proxy to the existing Django service, preserving path, query, method, body, cookies, Origin, CSRF header, and Set-Cookie responses. |
| `/assets/*` | Serve built files; missing assets must return 404. Hashed files may be cached immutably. |
| Other app paths | Serve `index.html` so `/login`, `/dashboard`, `/employees`, and `/employees/:id` work after refresh. Revalidate the HTML on each deployment. |

The browser always talks to one origin; the frontend and Django remain separate
applications/services. Do not point browser Fetch directly at an unrelated
backend origin: the current backend has no CORS integration and intentionally
uses same-origin cookies. The frontend host needs an API reverse-proxy/rewrite
feature; a file-only host without such a feature is insufficient.

Use HTTPS and the backend's existing production environment settings. If the
proxy changes Host to the backend hostname, add the frontend HTTPS origin to
`DJANGO_CSRF_TRUSTED_ORIGINS`. If it preserves the frontend Host, also include that
hostname in `DJANGO_ALLOWED_HOSTS`. These are deployment environment values, not
backend source changes. Do not remove CSRF checks or rewrite untrusted Origin
headers. Honor the backend's documented trusted HTTPS proxy configuration.

Backend secret keys/database credentials must never be put in frontend variables
or files. No frontend environment secret is needed. Actual public deployment is
not performed in this phase because no frontend/backend hosting targets are configured.

## Browser verification

Install the Chromium test browser once:

```bash
npx playwright install chromium
```

Use a disposable demo/test database with the 10,000 seeded employees and
departments. The employee scenarios create, edit, and deactivate records under
the mandatory unique `ACME_E2E_EMPLOYEE_PREFIX`; choose a new prefix on each run.
There is no employee DELETE API, so restore the disposable database or remove
only those fixtures through trusted administrative tooling afterward. Never
run these scenarios against real employee data. With Django and Vite running,
set a temporary HR test account securely in the environment, then run:

```bash
read -r -p 'HR test username: ' ACME_E2E_USERNAME
read -r -s -p 'HR test password: ' ACME_E2E_PASSWORD
read -r -p 'Unique disposable employee fixture prefix: ' ACME_E2E_EMPLOYEE_PREFIX
export ACME_E2E_USERNAME ACME_E2E_PASSWORD ACME_E2E_EMPLOYEE_PREFIX
npm run test:e2e
unset ACME_E2E_USERNAME ACME_E2E_PASSWORD ACME_E2E_EMPLOYEE_PREFIX
```

Tests use `http://127.0.0.1:5173` by default. Set `ACME_E2E_BASE_URL` to the preview
or separately hosted frontend URL to test the production build. Seven scenarios
verify authentication, pagination, combined filters/search, create/edit, profile
PATCH restrictions, deactivation with salary retention, validation, request
failures/retries, pending controls, deep links, and mobile layout. Failed
traces/results are ignored by Git; use test-only accounts. `PLAYWRIGHT_BROWSERS_PATH`, if set,
must be consistent for browser installation and test execution.

## Phase 8 verification results

Clean `npm ci`, all 12 API-client tests, and the production Vite build passed.
All three Chromium scenarios passed against both Vite dev and built preview
(six successful executions), using real Django login/CSRF/session endpoints.
Desktop and mobile screenshots were inspected. Temporary HR accounts/sessions
were removed. The unchanged backend passed all 137 tests, migration checks,
static/schema checks, deployment checks, Gunicorn configuration, and development/
production-configured HTTP checks. Its 10,000 seeded employees and 12,500 salary
records were preserved. No public deployment, staging, or commit was performed.


## Employee management — Phase 9

Open Employees after login. The Material UI table requests 50 records per page
from Django; it never downloads all employees. Submit search with Enter or
Search; department, country, and active-status filters apply immediately and
reset pagination. Query parameters preserve filters on refresh and navigation.
Open a name or View for profile details and current annual salary/currency.

Add employee requires a department and a positive initial annual salary. Currency
comes from country. Edit changes profile fields and active status; country and
current salary are read-only and excluded from PATCH. Deactivate/Reactivate on
the details page requires confirmation and preserves salary records. Successful
writes reload the relevant server data. Loading, empty results, field errors,
failed-request retry, and pending-save controls are supported. If no departments
exist, an administrator must create one before employee creation.

Salary history/revision and analytics screens are not part of this phase.

## Phase 9 verification results

Baseline verification passed 137 backend tests, 12 client tests, the build, and
three authentication browser scenarios on each frontend server before edits.
After implementation, all 17 client tests and all seven Chromium scenarios passed
on both dev and built preview (14 browser executions). The table was exercised
against the persisted 10,000-employee dataset; desktop/mobile screenshots were
inspected. Verification-owned employees, salaries, HR accounts, and sessions were
removed afterward, preserving 10,000 seeded employees and 12,500 salaries.
Final backend checks passed all 137 tests, migrations (nothing pending), model
consistency, static collection, strict OpenAPI validation, production settings,
Gunicorn configuration, and real development/production HTTP startup flows.
No dependencies or backend source changed. No staging or commit was performed.
