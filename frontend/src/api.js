import { repairTextDeep } from './text.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(repairTextDeep(data.detail) || 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
  }

  return repairTextDeep(data);
}

async function authFetch(path, token, options = {}) {
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
