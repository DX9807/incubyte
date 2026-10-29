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
