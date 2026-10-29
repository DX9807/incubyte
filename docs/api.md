# Employee and Salary Management APIs — Phases 3–4

Business endpoints require an active Django staff session. Sign in at `/admin/`
using the same hostname as the API. Anonymous and non-staff requests return 403.
POST and PATCH require the session's CSRF token in `X-CSRFToken`.
Dedicated login/logout endpoints belong to Phase 7.

Documentation remains public: `/api/schema/`, `/api/docs/` (Swagger UI), and
`/api/redoc/`. Public documentation does not grant access to business data.
The plain Django health view is separate from the generated DRF schema.

| Method | URL | Behavior |
| --- | --- | --- |
| GET | `/api/departments/` | Alphabetical array of `{id, name}` objects. |
| GET | `/api/employees/` | Searchable, filtered, paginated employee list. |
| POST | `/api/employees/` | Atomically create an employee and initial salary. |
| GET | `/api/employees/{id}/` | Profile with current annual salary and currency. |
| PATCH | `/api/employees/{id}/` | Update profile fields or active status. |
| GET | `/api/employees/{id}/salaries/` | Read salary history, newest effective date first. |
| POST | `/api/employees/{id}/salaries/` | Append a dated salary revision. |

Employee DELETE and PUT are unsupported. Department writes remain in Admin.
Salary records cannot be edited or deleted through the API.

## List

| Parameter | Values / behavior |
| --- | --- |
| `search` | Case-insensitive search over full name, email, and employee code using DRF's search filter. |
| `department` | Positive integer department ID; nonexistent IDs produce no matches. |
| `country` | One of `IN`, `US`, `GB`, `DE`, `SG`. |
| `is_active` | Exactly `true` or `false`; omit to include both. |
| `page` | 1-based page number; fixed page size of 50. |

Filters combine with search. Invalid filters, including explicitly empty values,
return field-keyed 400 errors. Out-of-range pages return 404. Results are ordered
by unique employee code for stable pagination.

Example: `/api/employees/?country=IN&is_active=true&search=Aditi&page=1`.

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [{
    "id": 1,
    "employee_code": "EMP-00001",
    "full_name": "Aditi Sharma",
    "email": "aditi@example.com",
    "department": 1,
    "department_name": "Engineering",
    "country": "IN",
    "job_title": "Software Engineer",
    "is_active": true,
    "created_at": "2026-10-29T10:00:00Z",
    "annual_salary": "1200000.00",
    "currency": "INR"
  }]
}
```

Amounts are decimal strings. Current salary is the latest record effective on or
before today in Django's configured UTC timezone. Reads use database subqueries
and a department join, avoiding per-employee queries. Employees staged directly
through ORM without an effective salary return null for salary and currency.
API creation always requires an initial salary.

## Create

POST `/api/employees/` with JSON:

```json
{
  "employee_code": "EMP-00001",
  "full_name": "Aditi Sharma",
  "email": "aditi@example.com",
  "department": 1,
  "country": "IN",
  "job_title": "Software Engineer",
  "annual_salary": "1200000.00"
}
```

All shown fields are required. `is_active` is optional and defaults to true.
Department must exist; employee code and email must be unique. Salary must be
between 0.01 and 999999999999.99 with at most two decimal places. Currency derives
from country and the initial effective date is today. Clients cannot supply
currency, effective date, IDs, or creation timestamps. Unknown fields return
validation errors. Uniqueness remains case-sensitive, as in the database design.

Success returns HTTP 201 and an employee object shaped like a list item above.
Employee and salary writes share one transaction; failed salary validation or
writes leave no employee behind. Normal input errors return HTTP 400 with
field-keyed lists, for example:

```json
{"annual_salary": ["Ensure this value is greater than or equal to 0.01."]}
```

## Update and deactivate

PATCH accepts employee code, full name, email, department ID, job title, and
active status. All are optional, with the same validation as creation.
Country, salary, and currency are read-only; attempts to submit them return 400.

```json
{"job_title": "Senior Software Engineer", "is_active": false}
```

Success returns HTTP 200 and the employee with unchanged current salary. Setting
`is_active` to false retains every salary record; true reactivates the employee.
Missing employee IDs return 404; unsupported methods return 405.

## Verify

```bash
python backend/manage.py test config employees compensation
python backend/manage.py spectacular --validate --fail-on-warn --file /tmp/acme-schema.yaml
```

After signing into Admin, use DRF's browsable `/api/employees/` page or a client
with the same session and CSRF token to exercise creation and PATCH.

## Salary history and revisions — Phase 4

GET `/api/employees/{id}/salaries/` returns an unpaginated array for that employee,
ordered by effective date descending. Each object contains `id`, `employee`
(employee ID), `annual_salary` (decimal string), `currency`, `effective_from`, and
`created_at`. Inactive employees retain their history. Missing employees return
404; an existing employee with no salary records returns an empty array.

POST to the same URL with JSON:

```json
{
  "annual_salary": "1450000.00",
  "effective_from": "2026-10-28"
}
```

The date above is an example and must be later than the employee's latest salary
date and no later than today (UTC). Both fields are required. The amount must be
positive, with at most two decimal places and the same maximum as initial salary.
Salary decreases are allowed. Duplicate dates, backdated corrections, and future
dates are rejected. An employee created today cannot be revised again today.

Currency derives from the employee's country. Clients cannot supply employee ID,
currency, record ID, or creation timestamp in the body; unknown fields return
400. Employee ID comes from the URL. Revisions are also permitted for inactive
employees; active status is unchanged. An employee staged through ORM without
an initial salary cannot be revised: POST returns a `non_field_errors` 400 error.
Create employees and their initial salary through the employee API or Admin.

Success returns HTTP 201 and the new record:

```json
{
  "id": 2,
  "employee": 1,
  "annual_salary": "1450000.00",
  "currency": "INR",
  "effective_from": "2026-10-28",
  "created_at": "2026-10-29T10:00:00Z"
}
```

Existing rows remain unchanged. Employee list/detail responses immediately derive
the revised current salary from history. Validation errors return HTTP 400 with
field-keyed messages, such as `effective_from` for an out-of-order date. GET/POST
require a staff session; POST also requires CSRF protection. DRF's browsable API
form is available after signing into Admin.

The revision service holds an employee row lock until the transaction commits.
Concurrent requests for the same employee serialize and validate against the
latest committed record. For duplicate effective dates, one succeeds and one
returns a validation error. For distinct dates, both succeed only if their commit
order respects the strictly increasing date rule. Requests for different employees
do not share the same employee lock.

PUT, PATCH, and DELETE on the salary collection return 405. No per-record mutation
URLs are exposed. Admin history remains read-only and employee PATCH cannot alter
salary. The service adds no analytics or payroll behavior.
