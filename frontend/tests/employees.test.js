import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countryName, employeesApi, formatSalary } from '../src/api/employees.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('list filters and pagination are sent to the server, including false status', async (t) => {
  let requested;
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    requested = { path, options };
    return json({ count: 10000, next: null, previous: null, results: [] });
  });
  await employeesApi.list({ search: 'Aditi & HR', department: 2, country: 'IN', is_active: false, page: 2 }, controller.signal);
  const url = new URL(requested.path, 'http://testserver');
  assert.equal(url.pathname, '/api/employees/');
  assert.equal(url.searchParams.get('search'), 'Aditi & HR');
  assert.equal(url.searchParams.get('department'), '2');
  assert.equal(url.searchParams.get('is_active'), 'false');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(requested.options.signal, controller.signal);
});

test('empty optional filters are omitted rather than sent as invalid API values', async (t) => {
  let requested;
  t.mock.method(globalThis, 'fetch', async path => { requested = path; return json({ results: [] }); });
  await employeesApi.list({ search: '', department: '', country: null, is_active: '', page: 1 });
  assert.equal(new URL(requested, 'http://testserver').search, '?page=1');
});

test('creation sends money as a decimal string with CSRF, and update uses PATCH', async (t) => {
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/csrf/') return json({ csrfToken: 'fresh' });
    writes.push({ path, method: options.method, body: JSON.parse(options.body), token: options.headers.get('X-CSRFToken') });
    return json({ id: 7 });
  });
  await employeesApi.create({ annual_salary: '1200000.01', is_active: true });
  await employeesApi.update(7, { is_active: false });
  assert.deepEqual(writes, [
    { path: '/api/employees/', method: 'POST', body: { annual_salary: '1200000.01', is_active: true }, token: 'fresh' },
    { path: '/api/employees/7/', method: 'PATCH', body: { is_active: false }, token: 'fresh' },
  ]);
});

test('server field validation remains available to employee forms', async (t) => {
  t.mock.method(globalThis, 'fetch', async path => path === '/api/csrf/' ? json({ csrfToken: 'fresh' })
    : json({ employee_code: ['employee with this employee code already exists.'] }, 400));
  await assert.rejects(employeesApi.create({ employee_code: 'DUPLICATE' }), error =>
    error.status === 400 && error.details.employee_code[0].includes('already exists'));
});

test('current annual salaries retain currency and decimal display without conversion', () => {
  assert.equal(formatSalary('1200000.01', 'INR'), 'INR 1,200,000.01');
  assert.equal(formatSalary('999999999999.99', 'USD'), 'USD 999,999,999,999.99');
  assert.equal(formatSalary(null, null), 'Not set');
  assert.equal(countryName('GB'), 'United Kingdom');
  assert.equal(countryName('XX'), 'XX');
});
