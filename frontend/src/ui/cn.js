/** Ghép class, bỏ giá trị rỗng. */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Ring focus thống nhất cho mọi phần tử tương tác (nhìn rõ ở cả nền sáng và tối). */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
