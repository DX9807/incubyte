import { expect, test } from '@playwright/test';

const countries = [
  ['IN', 'India', 'INR'], ['US', 'United States', 'USD'], ['GB', 'United Kingdom', 'GBP'],
  ['DE', 'Germany', 'EUR'], ['SG', 'Singapore', 'SGD'],
];
const money = (amount, currency) => amount == null ? 'Not set' : `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
async function login(page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(process.env.ACME_E2E_USERNAME);
  await page.getByLabel(/^Password/).fill(process.env.ACME_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function choose(page, name) {
  await page.getByRole('combobox', { name: 'Country', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function loaded(page) {
  await expect(page.getByRole('progressbar', { name: 'Loading compensation analytics' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Total annual base salary', exact: true })).toBeVisible();
}
async function reports(page, country) {
  return Promise.all(['overview', 'departments', 'distribution'].map(async report => {
    const response = await page.request.get(`/api/analytics/${report}/?country=${country}`);
    expect(response.status()).toBe(200);
    return response.json();
  }));
}
async function assertOverview(page, data) {
  for (const [label, value] of [
    ['Active employees', data.employee_count.toLocaleString()],
    ['Total annual base salary', money(data.total_annual_salary, data.currency)],
    ['Average annual base salary', money(data.average_annual_salary, data.currency)],
    ['Minimum annual base salary', money(data.min_annual_salary, data.currency)],
    ['Maximum annual base salary', money(data.max_annual_salary, data.currency)],
  ]) await expect(page.getByRole('region', { name: label, exact: true })).toContainText(value);
}

test('all countries show exact backend metrics, department values, bands and real charts', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await page.goto('/dashboard?country=IN');
  for (const [code, name, currency] of countries) {
    await choose(page, name);
    await expect(page).toHaveURL(new RegExp(`country=${code}`));
    await loaded(page);
    const [overview, departments, distribution] = await reports(page, code);
    await assertOverview(page, overview);
    expect(overview.currency).toBe(currency);
    const comparison = page.getByRole('region', { name: 'Department comparison', exact: true });
    const histogram = page.getByRole('region', { name: 'Salary distribution', exact: true });
    for (const region of [comparison, histogram]) {
      await expect(region.locator('svg.recharts-surface')).toBeVisible();
      expect(await region.locator('svg.recharts-surface').evaluate(svg => svg.getBoundingClientRect().width)).toBeGreaterThan(100);
      expect(await region.locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);
    }
    await comparison.getByText('View department values', { exact: true }).click();
    const departmentTable = comparison.getByRole('table');
    await expect(departmentTable.getByRole('row')).toHaveCount(departments.departments.length + 1);
    for (const row of departments.departments) {
      const rendered = departmentTable.getByRole('row').filter({ has: page.getByRole('cell', { name: row.department_name, exact: true }) });
      await expect(rendered).toContainText(money(row.average_annual_salary, currency));
      await expect(rendered.getByRole('cell').nth(1)).toHaveText(row.employee_count.toLocaleString());
    }
    await histogram.getByText('View salary band values', { exact: true }).click();
    const bandTable = histogram.getByRole('table');
    await expect(bandTable.getByRole('row')).toHaveCount(distribution.bands.length + 1);
    for (const band of distribution.bands) {
      const rendered = bandTable.getByRole('row').filter({ has: page.getByRole('cell', { name: band.label, exact: true }) });
      await expect(rendered.getByRole('cell').nth(1)).toHaveText(band.employee_count.toLocaleString());
    }
    await comparison.getByText('View department values', { exact: true }).click();
    await histogram.getByText('View salary band values', { exact: true }).click();
  }
  await page.reload();
  await loaded(page);
  await expect(page.getByRole('combobox', { name: 'Country', exact: true })).toContainText('Singapore');
  await page.screenshot({ path: '/tmp/acme-phase11-dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Salary distribution', exact: true }).locator('svg.recharts-surface')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/acme-phase11-dashboard-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('failed reports offer retry and empty data shows zero headcount without invented salaries', async ({ page }) => {
  await login(page);
  await page.route('**/api/analytics/departments/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.getByRole('region', { name: 'Total annual base salary', exact: true })).toHaveCount(0);
  await page.unroute('**/api/analytics/departments/**');
  await page.getByRole('button', { name: 'Retry analytics', exact: true }).click();
  await loaded(page);
  await page.route('**/api/analytics/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.includes('/overview/') ? {
      currency: 'GBP', employee_count: 0, total_annual_salary: '0.00', average_annual_salary: null, min_annual_salary: null, max_annual_salary: null,
    } : path.includes('/departments/') ? { currency: 'GBP', departments: [] } : { currency: 'GBP', bands: [] }) });
  });
  await choose(page, 'United Kingdom');
  await loaded(page);
  await expect(page.getByRole('heading', { name: 'No compensation data for United Kingdom', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Active employees', exact: true })).toContainText('0');
  await expect(page.getByRole('region', { name: 'Total annual base salary', exact: true })).toContainText('GBP 0.00');
  await expect(page.getByRole('region', { name: 'Average annual base salary', exact: true })).toContainText('Not set');
  await expect(page.locator('svg.recharts-surface')).toHaveCount(0);
  await choose(page, 'Germany'); // Refuse GBP responses for EUR instead of mixing currencies.
  await expect(page.getByRole('alert')).toContainText('currency does not match');
  await page.unroute('**/api/analytics/**');
  await page.getByRole('button', { name: 'Retry analytics', exact: true }).click();
  await loaded(page);
  await assertOverview(page, (await reports(page, 'DE'))[0]);
});

test('switching countries while requests are pending never restores a stale currency', async ({ page }) => {
  await login(page);
  await loaded(page);
  let release;
  let held = 0;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/analytics/**', async route => {
    if (new URL(route.request().url()).searchParams.get('country') !== 'US') return route.continue();
    held++;
    await pending;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currency: 'USD', employee_count: 999999, departments: [], bands: [] }) });
  });
  await choose(page, 'United States');
  await expect.poll(() => held).toBe(3);
  await expect(page.getByRole('progressbar', { name: 'Loading compensation analytics' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Total annual base salary', exact: true })).toHaveCount(0);
  await choose(page, 'Germany');
  await loaded(page);
  release();
  await assertOverview(page, (await reports(page, 'DE'))[0]);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await loaded(page);
  await assertOverview(page, (await reports(page, 'DE'))[0]);
});

test('dashboard refreshes real totals, department averages and salary bands after a UI salary revision', async ({ page }) => {
  const prefix = process.env.ACME_E2E_EMPLOYEE_PREFIX;
  await login(page);
  const found = await (await page.request.get(`/api/employees/?search=${encodeURIComponent(`${prefix}-DASH`)}`)).json();
  expect(found.count, 'Provision the active GB dashboard fixture described in frontend/README.md').toBe(1);
  const employee = found.results[0];
  await choose(page, 'United Kingdom');
  await loaded(page);
  const [before] = await reports(page, 'GB');
  await assertOverview(page, before);
  await page.goto(`/employees/${employee.id}`);
  await page.getByRole('button', { name: 'Revise salary', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revise salary', exact: true });
  await dialog.getByRole('textbox', { name: 'Annual salary', exact: true }).fill('140000.25');
  await dialog.getByLabel(/^Effective from/).fill(new Date().toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Current salary', exact: true })).toContainText('GBP 140,000.25');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await choose(page, 'United Kingdom');
  await loaded(page);
  const [after, departments, distribution] = await reports(page, 'GB');
  await assertOverview(page, after);
  expect(after.employee_count).toBe(before.employee_count);
  const cents = value => BigInt(value.replace('.', ''));
  expect(cents(after.total_annual_salary) - cents(before.total_annual_salary)).toBe(9000025n);
  const comparison = page.getByRole('region', { name: 'Department comparison', exact: true });
  await comparison.getByText('View department values', { exact: true }).click();
  const department = departments.departments.find(row => row.department_id === employee.department);
  await expect(comparison.getByRole('row').filter({ has: page.getByRole('cell', { name: department.department_name, exact: true }) })).toContainText(money(department.average_annual_salary, 'GBP'));
  const histogram = page.getByRole('region', { name: 'Salary distribution', exact: true });
  await histogram.getByText('View salary band values', { exact: true }).click();
  const lastBand = distribution.bands.at(-1);
  await expect(histogram.getByRole('row').filter({ has: page.getByRole('cell', { name: lastBand.label, exact: true }) }).getByRole('cell').nth(1)).toHaveText(lastBand.employee_count.toLocaleString());
});
