import { authFetch, parseResponse } from '../api';

let cachedThresholds = null;
let lastFetchedAt = 0;

export function getCachedThresholds() {
  return cachedThresholds;
}

// Lấy danh sách cấu hình ngưỡng sai số.
export async function getThresholds(token, forceRefresh = false) {
  if (!forceRefresh && cachedThresholds && Date.now() - lastFetchedAt < 60000) {
    return cachedThresholds;
  }
  const response = await authFetch('/thresholds', token);
  cachedThresholds = await parseResponse(response);
  lastFetchedAt = Date.now();
  return cachedThresholds;
}

export async function createThreshold(token, payload) {
  cachedThresholds = null;
  const response = await authFetch('/thresholds', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

// Cập nhật cấu hình ngưỡng sai số.
export async function updateThreshold(token, id, payload) {
  cachedThresholds = null;
  const response = await authFetch(`/thresholds/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

export async function deleteThreshold(token, id) {
  cachedThresholds = null;
  const response = await authFetch(`/thresholds/${id}`, token, {
    method: 'DELETE',
  });

  if (!response.ok) {
    return parseResponse(response);
  }

  return null;
}
