export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function send(path, { method = 'GET', body, signal, headers: extraHeaders } = {}) {
  const headers = new Headers(extraHeaders);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  let response;
  try {
    response = await fetch(path, {
      method, headers, signal, credentials: 'same-origin', cache: 'no-store',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Unable to connect. Check your connection and try again.');
  }
  const isJson = response.headers.get('content-type')?.includes('json');
  let data = null;
  if (response.status !== 204 && isJson) {
    try { data = await response.json(); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError('The service returned an unexpected response. Please try again.', response.status);
    }
  }
  if (!response.ok) {
    const message = typeof data?.detail === 'string' ? data.detail
      : response.status >= 500 ? 'The service is unavailable. Please try again.'
      : response.status === 403 ? 'Your request could not be verified. Please try again.'
      : 'The request could not be completed. Please try again.';
    throw new ApiError(message, response.status, data);
  }
  if (!isJson && response.status !== 204) {
    throw new ApiError('The service returned an unexpected response. Please try again.', response.status);
  }
  return data;
}

export async function apiRequest(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('API requests must use a relative /api/ URL.');
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    // Bootstrap for each write so token rotation and sign-ins in other tabs
    // cannot leave the client using an old token. Cookies stay HttpOnly for sessions.
    const csrf = await send('/api/csrf/', { signal: options.signal });
    if (typeof csrf?.csrfToken !== 'string' || !csrf.csrfToken) {
      throw new ApiError('Unable to prepare a secure request. Please try again.');
    }
    headers.set('X-CSRFToken', csrf.csrfToken);
  }
  return send(path, { ...options, method, headers });
}

export const authApi = {
  me: (signal) => apiRequest('/api/me/', { signal }),
  login: (credentials) => apiRequest('/api/login/', { method: 'POST', body: credentials }),
  async logout() {
    try {
      await apiRequest('/api/logout/', { method: 'POST' });
    } catch (error) {
      if (error.status === 403) {
        // A session may already have expired. Confirm that before claiming logout.
        try { await authApi.me(); }
        catch (sessionError) { if (sessionError.status === 403) return; }
      }
      throw error;
    }
  },
};
