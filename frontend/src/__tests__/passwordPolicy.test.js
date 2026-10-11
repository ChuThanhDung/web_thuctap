import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, getPasswordPolicyError } from '../passwordPolicy.js';

describe('getPasswordPolicyError', () => {
  it('accepts a strong password', () => {
    expect(getPasswordPolicyError('Str0ng-Pass1')).toBe('');
  });

  it('rejects passwords shorter than the minimum length', () => {
    expect(getPasswordPolicyError('Ab1')).toContain(String(PASSWORD_MIN_LENGTH));
    expect(getPasswordPolicyError('')).not.toBe('');
    expect(getPasswordPolicyError(undefined)).not.toBe('');
  });

  it('requires both letters and digits', () => {
    expect(getPasswordPolicyError('abcdefgh')).toMatch(/chữ và số/);
    expect(getPasswordPolicyError('12345678')).toMatch(/chữ và số/);
  });

  it('accepts accented letters as letters', () => {
    expect(getPasswordPolicyError('Mậtkhẩu2026')).toBe('');
  });

  it('rejects common weak passwords regardless of case', () => {
    expect(getPasswordPolicyError('Password1')).toMatch(/phổ biến/);
    expect(getPasswordPolicyError('QWERTY123')).toMatch(/phổ biến/);
  });
});
