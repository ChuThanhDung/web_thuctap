import { authFetch, parseResponse } from '../api';

/**
 * Lấy danh sách nhật ký hệ thống (Audit Trail)
 */
export async function getAuditLogs(token, params = {}) {
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, value);
    }
  }
  
  const query = queryParams.toString();
  const url = query ? `/audit-logs?${query}` : '/audit-logs';
  
  const response = await authFetch(url, token);
  return parseResponse(response);
}
