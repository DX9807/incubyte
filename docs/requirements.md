# ACME Salary Management — MVP requirements

## Goal and user
Replace spreadsheets used by ACME's HR Manager to manage compensation for
10,000 employees across multiple countries. Provide a secure web application
for maintaining salary data and answering clear questions about employee pay.

## Assessment deliverables
Deliver a functional backend and React UI with a relational database, a seed
script for 10,000 fictional employees, a verified public deployment, and a video
demonstration. Include fast, deterministic tests of core behavior, meaningful
incremental Git commits, and useful design, trade-off, and AI usage artifacts.
This document precedes business implementation.

## Chosen MVP scope
- Staff HR users sign in and manage employees: list, search, filter by department,
  country and active status, view details, create, edit, and deactivate.
- Employee profiles include unique code and email, full name, department,
  country, job title, active status, and creation time.
- Create every employee with a positive annual base salary in their country's
  currency. Preserve salary history through dated revisions. Revisions must
  follow the latest record's date and cannot be in the future. Use decimal money
  values and atomic writes, including concurrent revision protection.
- Report active employee counts, current salary totals, averages, minimums,
  maximums, department comparisons, and salary bands for a selected country.
  Never combine different currencies in monetary metrics.
- Seed reproducible fictional data; paginate employee lists on the server.

## Assumptions and exclusions
These are selected product decisions, not additional assessment mandates.
Use Python 3.12, Django 5.2 LTS, DRF, PostgreSQL, and later React/Vite with
Material UI and Recharts. Django staff accounts represent HR; use session
authentication and CSRF protection. Initially support India, the US, the UK,
Germany, and Singapore, with fixed country-to-currency mappings. Employees
retain history after deactivation; country and currency cannot change.
Exclude payroll execution, taxes, benefits, exchange-rate conversions, employee
self-service, future revisions, backdated corrections, country transfers, and
custom report builders. These add complexity beyond salary management and
country-specific compensation insights. Use one application and one database.

## Success criteria and delivery sequence
HR can manage employees and salary revisions and obtain accurate, currency-safe
summaries over 10,000 seeded employees. Authentication protects salary data;
tests demonstrate validation, history, transactions, analytics, and permissions.
The complete application is deployed and demonstrated with documented setup.
Implement one master-prompt phase at a time: backend first, UI after Phase 7.
Phase 1 delivers only this scope document, a runnable PostgreSQL-backed Django
project, Admin, database-aware health endpoint, tests, and deployment instructions.
