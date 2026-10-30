import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salariesApi, utcToday, validateRevision } from '../src/api/salaries.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('history reads preserve the backend order and cancellation signal', async t => {
  const records = [{ id: 2, effective_from: '2026-10-28' }, { id: 1, effective_from: '2025-01-01' }];
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/employees/12%2F3/salaries/');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.credentials, 'same-origin');
    return json(records);
  });
  assert.deepEqual(await salariesApi.history('12/3', controller.signal), records);
});

test('revision POST sends decimal/date fields unchanged with fresh CSRF protection', async t => {
  const values = { annual_salary: '999999999999.99', effective_from: '2026-10-28' };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push(path);
    if (path === '/api/csrf/') return json({ csrfToken: 'current-token' });
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('X-CSRFToken'), 'current-token');
    assert.deepEqual(JSON.parse(options.body), values);
    return json({ id: 3, ...values }, 201);
  });
  assert.equal((await salariesApi.revise(7, values)).id, 3);
  assert.deepEqual(calls, ['/api/csrf/', '/api/employees/7/salaries/']);
});

test('backend field and non-field errors survive without automatic write retries', async t => {
  const errors = { effective_from: ['Effective date must be later than the latest salary.'], non_field_errors: ['Revision rejected.'] };
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async path => {
    if (path === '/api/csrf/') return json({ csrfToken: 'fresh' });
    writes++;
    return json(errors, 400);
  });
  await assert.rejects(salariesApi.revise(7, {}), error => error.status === 400 && JSON.stringify(error.details) === JSON.stringify(errors));
  assert.equal(writes, 1);
});

test('amount validation accepts positive decimal strings including decreases and rejects invalid precision/range', () => {
  const check = amount => validateRevision({ annual_salary: amount, effective_from: '2026-10-28' }, '2026-10-27', '2026-10-28');
  for (const amount of ['0.01', '1', '12.3', '999999999999.99']) assert.deepEqual(check(amount), {});
  for (const amount of ['', '0', '0.00', '-1', '1.001', '1000000000000', '1e5', 'NaN']) assert.ok(check(amount).annual_salary, amount);
});

test('date validation requires a real date after latest history and no later than UTC today', () => {
  const check = date => validateRevision({ annual_salary: '1.00', effective_from: date }, '2026-02-27', '2026-03-01');
  assert.deepEqual(check('2026-02-28'), {});
  assert.deepEqual(check('2026-03-01'), {});
  for (const date of ['', '2026-02-30', '2026-2-28', 'invalid', '2026-03-02', '2026-02-27', '2026-02-26']) assert.ok(check(date).effective_from, date);
  assert.deepEqual(validateRevision({ annual_salary: '1', effective_from: '2024-02-29' }, '2024-02-28', '2024-03-01'), {});
});

test('today follows UTC even when the browser timezone is on the prior day', t => {
  const NativeDate = Date;
  t.mock.method(globalThis, 'Date', class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-30T00:15:00Z'])); } });
  assert.equal(utcToday(), '2026-10-30');
});
