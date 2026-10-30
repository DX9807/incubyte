# AI usage

Codex assisted with repository inspection, requirements framing, configuration,
implementation, documentation, and command execution for Phase 1. Inputs were
the supplied assessment PDF and master implementation prompt. The assessment
defines the deliverables; the prompt supplies the chosen MVP and phase boundaries.

The user explicitly authorized Phase 1 only, required minimal incremental changes,
actual migration/test/startup results, and a meaningful commit. Existing source
and Git history were inspected before edits. No business models or frontend were
introduced. Verification results and environmental limitations are reported at
phase completion; later phases require a new instruction.

For Phase 2 the user authorized only database models and Django Admin. Codex
inspected the updated repository, preserved the user's `python-dotenv` change,
installed its existing declared dependency, reran Phase 1 tests, and applied
previously unapplied built-in migrations to the configured database before adding
business models. Generated migrations and PostgreSQL tests verify constraints and
Admin behavior, including atomic initial salary creation and read-only history.
The first test run caught an error attaching validation to a read-only Admin
field; it was corrected and the suite rerun. No new dependencies, REST APIs, or
frontend code were introduced in Phase 2.

Phase 3 was explicitly limited to employee REST APIs. The user prohibited Git
commits, overriding the master prompt's per-phase commit instruction. Codex
inspected the clean repository and public OpenAPI configuration, verified all 33
existing tests, and added API serializers, views, routing, tests, and contracts.
The first API test run caught empty-filter handling and a CSRF test setup issue;
both were corrected. A final regression test also verifies DRF's browsable form
with its hidden CSRF field. All 60 tests passed, including 27 new API tests.
Tests exercise
real database constraints/transactions and session CSRF handling, and measure
page query counts. No business models, migrations, dependencies, salary revision
endpoints, or frontend were introduced.

Phase 4 was authorized only for salary revision/history APIs, with no agent Git
commit. Codex inspected the clean repository and reran all 60 existing tests
before adding the revision service, serializers, views, routes, and focused tests.
The implementation reuses model validation and preserves the existing schema,
Admin restrictions, employee endpoints, and public documentation. Tests use real
PostgreSQL transactions and independent connections to verify row locking and
revalidation after concurrent commits, plus API validation, history preservation,
and rollback after an inserted record. No analytics, new dependencies, model
changes, or frontend were added.

Final Phase 4 verification passed all 78 tests, migration consistency checks,
static collection, OpenAPI validation, production settings checks, and
development/Gunicorn HTTP smoke checks. Changes remain uncommitted.

Phase 5 was explicitly limited to salary analytics, with no auto commit. Codex
inspected the clean repository and verified all 78 existing tests before coding.
The three reports use PostgreSQL aggregations, the existing country mapping,
and a shared latest-effective-salary query. Fixed country bands and empty-result
semantics are documented as MVP decisions. Added deterministic tests cover
financial calculations, country/currency isolation, history and revision behavior,
inactive employees, boundary amounts, rounding, permissions, and query counts.
No new model, migration, dependency, seed command, or frontend was introduced.

Final Phase 5 verification passed all 98 tests, including 20 analytics tests and
the existing PostgreSQL concurrency tests. Migration consistency, static files,
OpenAPI validation, production settings, development/Gunicorn HTTP checks, and
dependency/compilation checks passed. No Git staging or commit was performed.

For Phase 6, the user requested only deterministic seeding and explicitly carried
the no-auto-commit preference into future prompts. Codex inspected the clean
repository, verified all 98 baseline tests, installed and pinned the master
prompt's Faker dependency, and added the batched management command and tests.
Local package inspection found no `en_SG` provider, so Singapore uses English GB
names as a documented synthetic-data choice. Seed/index identities, fixed dates,
and per-employee generators preserve reproducibility across count changes. The
13 seed tests passed, including actual creation of 10,000 employees and 12,500
salary records, preservation of existing edits, rollback, and analytics checks.
No models, migrations, API behavior, authentication endpoints, or frontend were
added. No staging or commit is performed by the agent.

Final Phase 6 verification passed all 111 tests, migration consistency, static
collection, strict schema validation, dependency/compilation checks, production
settings, development/Gunicorn startup, and HTTPS redirection. The previous
temporary verification script was no longer present, so it was recreated and
the checks executed successfully. The local database was populated with 10,000
employees and 12,500 salaries; an immediate rerun created nothing. Pagination
and all country analytics were exercised against the persisted data. No public
deployment, staging, or commit was performed.

Phase 7 was limited to backend authentication/release. Codex inspected the clean
repository and verified all 111 existing tests before edits. Existing session,
staff, CSRF, PostgreSQL, and static configuration was retained. Added login/logout,
identity, a small anonymous CSRF bootstrap, secure HR-user provisioning, and a
Gunicorn release config. Login CSRF was tested explicitly, including anonymous
requests and token rotation. Official Django and Render documentation and local
framework source informed the implementation and release runbook. Provider
credential names were checked without exposing their values; no hosting access
or target service was configured, so no public deployment was attempted.
The user's standing no-auto-commit instruction remains in force. No frontend,
new business models, migrations, or dependencies were introduced.

Final Phase 7 verification passed all 135 tests, static/schema/migration checks,
production settings checks, and Gunicorn config validation. Real HTTP flows were
verified on the development server and production-configured Gunicorn with a
simulated trusted HTTPS proxy. The first HTTP run used an incorrect JSON Accept
header for HTML documentation; the verification client was corrected and HTTP
checks rerun successfully without repeating the already-passing full suite.
Temporary HR accounts, employees, salary rows, and sessions were cleaned up;
the 10,000-employee/12,500-salary seeded dataset remained intact. Backend work
stopped before Phase 8; hosting access remains the public-deployment blocker.

A login follow-up exposed a Swagger integration defect: the generated manual
X-CSRFToken parameter could coexist with the UI's automatic X-CSRFTOKEN header,
which browsers combine into an invalid-length value. Codex removed those manual
parameter fields and configured a same-origin interceptor that normalizes header
names and reads the current CSRF cookie on each write. The rendered Swagger JS
was executed in Node with browser-compatible Headers to reproduce the 130-character
combined value and verify the fix, rotation handling, and cross-origin isolation.
All 26 authentication/provisioning tests passed, including two new Swagger
regressions; schema validation passed. Backend CSRF enforcement stayed enabled.
No Git staging or commit was performed.

Phase 8 was explicitly limited to React setup, login, and layout. After inspecting
the clean repository and passing all 137 backend tests, Codex used the Sites skill's
local workflow for frontend implementation and browser verification. The user
confirmed that React must remain a separate app and be hosted separately, with
backend source unchanged. React/Vite, Material UI/Emotion, and React Router were
installed and pinned; Playwright is test-only. No Site registration, publication,
or helper-owned Git synchronization was used, preserving the no-auto-commit rule.

Added a CSRF-aware Fetch client, session context, login/error/loading states,
protected routes, responsive layout, and explicit navigation placeholders. API
tests verify header/token handling and error cases. Chromium checks use temporary
HR credentials against the actual Django API and both Vite dev and built preview.
The initial browser selectors were corrected for Material UI's required-field
label markers; the UI itself rendered correctly. All three scenarios then passed
on both servers. No later-phase screens or backend source changes were added.

Final Phase 8 checks passed clean npm ci, 12 Node API-client tests, the Vite build,
and three Chromium scenarios on each of dev and production preview. Screenshots
were visually inspected. All 137 backend tests and migration/static/schema/
deployment/Gunicorn/HTTP checks passed again. Verification fixtures were removed,
seeded records were preserved, and Git confirmed no backend source changes.
The separate frontend deployment contract and exact run commands are documented.
No publication, staging, or commit was performed.


Phase 9 was limited to employee management UI. Codex inspected the repository,
master requirements, and API contracts, then verified the existing 137 backend
and 12 client tests, build, and three authentication browser scenarios on dev
and preview before editing. Added employee API helpers, an abortable department
lookup, explicit create/edit dialog, listing and details pages, and focused
client/browser tests. No backend source, dependencies, salary history/revision,
or analytics screens were added.

All 17 client tests and seven browser scenarios passed on both frontend servers.
Real API checks covered pagination over 10,000 employees, combined filters,
creation, restricted profile PATCH, deactivation with initial-salary retention,
validation, request failures/retries, and pending controls. Screenshot review
led to a bounded table with sticky headers and compact row actions. Only
verification-prefixed fixtures and temporary authentication records were removed;
10,000 seeded employees and 12,500 salaries remained intact. Separate hosting
and the standing prohibition on automatic staging/commits were preserved.
Final backend verification passed all 137 tests, migrations/model consistency,
static/schema validation, production settings, Gunicorn configuration, and real
development/production HTTP checks. No public deployment was performed.


Phase 10 was limited to salary management UI. Codex inspected the clean Phase 9
repository and master/API requirements, then verified 137 backend tests, 17 client
tests, the production build, and seven browser scenarios on each frontend server
before implementation. Reused the current salary card, existing CSRF-aware Fetch
client, and employee refresh path; added a small salary API/validation module,
history component, and explicit revision dialog. No backend source, dependency,
analytics, or later-phase feature was added.

Added six client tests and two browser scenarios. Real API writes on a uniquely
prefixed historical fixture verify append-only history, increases/decreases,
concurrent stale-history validation, current salary refresh, readonly currency,
failed-save retention/retry, and pending-submit protection. The browser selector
for the required date label was corrected after an initial timeout; the final
nine scenarios passed on both dev and preview. The initial Gunicorn HTTP check
used a JSON Accept header on HTML docs; that verification client was corrected,
and HTTP checks rerun without repeating the already-passing backend suite.

Final checks passed all 23 client and 137 backend tests, the build, migrations,
model consistency, static/schema validation, production settings, Gunicorn
configuration, and actual production HTTP auth/salary flows. Screenshots were
inspected. Verification-owned employee/salary/user/session records were removed;
10,000 seeded employees and 12,500 salaries remained intact. No public deployment,
Git staging, or commit was performed; work stopped before the dashboard phase.


Phase 11 was limited to the compensation dashboard. Codex inspected the clean
repository, master phase requirements, and existing analytics contracts before
coding. Baseline verification passed 23 client tests, all 137 backend tests,
the production build, and nine browser scenarios on each frontend server.
Reused authentication, the Fetch client, country mapping, and separate hosting.
Added the dashboard, a small analytics loader, and two Recharts charts. Recharts
3.10.1 and react-is 19.3.1 are pinned as required chart/peer dependencies; official
Recharts guidance and package peer metadata informed responsive sizing.

Django remains responsible for all aggregation. Country-scoped reports load
together, financial strings stay intact, and cancellation/currency checks prevent
stale or mixed-country views. Charts compare department average salary and counts
per backend salary band; exact values are also accessible in disclosure tables.
Four client tests and four browser scenarios verify the report contract, all five
countries, chart values, empty/error states, switching during pending requests,
and refreshed analytics after revising a verification-owned active GB employee.

The first browser run caught an incorrect test expectation when reselecting the
already-selected default country and an existing employee test racing navigation
and filter application. Test synchronization/expectations were corrected without
changing employee application behavior. All 13 scenarios then passed on dev and
production preview. Screenshot review led to angled distribution labels for
mobile readability. The chart dependency initially pushed the application chunk
over Vite's warning threshold; extending its existing vendor chunks resolved it.

Clean npm ci, all 27 client tests, the production build, and all 137 backend
tests passed. Migrations had nothing pending; model consistency, static files,
strict schema validation, production checks, and Gunicorn configuration passed.
Actual production HTTP checks verified analytics for every supported country,
auth/CSRF, salary flows, static/docs, and readiness/HTTPS behavior. Backend source
remained unchanged. Temporary verification fixtures were removed, preserving the
existing seeded dataset, including its pre-existing additional salary record.
No public deployment, Phase 12 work, Git staging, or commit was performed.
After the final mobile chart adjustment and clean install, all four dashboard
browser scenarios passed again on both servers, and the updated screenshot was
inspected. Temporary fixtures were removed and baseline seed counts preserved.
