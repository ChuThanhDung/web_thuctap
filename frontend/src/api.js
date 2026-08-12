import { repairTextDeep } from './text.js';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000/api/v1' : '/api/v1');

function buildApiUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiBase = new URL(API_BASE_URL, window.location.origin);
  if (pathOrUrl.startsWith('/api/')) {
    return `${apiBase.origin}${pathOrUrl}`;
  }
  if (pathOrUrl.startsWith('/')) {
    return `${API_BASE_URL}${pathOrUrl}`;
  }
  return `${API_BASE_URL}/${pathOrUrl}`;
}

export function getUploadFileViewUrl(file) {
  return buildApiUrl(file?.file_url || (file?.id ? `/uploads/${file.id}/file` : null));
}

export async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let detailMsg = '';
    if (typeof data.detail === 'string') {
      detailMsg = data.detail;
    } else if (Array.isArray(data.detail)) {
      detailMsg = data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
    } else if (data.detail && typeof data.detail === 'object') {
      detailMsg = JSON.stringify(data.detail);
    }
    const finalMsg = repairTextDeep(detailMsg);
    throw new Error(typeof finalMsg === 'string' && finalMsg ? finalMsg : 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
  }

  return repairTextDeep(data);
}

export async function authFetch(path, token, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

export async function loginWithEmail(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  return parseResponse(response);
}

export async function updateProfile(token, profile) {
  const response = await authFetch('/auth/me', token, {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });

  return parseResponse(response);
}

export async function requestPasswordOtp(token) {
  const response = await authFetch('/auth/password/otp', token, {
    method: 'POST',
  });

  return parseResponse(response);
}

export async function verifyPasswordOtp(token, otp) {
  const response = await authFetch('/auth/password/otp/verify', token, {
    method: 'POST',
    body: JSON.stringify({ otp }),
  });

  return parseResponse(response);
}

export async function changePassword(token, resetToken, newPassword, confirmPassword) {
  const response = await authFetch('/auth/password/change', token, {
    method: 'POST',
    body: JSON.stringify({
      reset_token: resetToken,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  });

  return parseResponse(response);
}

export async function uploadDocument(token, file, docType = null, batchId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (docType) {
    formData.append('doc_type', docType);
  }
  if (batchId) {
    formData.append('batch_id', String(batchId));
  }

  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return parseResponse(response);
}

export async function getUploadQueue(token) {
  const response = await authFetch('/uploads', token);
  return parseResponse(response);
}

export async function createDocumentBatch(token) {
  const response = await authFetch('/uploads/batches', token, {
    method: 'POST',
  });
  return parseResponse(response);
}

export async function getDocumentBatches(token) {
  const response = await authFetch('/uploads/batches', token);
  return parseResponse(response);
}

export async function fetchUploadFileBlob(token, file) {
  const fileUrl = getUploadFileViewUrl(file);
  if (!fileUrl) {
    throw new Error('Không tìm thấy đường dẫn file để mở.');
  }

  const response = await fetch(fileUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Không thể mở file này. Vui lòng tải lại danh sách và thử lại.');
  }

  return response.blob();
}

export async function deleteUploadedFile(token, fileId) {
  const response = await authFetch(`/uploads/${fileId}`, token, {
    method: 'DELETE',
  });
  return parseResponse(response);
}

export async function createUserAccount(token, userData) {
  const response = await authFetch('/auth/users', token, {
    method: 'POST',
    body: JSON.stringify(userData),
  });

  return parseResponse(response);
}

export async function getUserAccounts(token) {
  const response = await authFetch('/auth/users', token);
  return parseResponse(response);
}


