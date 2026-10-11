import { describe, expect, it } from 'vitest';
import {
  calculateMatchSummary,
  compareTaxId,
  compareTotalAmount,
  compareValues,
  getGrnTotalAdjustment,
  inferVatRate,
  toNumber,
} from '../reconciliationCompare.js';

const doc = (data) => ({ extractedData: data });

describe('toNumber', () => {
  it('passes numbers through and rejects non-finite values', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber('')).toBeNull();
  });

  it('parses Vietnamese thousands separators', () => {
    expect(toNumber('119.240.000')).toBe(119240000);
    expect(toNumber('119.240.000 ₫')).toBe(119240000);
  });

  it('parses English thousands separators and decimals', () => {
    expect(toNumber('119,240,000')).toBe(119240000);
    expect(toNumber('1,234.56')).toBe(1234.56);
    expect(toNumber('1.234,56')).toBe(1234.56);
  });
});

describe('compareValues', () => {
  it('is case and whitespace insensitive', () => {
    expect(compareValues([' ABC ', 'abc', 'Abc'])).toBe('matched');
  });

  it('flags differing values as mismatch', () => {
    expect(compareValues(['10', '10', '12'])).toBe('mismatch');
  });

  it('reports missing when any or all values are absent', () => {
    expect(compareValues(['10', '', '10'])).toBe('missing');
    expect(compareValues([null, undefined, ''])).toBe('missing');
  });
});

describe('compareTaxId', () => {
  it('ignores punctuation when comparing tax ids', () => {
    expect(compareTaxId({ po: doc({ supplier_tax_id: '0309-125-476' }), invoice: doc({ supplier_tax_id: '0309125476' }) })).toBe('matched');
  });

  it('detects different or missing tax ids', () => {
    expect(compareTaxId({ po: doc({ supplier_tax_id: '0309125476' }), invoice: doc({ supplier_tax_id: '0316784251' }) })).toBe('mismatch');
    expect(compareTaxId({ po: doc({ supplier_tax_id: '0309125476' }), invoice: doc({}) })).toBe('missing');
  });
});

describe('inferVatRate', () => {
  it('reads the rate from the document or its line items', () => {
    expect(inferVatRate(doc({ vat_rate_pct: 8 }))).toBe(8);
    expect(inferVatRate(doc({ line_items: [{ vat_rate_pct: '10%' }] }))).toBe(10);
  });

  it('skips missing documents and returns 0 when nothing is found', () => {
    expect(inferVatRate({ missing: true }, doc({ vat_rate_pct: 10 }))).toBe(10);
    expect(inferVatRate(doc({}))).toBe(0);
  });
});

describe('compareTotalAmount', () => {
  const po = doc({ total_amount: 119240000, vat_rate_pct: 10 });
  const invoice = doc({ total_amount: 119240000 });

  it('matches when PO, invoice and GRN totals agree', () => {
    expect(compareTotalAmount({ po, invoice, grn: doc({ total_amount: 119240000 }) })).toBe('matched');
  });

  it('adds VAT to a GRN total that has no tax before comparing', () => {
    expect(compareTotalAmount({ po, invoice, grn: doc({ total_amount: 108400000 }) })).toBe('matched');
  });

  it('flags a total that differs beyond rounding', () => {
    expect(compareTotalAmount({ po, invoice: doc({ total_amount: 125000000 }), grn: doc({ total_amount: 119240000 }) })).toBe('mismatch');
  });

  it('reports missing when the GRN has no total', () => {
    expect(compareTotalAmount({ po, invoice, grn: doc({}) })).toBe('missing');
  });
});

describe('getGrnTotalAdjustment', () => {
  it('describes the VAT adjustment applied to a tax-free GRN', () => {
    const adjustment = getGrnTotalAdjustment({
      po: doc({ vat_rate_pct: 10 }),
      grn: doc({ total_amount: 100 }),
    });
    expect(adjustment.vatRate).toBe(10);
    expect(adjustment.adjustedTotal).toBeCloseTo(110);
  });

  it('returns null when the GRN already shows VAT', () => {
    expect(
      getGrnTotalAdjustment({ po: doc({ vat_rate_pct: 10 }), grn: doc({ total_amount: 110, vat_rate_pct: 10 }) }),
    ).toBeNull();
  });
});

describe('calculateMatchSummary', () => {
  const lines = [{ item_name: 'Mũ bảo hiểm', sku: 'MBH-01', qty: 10, price: 100 }];
  const build = (invoiceQty) => ({
    po: doc({ supplier_tax_id: '0309125476', total_amount: 1000, line_items: lines }),
    grn: doc({ total_amount: 1000, line_items: lines }),
    invoice: doc({
      supplier_tax_id: '0309125476',
      total_amount: 1000,
      line_items: [{ ...lines[0], qty: invoiceQty }],
    }),
  });

  it('returns a summary with consistent counters', () => {
    const summary = calculateMatchSummary(build(10));
    expect(summary.checkedFields).toBe(
      summary.matchedFields + summary.mismatchFields + summary.warningFields,
    );
    expect(summary.matchRate).toBeGreaterThan(0);
  });

  it('flags a quantity difference as a mismatch and lowers the match rate', () => {
    const matching = calculateMatchSummary(build(10));
    const differing = calculateMatchSummary(build(12));
    expect(differing.mismatchFields).toBeGreaterThan(matching.mismatchFields);
    expect(differing.status).toBe('mismatch');
    expect(differing.matchRate).toBeLessThan(matching.matchRate);
  });
});
