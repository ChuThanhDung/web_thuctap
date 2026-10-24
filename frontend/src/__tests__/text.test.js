import { describe, expect, it } from 'vitest';
import { repairTextDeep, repairVietnameseText } from '../text.js';

describe('repairVietnameseText', () => {
  it('leaves correct Vietnamese text untouched', () => {
    expect(repairVietnameseText('Công ty TNHH Đăng Lâm')).toBe('Công ty TNHH Đăng Lâm');
  });

  it('repairs UTF-8 text that was decoded as Latin-1/CP1252', () => {
    const mojibake = 'CÃ´ng ty';
    expect(repairVietnameseText(mojibake)).toBe('Công ty');
  });

  it('returns non-string values unchanged', () => {
    expect(repairVietnameseText(42)).toBe(42);
    expect(repairVietnameseText(null)).toBeNull();
  });
});

describe('repairTextDeep', () => {
  it('walks arrays and objects', () => {
    const result = repairTextDeep({ items: [{ name: 'CÃ´ng ty' }], count: 2 });
    expect(result).toEqual({ items: [{ name: 'Công ty' }], count: 2 });
  });
});
