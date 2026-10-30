import { apiRequest, ApiError } from './client.js';
import { COUNTRIES } from './employees.js';

export const analyticsApi = {
  async load(country, signal) {
    const selected = COUNTRIES.find(item => item.code === country);
    if (!selected) throw new Error('Select a supported country.');
    const query = new URLSearchParams({ country });
    const [overview, departments, distribution] = await Promise.all(
      ['overview', 'departments', 'distribution'].map(report => apiRequest(`/api/analytics/${report}/?${query}`, { signal })),
    );
    if ([overview, departments, distribution].some(report => report.currency !== selected.currency)) {
      throw new ApiError('The report currency does not match the selected country. Please refresh.');
    }
    return { country, currency: selected.currency, overview, departments: departments.departments, bands: distribution.bands };
  },
};
