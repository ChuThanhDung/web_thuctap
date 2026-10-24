// Định dạng hiển thị thống nhất: ngày giờ dd/MM/yyyy HH:mm, số theo kiểu Việt Nam.
// Tự ghép chuỗi thay vì dùng Intl cho ngày giờ để kết quả không phụ thuộc locale của trình duyệt.

const pad = (value) => String(value).padStart(2, '0');

/** Chuyển giá trị API/Date/số thành Date. Chuỗi không có múi giờ ("2026-10-11 09:36:04") được hiểu là giờ địa phương. */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const date = typeof value === 'string' ? new Date(value.trim().replace(' ', 'T')) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** dd/MM/yyyy */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** dd/MM/yyyy HH:mm */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(value));
}

/** 119.240.000 ₫ */
export function formatVND(amount) {
  if (amount === null || amount === undefined || amount === '' || Number.isNaN(Number(amount))) return '';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount));
}

/** 0.93 -> "93%". Nhận cả thang 0-1 lẫn 0-100. */
export function formatPercent(value) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(number)) return '';
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
}
