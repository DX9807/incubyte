import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, apiRequest, authApi } from '../src/api/client.js';

const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('identity reads use same-origin cookies without a CSRF request', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push([path, options]);
    return json({ id: 1, username: 'hr', is_staff: true });
  });
  assert.equal((await authApi.me()).username, 'hr');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/me/');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].headers.get('Accept'), 'application/json');
});

test('login bootstraps CSRF and sends exactly one header without trimming the password', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push([path, options]);
    return path === '/api/csrf/' ? json({ csrfToken: 'fresh-token' })
      : json({ user: { username: 'hr', is_staff: true }, csrfToken: 'rotated' });
  });
  const result = await authApi.login({ username: 'hr', password: '  keep spaces  ' });
  assert.equal(result.user.username, 'hr');
  assert.deepEqual(calls.map(([path]) => path), ['/api/csrf/', '/api/login/']);
  assert.equal(calls[1][1].headers.get('X-CSRFToken'), 'fresh-token');
  assert.equal([...calls[1][1].headers.keys()].filter(name => name === 'x-csrftoken').length, 1);
  assert.equal(JSON.parse(calls[1][1].body).password, '  keep spaces  ');
});

test('each write gets a fresh token and overwrites stale case-variant headers', async (t) => {
  let generation = 0;
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/csrf/') return json({ csrfToken: `token-${++generation}` });
    sent.push(options.headers.get('X-CSRFToken'));
    return json(null, 204);
  });
  for (let index = 0; index < 2; index++) {
    await apiRequest('/api/logout/', { method: 'POST', headers: { 'X-CSRFToken': 'old', 'X-CSRFTOKEN': 'older' } });
  }
  assert.deepEqual(sent, ['token-1', 'token-2']);
});

test('a missing bootstrap token stops the unsafe request', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return json({}); });
  await assert.rejects(authApi.login({ username: 'hr', password: 'secret' }), /prepare a secure request/);
  assert.equal(calls, 1);
});

test('JSON authentication errors retain server status and message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ detail: 'Invalid credentials or account is not authorized.' }, 403));
  await assert.rejects(authApi.me(), error => error instanceof ApiError && error.status === 403 && /Invalid credentials/.test(error.message));
});

test('HTML CSRF failures become readable errors rather than JSON parse failures', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Forbidden</html>', { status: 403 }));
  await assert.rejects(authApi.me(), error => error.status === 403 && error.message.includes('could not be verified') && !error.message.includes('<html>'));
});

test('unavailable service and malformed responses produce readable errors', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('Bad gateway', { status: 502 }));
  await assert.rejects(authApi.me(), error => error.status === 502 && /unavailable/.test(error.message));
  fetchMock.mock.mockImplementation(async () => new Response('<html>Wrong host</html>'));
  await assert.rejects(authApi.me(), /unexpected response/);
  fetchMock.mock.mockImplementation(async () => new Response('{invalid', { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(authApi.me(), /unexpected response/);
});

test('empty 204 responses succeed', async (t) => {
  t.mock.method(globalThis, 'fetch', async path => path === '/api/csrf/' ? json({ csrfToken: 'token' }) : new Response(null, { status: 204 }));
  assert.equal(await apiRequest('/api/logout/', { method: 'POST' }), null);
});

test('network errors are readable while cancellation stays an AbortError', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(authApi.me(), error => error.status === 0 && /Unable to connect/.test(error.message));
  fetchMock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(authApi.me(), error => error.name === 'AbortError');
});

test('expired-session logout only succeeds after identity confirms expiration', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async path => {
    paths.push(path);
    return path === '/api/csrf/' ? json({ csrfToken: 'token' }) : json({ detail: 'Not authenticated.' }, 403);
  });
  await authApi.logout();
  assert.deepEqual(paths, ['/api/csrf/', '/api/logout/', '/api/me/']);
});

test('logout failures do not pretend a still-valid session was cleared', async (t) => {
  t.mock.method(globalThis, 'fetch', async path => path === '/api/csrf/' ? json({ csrfToken: 'token' })
    : path === '/api/logout/' ? json({ detail: 'CSRF Failed' }, 403) : json({ is_staff: true }));
  await assert.rejects(authApi.logout(), error => error.status === 403);
});

test('external URLs are rejected before sending cookies or making requests', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return json({}); });
  await assert.rejects(apiRequest('https://external.example/api/login/', { method: 'POST' }), /relative \/api\//);
  assert.equal(calls, 0);
});
