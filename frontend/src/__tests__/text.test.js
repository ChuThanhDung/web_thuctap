import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, formatVND, repairTextDeep, repairVietnameseText } from '../text.js';

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

describe('formatters', () => {
  it('formats numbers with Vietnamese grouping', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
  });

  it('formats VND amounts', () => {
    expect(formatVND(119240000)).toMatch(/119\.240\.000/);
  });

  it('returns an empty string for a missing date and formats a real one', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('2026-06-12T10:30:00')).toMatch(/12\/06\/2026/);
  });
});
