# ACME Salary Management frontend — Phases 8–11

A separate React/Vite application using Material UI, React Router, and native
Fetch. The Django backend source is unchanged. Login, logout, identity/session
checks, protected routes, responsive layout, and navigation work against the
existing APIs. Employee listing, creation, profile editing, details, and active
status management are implemented. Employee details also show salary history
and support dated salary revisions. The compensation dashboard shows country
summary metrics, department comparisons, and salary distribution using Recharts.

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
read -r -p 'Unique disposable employee fixture prefix (max 20 characters): ' ACME_E2E_EMPLOYEE_PREFIX
export ACME_E2E_USERNAME ACME_E2E_PASSWORD ACME_E2E_EMPLOYEE_PREFIX
# From frontend/: prepare historical fixtures for salary/dashboard scenarios.
../.venv/bin/python ../backend/manage.py shell <<'PYFIXTURE'
import os
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from employees.models import Department, Employee
from compensation.models import SalaryRecord

prefix = os.environ['ACME_E2E_EMPLOYEE_PREFIX']
assert 1 <= len(prefix) <= 20
with transaction.atomic():
    employee = Employee(
        employee_code=prefix + '-SALARY', full_name='Salary revision fixture',
        email=prefix + '-salary@example.com', country='US',
        department=Department.objects.get(name='Engineering'),
        job_title='Engineer', is_active=False,
    )
    employee.full_clean()
    employee.save()
    for days, amount in [(30, '100000.00'), (15, '125000.25')]:
        record = SalaryRecord(employee=employee, annual_salary=amount,
                              effective_from=timezone.localdate() - timedelta(days=days))
        record.full_clean()
        record.save()
    dashboard_employee = Employee(
        employee_code=prefix + '-DASH', full_name='Dashboard revision fixture',
        email=prefix + '-dash@example.com', country='GB',
        department=Department.objects.get(name='Engineering'),
        job_title='Engineer', is_active=True,
    )
    dashboard_employee.full_clean()
    dashboard_employee.save()
    record = SalaryRecord(employee=dashboard_employee, annual_salary='50000.00',
                          effective_from=timezone.localdate() - timedelta(days=30))
    record.full_clean()
    record.save()
PYFIXTURE
npm run test:e2e
unset ACME_E2E_USERNAME ACME_E2E_PASSWORD ACME_E2E_EMPLOYEE_PREFIX
```

Tests use `http://127.0.0.1:5173` by default. Set `ACME_E2E_BASE_URL` to the preview
or separately hosted frontend URL to test the production build. Thirteen scenarios
verify authentication, pagination, combined filters/search, create/edit, profile
PATCH restrictions, deactivation with salary retention, validation, request
failures/retries, pending controls, deep links, salary history/revisions, stale
revision validation, retained records, same-day restrictions, all-country dashboard
values/charts, error/empty states, rapid country changes, post-revision analytics,
and mobile layout. Failed
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

Salary history/revision was added in Phase 10 below; analytics screens remain pending.

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


## Salary management — Phase 10

Open an employee's details to view current annual salary and the history table,
ordered by effective date newest first. Click **Revise salary**, enter a positive
annual amount and effective date, then **Save revision**. Currency is read-only
and derived by Django from country. Decreases are allowed; dates must be later
than the latest salary and no later than today in UTC. Same-day initial salaries
cannot be revised again that day. This also applies to inactive employees.

The form validates amount precision/range and calendar/date rules, displays
server field/non-field errors, retains entered values after failure, and blocks
duplicate submissions and dialog dismissal while saving. Django remains the
source of truth if another HR user has changed history since it was loaded.
Successful revisions reload current salary and history. Historical records have
no edit/delete controls. History has independent loading, error/retry, and empty
states; revisions are unavailable when history is missing or cannot be loaded.

The browser salary fixture above deliberately uses historical dates through
trusted ORM setup in the disposable database, since the employee creation API
always dates an initial salary today. Each browser run mutates this fixture;
use a fresh prefix and recreate it for dev and preview runs separately. To run
only the existing auth/employee scenarios without the historical fixture, use
`npm run test:e2e -- auth.spec.js employees.spec.js`.


## Phase 10 verification results

Before edits, all 137 backend tests, 17 client tests, the production build, and
seven browser scenarios on each of dev and preview passed. Final verification
passed 23 client tests and all nine Chromium scenarios on both frontend servers
(18 successful browser executions). Desktop/mobile screenshots were inspected.
The revision scenario exercised real API writes on a disposable inactive employee,
including a concurrent stale-history rejection, salary increase/decrease,
retained original rows, same-day blocking, and refreshed detail/list values.

All 137 backend tests passed again. Migrations ran with nothing pending; no model
changes were detected. Static collection, strict OpenAPI validation, strict
production settings checks, and Gunicorn configuration passed. Actual Gunicorn
HTTP checks verified readiness, HTTPS redirect, docs/static assets, anonymous
CSRF rejection, staff login, salary revision/history, updated current salary,
and logout invalidation behind a simulated trusted HTTPS proxy. Temporary HR,
employee, salary, and session fixtures were removed; 10,000 seeded employees and
12,500 salaries were preserved. Backend source and dependencies are unchanged.
No public deployment, staging, or commit was performed.


## Compensation dashboard — Phase 11

Dashboard defaults to India. Select India, United States, United Kingdom,
Germany, or Singapore; the country is retained in the URL for refresh/deep links
(e.g. `/dashboard?country=GB`). There is no combined-country view or currency
conversion. The cards show active employees with current salaries, total/average
annual base salary, and minimum/maximum salary in the selected country's currency.
Employees without an eligible salary and inactive employees are excluded by the
existing backend report rules.

The department bar chart compares **average annual base salary**; the distribution
histogram counts employees in Django's five fixed country-specific salary bands.
Open **View department values** or **View salary band values** for exact values.
Charts use compact axis labels and tooltips, with currency stated in their titles.
Django calculates all aggregates; the client does not download/aggregate employees.
Money stays as returned decimal strings for cards, table values, and money tooltips;
numeric copies are used only for chart coordinates.

The three reports load together. Loading hides old-country figures, report
failures offer retry, currency mismatches are rejected, and countries with no
eligible employees show zero total/count with unavailable salary statistics.
Obsolete requests are canceled/ignored during country changes. **Refresh** reloads
the selected country; returning from employee details also fetches fresh reports,
so salary revisions appear on the next dashboard load. Re-select the country if
returning via the sidebar's default `/dashboard` link. No polling or client cache
is added.

Recharts 3.10.1 is the chart dependency required by the master prompt; its
react-is peer is pinned to 19.3.1 to match React. The chart bundle is split from
the app using the existing Vite chunk configuration. Frontend hosting stays
separate, with the same API proxy and SPA fallback described above.

The browser fixture setup now creates an inactive US salary-history fixture and
an active GB dashboard fixture with a historical GBP 50,000 salary. The dashboard
scenario revises only its prefixed GB fixture through the UI to verify fresh
metrics/charts. Each full browser run needs a new prefix and both fixtures;
restore the disposable database or remove only verification-owned records afterward.


## Phase 11 verification results

Baseline checks passed all 23 client and 137 backend tests, the build, and nine
browser scenarios on each frontend server. After implementation, clean npm ci,
all 27 client tests, and the production build passed without chunk-size warnings.
All 13 Chromium scenarios passed on both dev and built preview (26 executions),
including all five countries, comparison of every card/department/band value to
real API responses, responsive charts, deep-link refresh, error/retry/empty data,
late responses after country changes, and refreshed analytics after a UI salary
revision on a disposable active GB fixture. Desktop/mobile screenshots were
inspected; mobile salary-band labels were angled for readability.
After that adjustment and the clean install, all four dashboard scenarios passed
again on both dev and preview; the updated mobile screenshot was inspected.

All 137 backend tests passed again. Migrations had nothing pending; no model
changes were detected. Static collection, strict schema validation, strict
production checks, Gunicorn configuration, and real Gunicorn HTTP checks passed.
The production HTTP checks included all three analytics reports for all five
countries, auth/CSRF, salary revisions, readiness, docs/static, and HTTPS redirect
behind a simulated trusted HTTPS proxy. Temporary fixtures were removed while
preserving the baseline's 10,000 seeded employees and 12,501 salaries (including
one pre-existing revision). Backend source is unchanged. No public deployment,
Git staging, or commit was performed; Phase 12 remains unstarted.
