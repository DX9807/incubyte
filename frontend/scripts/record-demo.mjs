// Invoked by scripts/verify_browser.py --record-demo with disposable credentials.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const prefix = process.env.ACME_E2E_EMPLOYEE_PREFIX;
if (!prefix || !process.env.ACME_E2E_USERNAME || !process.env.ACME_E2E_PASSWORD) throw new Error('Use the verification runner to provision disposable demo fixtures.');
const output = path.resolve('../artifacts/demo');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ slowMo: 250 });
const context = await browser.newContext({ baseURL: process.env.ACME_E2E_BASE_URL, viewport: { width: 1280, height: 800 }, recordVideo: { dir: output, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const video = page.video();
const pause = () => page.waitForTimeout(1600); // Presentation pacing after assertions, not test synchronization.
async function country(name) {
  await page.getByRole('combobox', { name: 'Country', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
try {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(process.env.ACME_E2E_USERNAME);
  await page.getByLabel(/^Password/).fill(process.env.ACME_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await country('United Kingdom');
  await expect(page.getByRole('region', { name: 'Total annual base salary', exact: true })).toContainText('GBP');
  await pause();
  await page.getByRole('heading', { name: 'Department comparison', exact: true }).scrollIntoViewIfNeeded();
  await pause();
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Employees', exact: true }).getByRole('row')).toHaveCount(51);
  await page.getByRole('textbox', { name: 'Search employees' }).fill(prefix + '-DEMO');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await pause();
  await page.getByRole('link', { name: 'Demo employee ' + prefix + '-DEMO', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Current salary', exact: true })).toContainText('GBP 50,000.00');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Edit employee', exact: true });
  await profile.getByRole('textbox', { name: 'Job title', exact: true }).fill('Senior Software Engineer');
  await profile.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(profile).not.toBeVisible();
  await page.getByRole('button', { name: 'Revise salary', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revise salary', exact: true });
  await dialog.getByRole('textbox', { name: 'Annual salary', exact: true }).fill('140000.25');
  await pause();
  await dialog.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Current salary', exact: true })).toContainText('GBP 140,000.25');
  const history = page.getByRole('table', { name: 'Salary history', exact: true });
  await expect(history.getByRole('row')).toHaveCount(3);
  await history.scrollIntoViewIfNeeded();
  await pause();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await country('United Kingdom');
  await expect(page.getByRole('region', { name: 'Total annual base salary', exact: true })).toContainText('GBP');
  await pause();
  await page.getByRole('heading', { name: 'Salary distribution', exact: true }).scrollIntoViewIfNeeded();
  await pause();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await pause();
} finally {
  await context.close();
  await video.saveAs(path.join(output, 'acme-salary-management.webm'));
  await video.delete();
  await browser.close();
}
console.log('Recorded actual local production-build UI: artifacts/demo/acme-salary-management.webm (silent).');
