// Phải khớp với validate_password_strength ở backend (src/models/schemas.py).
export const PASSWORD_MIN_LENGTH = 10;

// Giữ khớp với COMMON_WEAK_PASSWORDS ở backend.
const COMMON_WEAK_PASSWORDS = new Set([
  '123456', '12345678', '123456789', '1234567890', '0123456789', '12345678910', '1234567890a', 'a1234567890',
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd123',
  'admin123', 'admin12345', 'admin@123', 'administrator', 'qwerty123', 'qwerty1234', 'qwertyuiop', '1q2w3e4r5t',
  '11111111', '1111111111', '00000000', '0000000000', '88888888', '8888888888', 'abc12345678', 'abcd123456',
  'iloveyou123', 'matkhau123', 'matkhau1234', 'matkhaumoi1', 'docusync123', 'docusyncai1', 'ketoan12345',
  'ketoan123456', 'congty12345', 'vietnam1234', 'hanoi123456', 'saigon12345', 'welcome123', 'welcome1234',
  'changeme123', 'letmein1234', 'zaq12wsxcde', '1qaz2wsx3edc', 'asdfghjkl1', 'zxcvbnm123', 'abc123456789',
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
