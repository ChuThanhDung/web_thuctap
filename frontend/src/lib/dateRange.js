import { formatDate, toDate } from './format.js';

// Bộ lọc khoảng thời gian dùng chung cho các trang Tổng quan. Mọi so sánh theo NGÀY (bỏ giờ phút).

export const DATE_PRESETS = ['all', 'today', 'last_7_days', 'last_30_days', 'this_month', 'custom'];

export function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** "2026-10-11" (giá trị của <input type="date">) -> Date đầu hoặc cuối ngày. */
export function parseDateInput(value, boundary = 'start') {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return boundary === 'end' ? endOfDay(date) : startOfDay(date);
}

/** Date -> "2026-10-11" để đặt vào URL hoặc <input type="date">. */
export function toDateInputValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Khoảng {start, end} của một preset; `all` và `custom` không giới hạn (custom do người dùng nhập). */
export function getPresetRange(preset, now = new Date()) {
  const end = endOfDay(now);
  if (preset === 'today') return { start: startOfDay(now), end };
  if (preset === 'last_7_days' || preset === 'last_30_days') {
    const start = startOfDay(now);
    start.setDate(start.getDate() - (preset === 'last_7_days' ? 6 : 29));
    return { start, end };
  }
  if (preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  return { start: null, end: null };
}

export function isWithinRange(value, range) {
  if (!range.start && !range.end) return true;
  const date = toDate(value);
  if (!date) return false;
  const day = startOfDay(date);
  if (range.start && day < startOfDay(range.start)) return false;
  if (range.end && day > startOfDay(range.end)) return false;
  return true;
}

/** "01/10/2026 - 14/10/2026"; thiếu đầu hoặc cuối thì ghi "đầu dữ liệu" / "hiện tại". */
export function describeRange(range, allLabel) {
  if (!range.start && !range.end) return allLabel;
  return `${range.start ? formatDate(range.start) : 'đầu dữ liệu'} - ${range.end ? formatDate(range.end) : 'hiện tại'}`;
}
