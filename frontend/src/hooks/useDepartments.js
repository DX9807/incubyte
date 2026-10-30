import { useCallback, useEffect, useState } from 'react';
import { employeesApi } from '../api/employees';
import { useAuth } from '../auth/AuthContext';

export default function useDepartments() {
  const { checkSession } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    employeesApi.departments(controller.signal).then(result => { if (!controller.signal.aborted) setDepartments(result); }).catch(failure => {
      if (failure.name === 'AbortError') return;
      if (failure.status === 403) checkSession();
      else setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version, checkSession]);
  return { departments, loading, error, retry };
}
