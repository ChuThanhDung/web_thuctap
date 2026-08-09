import { authFetch, parseResponse } from '../api';

/**
 * Lấy danh sách hồ sơ đối soát (có phân trang & filter)
 */
export async function getReconciliations(token, params = {}) {
  // Lọc các param undefined/null/rỗng
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, value);
    }
  }
  
  const query = queryParams.toString();
  const url = query ? `/reconciliations?${query}` : '/reconciliations';
  
  const response = await authFetch(url, token);
  return parseResponse(response);
}

/**
 * Lấy chi tiết 1 hồ sơ đối soát
 */
export async function getReconciliationDetail(token, id) {
  const response = await authFetch(`/reconciliations/${id}`, token);
  return parseResponse(response);
}

/**
 * Phê duyệt / Từ chối / Escalate hồ sơ (chỉ Chief Accountant)
 */
export async function decideCase(token, id, payload) {
  const response = await authFetch(`/reconciliations/${id}/decide`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

/**
 * Lấy thống kê cho Dashboard (chỉ Chief Accountant)
 */
export async function getDashboardStats(token) {
  const response = await authFetch(`/reconciliations/stats`, token);
  return parseResponse(response);
}
