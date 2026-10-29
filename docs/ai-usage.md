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
