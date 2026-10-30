"""Run real browser integration checks with verification-owned fixtures only.

Run with the configured virtualenv from repository root, after migrations,
collectstatic, seeding 10,000 employees, npm ci, and npm run build.
Use a local/demo database. --record-demo also records the built application's UI.
"""

import argparse
from datetime import timedelta
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.update(DJANGO_SETTINGS_MODULE='config.settings', DJANGO_DEBUG='true',
                  DJANGO_ALLOWED_HOSTS='127.0.0.1,localhost')

import django  # noqa: E402
django.setup()
from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.sessions.models import Session  # noqa: E402
from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402
from compensation.models import SalaryRecord  # noqa: E402
from employees.models import Department, Employee  # noqa: E402


def free_port():
    with socket.socket() as connection:
        connection.bind(('127.0.0.1', 0))
        return connection.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record-demo', action='store_true')
    options = parser.parse_args()
    if Employee.objects.filter(employee_code__startswith='SEED-42-').count() != 10000:
        raise SystemExit('Seed exactly 10,000 seed-42 employees in this demo database first.')
    if not (ROOT / 'frontend/dist/index.html').exists():
        raise SystemExit('Run npm run build in frontend/ first.')
    department = Department.objects.get(name='Engineering')
    prefix = 'QA-' + secrets.token_hex(5)
    password = secrets.token_urlsafe(24)
    user = get_user_model().objects.create_user(username=prefix, password=password, is_staff=True)
    seeded_counts = (Employee.objects.filter(employee_code__startswith='SEED-42-').count(),
                     SalaryRecord.objects.filter(employee__employee_code__startswith='SEED-42-').count())
    output = ROOT / 'artifacts'
    output.mkdir(exist_ok=True)
    processes, logs = [], []

    def start(command, name, cwd=ROOT, extra=None):
        log = (output / f'{name}.log').open('w')
        logs.append(log)
        process = subprocess.Popen(command, cwd=cwd, env={**os.environ, **(extra or {})},
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(process)
        return process

    def ready(url, process):
        for _ in range(150):
            if process.poll() is not None:
                raise RuntimeError(f'Server exited; see artifacts/*.log: {url}')
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    if response.status == 200:
                        return
            except OSError:
                pass
            time.sleep(0.2)
        raise RuntimeError(f'Server readiness timed out: {url}')

    def fixture(code, country, active, salaries):
        with transaction.atomic():
            employee = Employee(employee_code=code, full_name=f'Demo employee {code}',
                                email=f'{code}@example.com', department=department,
                                country=country, job_title='Software Engineer', is_active=active)
            employee.full_clean()
            employee.save()
            for days, amount in salaries:
                salary = SalaryRecord(employee=employee, annual_salary=amount,
                                      effective_from=timezone.localdate() - timedelta(days=days))
                salary.full_clean()
                salary.save()

    try:
        backend_port = free_port()
        backend = start([sys.executable, 'backend/manage.py', 'runserver',
                         f'127.0.0.1:{backend_port}', '--noreload'], 'browser-backend')
        ready(f'http://127.0.0.1:{backend_port}/api/health/', backend)
        for target in ['dev', 'preview']:
            target_prefix = f'{prefix}-{target[0]}'
            fixture(target_prefix + '-SALARY', 'US', False, [(30, '100000.00'), (15, '125000.25')])
            fixture(target_prefix + '-DASH', 'GB', True, [(30, '50000.00')])
            port = free_port()
            frontend = start(['npm', 'run', target, '--', '--port', str(port)],
                             f'browser-{target}', ROOT / 'frontend',
                             {'ACME_API_PROXY_TARGET': f'http://127.0.0.1:{backend_port}'})
            ready(f'http://127.0.0.1:{port}', frontend)
            env = {**os.environ, 'ACME_E2E_BASE_URL': f'http://127.0.0.1:{port}',
                   'ACME_E2E_USERNAME': prefix, 'ACME_E2E_PASSWORD': password,
                   'ACME_E2E_EMPLOYEE_PREFIX': target_prefix}
            subprocess.run(['npm', 'run', 'test:e2e'], cwd=ROOT / 'frontend', env=env, check=True)
            print(f'{target}: all browser scenarios passed', flush=True)
            if options.record_demo and target == 'preview':
                fixture(target_prefix + '-DEMO', 'GB', True, [(30, '50000.00')])
                subprocess.run(['node', 'scripts/record-demo.mjs'], cwd=ROOT / 'frontend',
                               env=env, check=True)
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
        for log in logs:
            log.close()
        with transaction.atomic():
            SalaryRecord.objects.filter(employee__employee_code__startswith=prefix).delete()
            Employee.objects.filter(employee_code__startswith=prefix).delete()
            for session in Session.objects.all():
                if session.get_decoded().get('_auth_user_id') == str(user.pk):
                    session.delete()
            user.delete()
        after = (Employee.objects.filter(employee_code__startswith='SEED-42-').count(),
                 SalaryRecord.objects.filter(employee__employee_code__startswith='SEED-42-').count())
        if after != seeded_counts:
            raise RuntimeError(f'Seed counts changed during verification: {seeded_counts} -> {after}')
        print(f'Owned fixtures removed; seed employee/salary counts preserved: {after}', flush=True)


if __name__ == '__main__':
    main()
