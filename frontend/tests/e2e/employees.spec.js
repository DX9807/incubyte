import { expect, test } from '@playwright/test';

const prefix = process.env.ACME_E2E_EMPLOYEE_PREFIX;
if (!prefix) throw new Error('Set a unique ACME_E2E_EMPLOYEE_PREFIX for disposable employee fixtures.');

async function login(page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(process.env.ACME_E2E_USERNAME);
  await page.getByLabel(/^Password/).fill(process.env.ACME_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function choose(page, scope, label, option) {
  await scope.getByRole('combobox', { name: new RegExp(`^${label}`) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function fillEmployee(page, suffix, country = 'India') {
  const dialog = page.getByRole('dialog', { name: 'Add employee', exact: true });
  await dialog.getByRole('textbox', { name: 'Employee code', exact: true }).fill(`${prefix}-${suffix}`);
  await dialog.getByRole('textbox', { name: 'Full name', exact: true }).fill(`Employee ${prefix}-${suffix}`);
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill(`${prefix}-${suffix}@example.com`);
  await dialog.getByRole('textbox', { name: 'Job title', exact: true }).fill('Software Engineer');
  await choose(page, dialog, 'Department', 'Engineering');
  await choose(page, dialog, 'Country', country);
  await dialog.getByRole('textbox', { name: /^Annual salary/ }).fill('125000.25');
  return dialog;
}

async function rowsLoaded(page) {
  await expect(page.getByRole('progressbar', { name: 'Loading employees' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Employees', exact: true })).toBeVisible();
}

test('10000-employee list uses server pagination, combined filters, search and restored URLs', async ({ page }) => {
  await login(page);
  const first = page.waitForResponse(response => new URL(response.url()).pathname === '/api/employees/' && response.status() === 200);
  await page.goto('/employees');
  const initial = await (await first).json();
  expect(initial.count).toBeGreaterThanOrEqual(10000);
  expect(initial.results).toHaveLength(50);
  await rowsLoaded(page);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(51);
  const next = page.waitForResponse(response => new URL(response.url()).searchParams.get('page') === '2');
  await page.getByRole('button', { name: 'Go to next page' }).click();
  const second = await (await next).json();
  expect(second.results).toHaveLength(50);
  expect(second.results[0].id).not.toBe(initial.results[0].id);
  await expect(page).toHaveURL(/page=2/);
  await choose(page, page, 'Country', 'India');
  await expect(page).not.toHaveURL(/page=2/);
  await choose(page, page, 'Department', 'Engineering');
  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/employees/' && url.searchParams.get('is_active') === 'true';
  });
  await choose(page, page, 'Status', 'Active');
  const filteredData = await (await filtered).json();
  expect(filteredData.results.length).toBeGreaterThan(0);
  expect(filteredData.results.every(employee => employee.country === 'IN' && employee.department_name === 'Engineering' && employee.is_active)).toBe(true);
  const selected = filteredData.results[0];
  await page.getByRole('textbox', { name: 'Search employees' }).fill(selected.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  const listUrl = page.url();
  await page.getByRole('link', { name: selected.full_name, exact: true }).click();
  await expect(page.getByRole('heading', { name: selected.full_name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: selected.full_name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to employees' }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole('textbox', { name: 'Search employees' })).toHaveValue(selected.email);
  await page.getByRole('textbox', { name: 'Search employees' }).fill('no-matching-employee-unique');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No employees found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await rowsLoaded(page);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(51);
  await page.screenshot({ path: '/tmp/acme-phase9-employees.png', fullPage: true });
});

test('create, detail, immutable fields, profile edit and deactivation preserve initial salary', async ({ page }) => {
  await login(page);
  await page.goto('/employees');
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = await fillEmployee(page, 'CRUD', 'United States');
  const created = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/employees/');
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  const employee = await (await created).json();
  expect(employee.currency).toBe('USD');
  expect(employee.annual_salary).toBe('125000.25');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: employee.full_name, exact: true }).click();
  await expect(page.getByRole('heading', { name: employee.full_name, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current salary', exact: true }).getByText('USD 125,000.25', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit employee', exact: true });
  await expect(edit.getByRole('textbox', { name: 'Country', exact: true })).toHaveAttribute('readonly', '');
  await expect(edit.getByRole('textbox', { name: 'Current annual salary', exact: true })).toHaveAttribute('readonly', '');
  const renamed = `Updated ${prefix}-CRUD`;
  await edit.getByRole('textbox', { name: 'Full name', exact: true }).fill(renamed);
  await edit.getByRole('textbox', { name: 'Job title', exact: true }).fill('Senior Engineer');
  await choose(page, edit, 'Department', 'Finance');
  const updated = page.waitForRequest(request => request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/employees/${employee.id}/`);
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  const patch = (await updated).postDataJSON();
  expect(patch).not.toHaveProperty('country');
  expect(patch).not.toHaveProperty('annual_salary');
  expect(patch).not.toHaveProperty('currency');
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
  await expect(page.getByText('Finance', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/acme-phase9-details.png', fullPage: true });
  await page.getByRole('button', { name: 'Deactivate employee', exact: true }).click();
  await page.getByRole('dialog', { name: 'Deactivate employee?' }).getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reactivate employee', exact: true })).toBeVisible();
  await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
  const history = await (await page.request.get(`/api/employees/${employee.id}/salaries/`)).json();
  expect(history).toHaveLength(1);
  expect(history[0].annual_salary).toBe('125000.25');
  await page.getByRole('link', { name: 'Back to employees' }).click();
  await rowsLoaded(page);
  await page.getByRole('textbox', { name: 'Search employees' }).fill(employee.employee_code);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(employee.employee_code);
  await choose(page, page, 'Status', 'Active');
  await expect(page.getByText('No employees found', { exact: true })).toBeVisible();
  await choose(page, page, 'Status', 'Inactive');
  await expect(page.getByRole('link', { name: renamed, exact: true })).toBeVisible();
});

test('client and server validation, failed saves and pending-submit protection keep dialog data', async ({ page }) => {
  await login(page);
  const department = (await (await page.request.get('/api/departments/')).json())[0].id;
  const csrf = (await (await page.request.get('/api/csrf/')).json()).csrfToken;
  const seed = await page.request.post('/api/employees/', { headers: { 'X-CSRFToken': csrf }, data: {
    employee_code: `${prefix}-DUP`, full_name: 'Duplicate fixture', email: `${prefix}-original@example.com`,
    department, country: 'IN', job_title: 'Engineer', annual_salary: '1000000.00',
  } });
  expect(seed.status()).toBe(201);
  await page.goto('/employees');
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = await fillEmployee(page, 'DUP');
  await dialog.getByRole('textbox', { name: /^Annual salary/ }).fill('0');
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(dialog.getByText('Salary must be greater than zero.')).toBeVisible();
  await dialog.getByRole('textbox', { name: /^Annual salary/ }).fill('1000000.01');
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(dialog.getByText(/employee with this employee code already exists/i)).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Employee code', exact: true }).fill(`${prefix}-SAVE`);
  let submissions = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/employees/', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions++;
    if (submissions === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    await pending;
    await route.continue();
  });
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('unavailable');
  await expect(dialog.getByRole('textbox', { name: 'Employee code', exact: true })).toHaveValue(`${prefix}-SAVE`);
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  release();
  await expect(dialog).not.toBeVisible();
  expect(submissions).toBe(2); // One rejected save plus one successful retry.
});

test('list and department outages recover, missing details are readable, and mobile table stays contained', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.route('**/api/employees/?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/employees');
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await page.unroute('**/api/employees/?*');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await rowsLoaded(page);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(51);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/acme-phase9-mobile.png', fullPage: true });
  await page.route('**/api/departments/', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Department options could not be loaded');
  await expect(page.getByRole('button', { name: 'Add employee', exact: true })).toBeDisabled();
  await page.unroute('**/api/departments/');
  await page.getByRole('button', { name: 'Retry departments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add employee', exact: true })).toBeEnabled();
  await page.goto('/employees/999999999');
  await expect(page.getByRole('heading', { name: 'Employee not found', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to employees' }).click();
  await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible();
});
