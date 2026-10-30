import { expect, test } from '@playwright/test';

const prefix = process.env.ACME_E2E_EMPLOYEE_PREFIX;
if (!prefix) throw new Error('Set a unique ACME_E2E_EMPLOYEE_PREFIX and provision its historical SALARY fixture; see frontend/README.md.');
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function login(page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(process.env.ACME_E2E_USERNAME);
  await page.getByLabel(/^Password/).fill(process.env.ACME_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function post(page, path, data) {
  const csrfToken = (await (await page.request.get('/api/csrf/')).json()).csrfToken;
  return page.request.post(path, { headers: { 'X-CSRFToken': csrfToken }, data });
}

test('salary revision retains history, refreshes current salary, validates stale writes and prevents duplicate saves', async ({ page }) => {
  await login(page);
  const found = await (await page.request.get(`/api/employees/?search=${encodeURIComponent(`${prefix}-SALARY`)}`)).json();
  expect(found.count, 'Provision the disposable historical salary fixture described in frontend/README.md').toBe(1);
  const employee = found.results[0];
  const path = `/api/employees/${employee.id}/salaries/`;
  const original = await (await page.request.get(path)).json();
  expect(original).toHaveLength(2);
  expect(original[0].effective_from < day(-2)).toBe(true);
  await page.goto(`/employees/${employee.id}`);
  const table = page.getByRole('table', { name: 'Salary history', exact: true });
  const current = page.getByRole('region', { name: 'Current salary', exact: true });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('USD 125,000.25');
  await expect(table.getByRole('row').nth(2)).toContainText('USD 100,000.00');
  await page.getByRole('button', { name: 'Revise salary', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revise salary', exact: true });
  const amount = dialog.getByRole('textbox', { name: 'Annual salary', exact: true });
  const date = dialog.getByLabel(/^Effective from/);
  const submit = dialog.getByRole('button', { name: 'Save revision', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Currency', exact: true })).toHaveAttribute('readonly', '');
  await expect(dialog.getByRole('textbox', { name: 'Currency', exact: true })).toHaveValue('USD');
  let posts = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === path && request.method() === 'POST') posts++; });
  await amount.fill('0');
  await date.fill(day(-2));
  await submit.click();
  await expect(dialog.getByText('Salary must be greater than zero.')).toBeVisible();
  await amount.fill('130000.001');
  await submit.click();
  await expect(dialog.getByText(/up to 12 integer digits/)).toBeVisible();
  await amount.fill('130000.50');
  await date.fill(original[0].effective_from);
  await submit.click();
  await expect(dialog.getByText('Effective date must be later than the latest salary.')).toBeVisible();
  await date.fill(day(1));
  await submit.click();
  await expect(dialog.getByText('Effective date cannot be in the future (UTC).')).toBeVisible();
  expect(posts).toBe(0);
  await date.fill(day(-2));
  const created = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await submit.click();
  expect((await created).status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  await expect(current).toContainText('USD 130,000.50');
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row').nth(1)).toContainText('USD 130,000.50');

  // Another HR write after the dialog opens makes its loaded history stale.
  await page.getByRole('button', { name: 'Revise salary', exact: true }).click();
  const concurrent = await post(page, path, { annual_salary: '140000.00', effective_from: day(-1) });
  expect(concurrent.status()).toBe(201);
  await amount.fill('120000.75'); // A decrease is valid.
  await date.fill(day(-1));
  await submit.click();
  await expect(dialog.getByText('Effective date must be later than the latest salary.')).toBeVisible();
  await expect(amount).toHaveValue('120000.75');
  await date.fill(day(0));
  let attempts = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    expect(route.request().postDataJSON()).toEqual({ annual_salary: '120000.75', effective_from: day(0) });
    await pending;
    await route.continue();
  });
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText('unavailable');
  await expect(amount).toHaveValue('120000.75');
  await submit.click();
  await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(amount).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).not.toBeVisible();
  expect(attempts).toBe(2);
  await expect(current).toContainText('USD 120,000.75');
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Revise salary', exact: true })).toBeDisabled();
  const history = await (await page.request.get(path)).json();
  expect(history.slice(-2)).toEqual(original);
  expect(history[0].effective_from).toBe(day(0));
  const detail = await (await page.request.get(`/api/employees/${employee.id}/`)).json();
  expect(detail.annual_salary).toBe('120000.75');
  expect(detail.is_active).toBe(false);
  await page.reload();
  await expect(current).toContainText('USD 120,000.75');
  await expect(table.getByRole('row')).toHaveCount(6);
  await page.screenshot({ path: '/tmp/acme-phase10-salary-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to employees' }).click();
  await page.getByRole('textbox', { name: 'Search employees' }).fill(employee.employee_code);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('table')).toContainText('USD 120,000.75');
});

test('same-day initial salary, history retry, empty history and mobile layout remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const department = (await (await page.request.get('/api/departments/')).json())[0].id;
  const response = await post(page, '/api/employees/', {
    employee_code: `${prefix}-TODAY`, full_name: 'Salary today fixture', email: `${prefix}-today@example.com`,
    department, country: 'IN', job_title: 'Engineer', annual_salary: '1000000.00',
  });
  expect(response.status()).toBe(201);
  const employee = await response.json();
  const path = `/api/employees/${employee.id}/salaries/`;
  await page.route(`**${path}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(`/employees/${employee.id}`);
  const region = page.getByRole('region', { name: 'Salary history', exact: true });
  await expect(region.getByRole('alert')).toContainText('unavailable');
  await expect(region.getByRole('button', { name: 'Revise salary', exact: true })).toBeDisabled();
  await page.unroute(`**${path}`);
  await region.getByRole('button', { name: 'Retry history', exact: true }).click();
  await expect(region.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(region.getByText(/no later than today/)).toBeVisible();
  await expect(region.getByRole('button', { name: 'Revise salary', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/acme-phase10-salary-mobile.png', fullPage: true });
  await page.route(`**${path}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.reload();
  await expect(region.getByText(/No salary history available/)).toBeVisible();
  await expect(region.getByRole('button', { name: 'Revise salary', exact: true })).toBeDisabled();
});
