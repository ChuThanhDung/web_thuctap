// Phải khớp với validate_password_strength ở backend (src/models/schemas.py).
export const PASSWORD_MIN_LENGTH = 8;

const COMMON_WEAK_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  'password',
  'password1',
  'admin123',
  'qwerty123',
  '11111111',
]);

/** Trả về thông báo lỗi tiếng Việt, hoặc chuỗi rỗng nếu mật khẩu hợp lệ. */
export function getPasswordPolicyError(password) {
  const value = password ?? '';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Mật khẩu phải có tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`;
  }
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) {
    return 'Mật khẩu phải gồm cả chữ và số.';
  }
  if (COMMON_WEAK_PASSWORDS.has(value.toLowerCase())) {
    return 'Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác.';
  }
  return '';
}
