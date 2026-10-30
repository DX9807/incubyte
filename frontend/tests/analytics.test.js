import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyticsApi } from '../src/api/analytics.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('all three reports request exactly one country with the same session and cancellation signal', async t => {
  const calls = [];
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push(path);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.signal, controller.signal);
    const url = new URL(path, 'http://testserver');
    assert.deepEqual([...url.searchParams], [['country', 'SG']]);
    return json({ currency: 'SGD', departments: [], bands: [] });
  });
  const result = await analyticsApi.load('SG', controller.signal);
  assert.equal(result.currency, 'SGD');
  assert.deepEqual(calls, ['overview', 'departments', 'distribution'].map(report => `/api/analytics/${report}/?country=SG`));
});

test('financial strings and backend bands are retained without client aggregation or currency conversion', async t => {
  const overview = { currency: 'INR', employee_count: 10000, total_annual_salary: '9999999999999999.99', average_annual_salary: '999999999999.99' };
  const departments = [{ department_id: 1, average_annual_salary: '1250000.01' }];
  const bands = [{ label: '4,000,000+', employee_count: 10, max_annual_salary: null }];
  t.mock.method(globalThis, 'fetch', async path => json(path.includes('/overview/') ? overview
    : path.includes('/departments/') ? { currency: 'INR', departments } : { currency: 'INR', bands }));
  assert.deepEqual(await analyticsApi.load('IN'), { country: 'IN', currency: 'INR', overview, departments, bands });
});

test('unsupported countries and inconsistent report currencies cannot produce a combined dashboard', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async path => { calls++; return json({ currency: path.includes('/distribution/') ? 'USD' : 'GBP' }); });
  await assert.rejects(analyticsApi.load('ALL'), /supported country/);
  assert.equal(calls, 0);
  await assert.rejects(analyticsApi.load('GB'), /currency does not match/);
});

test('report failures and cancellation propagate instead of displaying partial or zero data', async t => {
  t.mock.method(globalThis, 'fetch', async path => json({ currency: 'EUR' }, path.includes('/departments/') ? 503 : 200));
  await assert.rejects(analyticsApi.load('DE'), error => error.status === 503);
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(analyticsApi.load('DE'), error => error.name === 'AbortError');
});
