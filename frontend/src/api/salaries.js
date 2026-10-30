import { apiRequest } from './client.js';

export const utcToday = () => new Date().toISOString().slice(0, 10);

export const salariesApi = {
  history: (employeeId, signal) => apiRequest(`/api/employees/${encodeURIComponent(employeeId)}/salaries/`, { signal }),
  revise: (employeeId, values) => apiRequest(`/api/employees/${encodeURIComponent(employeeId)}/salaries/`, { method: 'POST', body: values }),
};

export function validateRevision(values, latestDate, today = utcToday()) {
  const errors = {};
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(values.annual_salary)) {
    errors.annual_salary = 'Enter a positive amount with up to 12 integer digits and two decimal places.';
  } else if (!/[1-9]/.test(values.annual_salary)) {
    errors.annual_salary = 'Salary must be greater than zero.';
  }
  const date = values.effective_from;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    errors.effective_from = 'Enter a valid effective date.';
  } else if (date > today) {
    errors.effective_from = 'Effective date cannot be in the future (UTC).';
  } else if (latestDate && date <= latestDate) {
    errors.effective_from = 'Effective date must be later than the latest salary.';
  }
  return errors;
}
