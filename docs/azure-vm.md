# Azure VM deployment

The user selected an Azure VM for Phase 12. Use independent services on that VM:
Nginx serves the React build and reverse-proxies API/Admin/static requests to
loopback-only Gunicorn. Django never serves the React bundle. PostgreSQL may be
local to the VM or an existing managed database; confirm which before provisioning.

Public deployment is pending the VM IP/DNS, SSH username/key path, frontend domain,
and database choice. No VM was created or changed by the agent. These are deployment
instructions; local verification results are recorded in [submission.md](submission.md).

## Target and prerequisites

Use a Linux VM with Python 3.12 (Ubuntu 24.04 is a suitable target), SSH access,
sudo, and a DNS name pointing to its public IP. Allow TCP 80/443 in its Azure NSG;
restrict SSH 22 to the operator's IP. Gunicorn 8000 and PostgreSQL 5432 need no
public inbound rule. This release does not provision paid infrastructure.

Review [Azure's Linux VM/SSH guide](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal).
Use [Django's production checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
and the existing [backend runbook](backend-release.md) for settings and account provisioning.

On the VM, install the runtime prerequisites:

```bash
sudo apt-get update
sudo apt-get install python3.12-venv nginx certbot python3-certbot-nginx rsync
sudo useradd --system --create-home --shell /usr/sbin/nologin acme
sudo install -d -o acme -g acme -m 755 /opt/acme-salary
sudo install -d -o acme -g acme -m 750 /etc/acme-salary
```

Create the account/directories only if they do not already exist. For a local
database, install PostgreSQL, then create a LOGIN role and database as described
in README, omitting the test-only CREATEDB privilege. Set its password with
psql's interactive `\password`; keep PostgreSQL bound to localhost. For managed
PostgreSQL, use the provider's hostname, firewall/network access, and TLS CA
settings instead. Do not copy development database credentials to production.

## Build and transfer the reviewed release

On the development machine, run the documented tests and frontend build first.
The VM does not need Node when deploying the already-built `frontend/dist/`.
Replace SSH_USER and VM_HOST with the selected target; use the agreed SSH key.

```bash
cd frontend
npm ci
npm test
npm run build
cd ..
rsync -az --include='.env.example' --exclude='.env' --exclude='.env.*' \
  --exclude='.git' --exclude='.venv' --exclude='venv' --exclude='node_modules' \
  --exclude='__pycache__' --exclude='artifacts' --exclude='test-results' \
  --exclude='playwright-report' --exclude='staticfiles' \
  ./ SSH_USER@VM_HOST:/tmp/acme-release/
```

Use `-e 'ssh -i /path/to/key'` with rsync when a non-default key is required.
This transfers the reviewed working tree, including Phase 12 files that remain
uncommitted at the user's request. It does not transfer Git metadata, secrets,
test recordings, virtualenvs, or development dependencies. It does not delete
remote files. On an existing service, back up the database and current release
before replacing files, and use a maintenance window or versioned release path.

On the VM:

```bash
sudo rsync -a --chown=acme:acme /tmp/acme-release/ /opt/acme-salary/
sudo -u acme python3.12 -m venv /opt/acme-salary/.venv
sudo -u acme /opt/acme-salary/.venv/bin/python -m pip install -r /opt/acme-salary/backend/requirements.txt
sudo install -o acme -g acme -m 600 /opt/acme-salary/backend/.env.example /etc/acme-salary/backend.env
sudo -u acme editor /etc/acme-salary/backend.env
```

Do not rerun the environment-file install over an existing production file.
Set a new secret and real database values. Use shell/systemd-compatible quoted
KEY=value assignments; never put credentials in frontend files or command arguments.
For the domain used in the Nginx example, set:

```text
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=salary.example.com,127.0.0.1
DJANGO_CSRF_TRUSTED_ORIGINS=https://salary.example.com
DJANGO_TRUST_PROXY=true
PORT=8000
WEB_CONCURRENCY=2
```

For local PostgreSQL use its configured local connection/TLS mode. For managed
PostgreSQL use its required TLS mode, usually verify-full with the supplied CA.
Optional HSTS subdomain/preload flags require the domain-wide guarantee described
in README; leave them false otherwise and review the two expected warnings.

## Release, seed and provision access

Open an acme-owned release shell (not the runtime service):

```bash
sudo -u acme /bin/bash
cd /opt/acme-salary
set -a
source /etc/acme-salary/backend.env
set +a
.venv/bin/python backend/manage.py migrate --noinput
.venv/bin/python backend/manage.py migrate --check
.venv/bin/python backend/manage.py makemigrations --check --dry-run
.venv/bin/python backend/manage.py collectstatic --noinput
.venv/bin/python backend/manage.py check --deploy --fail-level ERROR
.venv/bin/python backend/manage.py seed_employees --count 10000 --seed 42
.venv/bin/python backend/manage.py seed_employees --count 10000 --seed 42
.venv/bin/python backend/manage.py create_hr_user --username hr-demo --email hr-demo@example.com
exit
```

Review any warnings. The second seed run must create nothing; existing profiles
and revisions remain intact. Provision the HR account once with an interactive
password. Use a separate administrator account only if Admin model access is needed.
The production role need not create test databases: tests run in the local/demo
environment before release, not against a live production dataset.

Install the service and confirm loopback readiness:

```bash
sudo cp /opt/acme-salary/deploy/acme-salary.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now acme-salary
curl --fail http://127.0.0.1:8000/api/health/
sudo journalctl -u acme-salary --no-pager -n 50
```

The systemd command overrides Gunicorn's default bind to loopback. Nginx replaces
the incoming forwarded scheme at the trusted TLS edge; this is why proxy trust is
enabled. Application code and session/CSRF protection are unchanged.

## HTTPS and frontend routing

First obtain a certificate for the real domain pointing at the VM. With no other
service using port 80, one option is to stop Nginx briefly and use
`sudo certbot certonly --standalone -d salary.example.com`; coordinate this with
any existing VM services. Alternatively use the Nginx plugin with an existing
HTTP server block, following [Certbot's instructions](https://certbot.eff.org/instructions).
The final HTTPS template cannot be loaded until its certificate files exist.

Copy `deploy/nginx.conf.example` into a new file under `/etc/nginx/sites-available/`,
replace every `salary.example.com` and certificate path, enable that site under
`sites-enabled/`, and resolve conflicts with any existing default site. Then:

```bash
sudo -u www-data test -r /opt/acme-salary/frontend/dist/index.html
sudo nginx -t
sudo systemctl restart nginx
sudo certbot renew --dry-run
```

Configure certificate renewal with the selected ACME method; standalone renewal
needs coordinated stop/start hooks or migration to a webroot/Nginx authenticator.
Do not assume an unattended standalone renewal can bind an occupied port 80.
The template implements SPA fallback, real asset 404s, immutable hashed asset
caching, and API/Admin/static proxying. See [Nginx proxy directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

## Verify the actual deployed URL

Check `https://YOUR_DOMAIN/api/health/`, `/login`, and refreshed `/dashboard` and
`/employees/:id` routes; verify hashed assets and missing asset 404s. Sign in with
the provisioned HR account, search/filter/page employees, create/edit a disposable
profile, revise an older salary, inspect retained history and updated country
analytics, then log out and confirm protected data is unavailable. Verify HTTP
redirects, production cookies, docs/Admin assets, and all five currencies.

Record the real frontend/backend health URLs and tested revision in submission.md
only after these checks pass. Run destructive/mutating browser scenarios only on
a dedicated demo database; use the verification runner locally for disposable
fixtures. Retain a database backup and previous application/build revision for
rollback. Do not reverse migrations blindly; inspect their compatibility first.
