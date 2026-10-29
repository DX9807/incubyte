import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const checkSession = useCallback(async (signal) => {
    setChecking(true);
    setSessionError('');
    try {
      const current = await authApi.me(signal);
      if (!current?.is_staff) throw new ApiError('This account does not have HR access.', 403);
      setUser(current);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (error.status === 403) setUser(null);
      else setSessionError(error.message);
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkSession(controller.signal);
    return () => controller.abort();
  }, [checkSession]);

  async function login(credentials) {
    const result = await authApi.login(credentials);
    if (!result?.user?.is_staff) throw new ApiError('This account does not have HR access.', 403);
    setUser(result.user);
    setSessionError('');
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, checking, sessionError, checkSession, login, logout }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used within AuthProvider.');
  return auth;
}
