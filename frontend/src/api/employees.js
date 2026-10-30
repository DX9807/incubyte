import { apiRequest } from './client.js';

export const PAGE_SIZE = 50;
export const COUNTRIES = [
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
];

export const countryName = code => COUNTRIES.find(country => country.code === code)?.name || code;
export function formatSalary(amount, currency) {
  if (amount == null || !currency) return 'Not set';
  return `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)}`;
}

export const employeesApi = {
  departments: signal => apiRequest('/api/departments/', { signal }),
  list(filters, signal) {
    const query = new URLSearchParams();
    for (const name of ['search', 'department', 'country', 'is_active', 'page']) {
      const value = filters[name];
      if (value !== '' && value !== undefined && value !== null) query.set(name, String(value));
    }
    return apiRequest(`/api/employees/?${query}`, { signal });
  },
  detail: (id, signal) => apiRequest(`/api/employees/${encodeURIComponent(id)}/`, { signal }),
  create: values => apiRequest('/api/employees/', { method: 'POST', body: values }),
  update: (id, values) => apiRequest(`/api/employees/${encodeURIComponent(id)}/`, { method: 'PATCH', body: values }),
};
