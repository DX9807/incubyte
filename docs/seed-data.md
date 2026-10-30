# Deterministic fictional seed data — Phase 6

Run from the repository root with dependencies installed and PostgreSQL configured:

```bash
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py seed_employees --count 10000 --seed 42
```

Defaults are `--count 10000 --seed 42`. Count must be positive, and seed must be
an integer from 0 to 4294967295. The command uses the configured database; it does
not reset tables or create user accounts. It creates six departments, reusing
existing departments with matching names, and adds fictional active employees.

## Repeatability and existing data

An employee's identity is the seed/index pair. Codes follow `SEED-42-00001` and
emails follow `seed-42-00001@example.com`; names come from Faker. No real employee
records, private salary data, or external data feeds are used. Faker is pinned
because its generated output can change between releases. Profiles and salaries
are generated with a separate random generator for each seed/index pair.

For the same seed, growing count preserves the earlier prefix and adds missing
employees; shrinking count leaves additional employees intact. Rerunning the
same count/seed creates nothing. Different seed values create separate datasets
with different codes and emails; they do not replace the previous seed's data.
Names, countries, department names, job titles, active status, salary amounts,
and effective dates reproduce with pinned dependencies. Database IDs and automatic
creation timestamps reflect insertion time and are not part of that guarantee.

Existing seed employees are skipped when their code/email pair matches, preserving
profile edits and later salary revisions. The command does not repair missing or
manually altered salary history. A reserved seed code with a different email, or
a reserved email used by another employee, aborts without overwriting data.
If a seeded employee's code/email is manually changed, resolve the identity
collision before rerunning that seed. There is no reset/delete option.

All department, employee, and salary writes use one transaction. Even a collision
in a later batch rolls back earlier inserts from that invocation. Employees are
inserted in batches of 500, with PostgreSQL returning parent IDs for batched salary
inserts. Generated values are controlled by fixed mappings and validated by tests
and database constraints; bulk insertion avoids per-record model validation queries.

## Dataset choices

A fixed, spread-out 20-employee country cycle yields the following exact counts
for 10,000 employees. Other counts use a prefix of the same cycle, approximating
these percentages while preserving each employee's country across count changes.

| Country | Currency | Employees | Initial annual salary range | Name locale |
| --- | --- | --- | --- | --- |
| India | INR | 4,000 | 300,000–5,000,000 | en_IN |
| United States | USD | 2,500 | 40,000–250,000 | en_US |
| United Kingdom | GBP | 1,500 | 25,000–150,000 | en_GB |
| Germany | EUR | 1,000 | 35,000–160,000 | de_DE |
| Singapore | SGD | 1,000 | 35,000–250,000 | en_GB |

Salary ranges are deliberate synthetic-data choices. Currency comes from the
existing shared country mapping. Singapore uses Faker's English GB name provider;
this pinned Faker release has no `en_SG` locale. Emails remain synthetic and unique
independently of names.

Departments are Engineering, Finance, Human Resources, Sales, Operations, and
Customer Support, each with a small fixed set of corresponding job titles.
Amounts use Decimal and two decimal places, with country-specific increments.
Every employee receives an initial salary dated in 2020–2021. Every fourth
employee receives one later salary dated 365 days afterward, with a 3–15% increase.
These fixed dates, ending in 2022, keep repeated runs independent of today's date
and permit a new revision in the current demo. No future salaries are generated.
For 10,000 employees this means 7,500 have one salary and 2,500 have two: 12,500
salary records total. All generated employees are initially active.

## Verification

```bash
python backend/manage.py test employees.tests.test_seed
python backend/manage.py test config employees compensation
python backend/manage.py seed_employees --count 10000 --seed 42
python backend/manage.py seed_employees --count 10000 --seed 42
```

The second seed invocation should report zero created employees/salaries and
10,000 skipped employees. Existing unrelated employees are additional to this
seed's count and are never removed. After staff sign-in, inspect `/api/employees/`
and the three `/api/analytics/` endpoints for each supported country. In an empty
database, the overview employee counts match the table above; department and
distribution counts agree with each country's overview. Historical salaries
are not double-counted.

Tests cover the full 10,000-row dataset, field and currency validity, reproducible
business data, repeat runs and extensions, preservation of edits, invalid inputs,
transaction rollback on early/late failures, bounded query counts, and employee
and analytics API compatibility.

Phase 6 verification completed with all 111 tests passing. The configured local
database was seeded with `--count 10000 --seed 42`: 10,000 employees and 12,500
salaries were created. The second invocation created zero rows and skipped all
10,000 employees. The database contained exactly 10,000 employees afterward,
with the country distribution in the table above. Employee pagination and all
three analytics endpoints passed against the persisted dataset for every country.
