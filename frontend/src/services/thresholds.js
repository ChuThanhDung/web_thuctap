import { authFetch, parseResponse } from '../api';

/**
 * Lấy danh sách cấu hình ngưỡng sai số
 */
export async function getThresholds(token) {
  const response = await authFetch('/thresholds', token);
  return parseResponse(response);
}

/**
 * Cập nhật cấu hình ngưỡng sai số (chỉ Chief Accountant)
 */
export async function updateThreshold(token, id, payload) {
  const response = await authFetch(`/thresholds/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}
