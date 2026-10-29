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
