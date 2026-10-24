import { vi } from '../i18n/vi.js';

/**
 * Tên hiển thị: bỏ phần vai trò gắn trong ngoặc ở cuối.
 * Dữ liệu cũ có dạng "Chu Thanh Dũng (Kế toán viên)"; vai trò phải lấy từ trường `role`, không lẫn vào tên.
 */
export function getDisplayName(fullName) {
  return String(fullName ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

/** Chữ viết tắt từ họ tên thật: chữ cái đầu của họ và của tên ("Chu Thanh Dũng" -> "CD"). */
export function getInitials(fullName) {
  const words = getDisplayName(fullName).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';
  return `${first[0]}${last ? last[0] : ''}`.toLocaleUpperCase('vi-VN');
}

export function getRoleLabel(roleCode) {
  return vi.roles[roleCode] ?? '';
}

export function getUserStatusLabel(status) {
  return vi.userStatus[String(status ?? '').toUpperCase()] ?? '';
}
