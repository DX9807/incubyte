import { expect, test } from '@playwright/test';

const username = process.env.ACME_E2E_USERNAME;
const password = process.env.ACME_E2E_PASSWORD;
if (!username || !password) throw new Error('Set ACME_E2E_USERNAME and ACME_E2E_PASSWORD to a temporary HR test account.');

async function signIn(page) {
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('anonymous access, invalid login, session refresh, navigation and logout use real Django APIs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/employees');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username);
  await page.getByLabel(/^Password/).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/employees$/);
  await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/acme-phase8-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/me/')).status()).toBe(403);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: '/tmp/acme-phase8-login.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('mobile navigation remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/acme-phase8-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('startup outage offers retry and a pending login cannot submit twice', async ({ page }) => {
  await page.route('**/api/me/', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await page.unroute('**/api/me/');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/\/login$/);
  let submissions = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/login/', async route => { submissions++; await pending; await route.continue(); });
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  release();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
