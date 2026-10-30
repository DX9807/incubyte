# Demo and reviewer walkthrough

The actual local production-build recording is
`artifacts/demo/acme-salary-management.webm`. It is a silent browser video, not a
public deployment recording. It uses fictional verification-owned data and a
temporary staff account; all fixtures and sessions were removed afterward.
The masked login password is never printed or stored in source.

## Recorded workflow

1. Staff login and UK compensation dashboard.
2. Department comparison and salary distribution.
3. Search a disposable employee with an older salary.
4. Edit the employee job title.
5. Revise annual salary from GBP 50,000 to GBP 140,000.25.
6. Show updated current salary and retained original history.
7. Return to UK analytics and show the refreshed dashboard/charts.
8. Log out and return to the login screen.

The recording is approximately 21 seconds at 1280×800, with presentation pauses.
Use the longer outline below for a narrated assessment demo, including terminal
tests/Git artifacts that are not captured by the browser-only video.

## Suggested narrated demo (4–6 minutes)

| Segment | Show and explain |
| --- | --- |
| Problem and scope | HR manages 10,000 fictional employees across five countries. Annual base salary only; no payroll/tax/FX scope. Open requirements.md. |
| Login/dashboard | Sign in as staff. Select two countries; explain currency separation, active/current-salary eligibility and exact chart values. |
| Employee management | Search by code/email, combine filters, change server page, open details. Create a separate demo employee and edit their role/department. Country and current salary stay read-only during profile edits. |
| Salary revision | Use a seeded/disposable employee with a salary dated before today. Show current amount/history, attempt an invalid date/amount, then append a valid revision. Show previous rows retained. An employee created today cannot receive another salary today. |
| Reporting | Return to the same country dashboard and refresh; show total/department/distribution changes. Deactivate/reactivate a disposable employee if demonstrating eligibility. |
| Tests and design | In a separate terminal run backend tests and `npm test`; show `npm run build`, migration checks, docs/architecture.md, docs/ai-usage.md and `git log --oneline`. Explain real PostgreSQL concurrency and deterministic seeding. |
| Deployment/logout | Show the actual Azure HTTPS URL only after deployment and refresh a deep link; otherwise label the demo local. Log out and show protected data is unavailable. |

## Re-record locally

Follow the setup/build/test steps in [submission.md](submission.md), then run:

```bash
source .venv/bin/activate
python scripts/verify_browser.py --record-demo
```

The runner provisions distinct historical salary/dashboard/video fixtures,
executes all 13 browser scenarios against both frontend servers, then records
only the built preview. It cleans up fixtures even if verification fails.
Recordings and logs are ignored by Git. A failed capture may leave a partial
video; only use a recording after the runner exits successfully.

For a deployed narrated demo, provision a private reviewer account and use
fictional demo data; use an employee's older salary so the same-day rule permits
the revision. Do not show environment files, password text, keys or cloud
credentials. Upload the video to the user's chosen destination and add its real
link to submission.md. No upload or assessment email has been sent.
