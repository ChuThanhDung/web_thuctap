import { describe, expect, it } from 'vitest';
import {
  aggregateExtractedData,
  calculateMatchSummary,
  compareAmounts,
  detectForeignCopy,
  compareTaxId,
  compareTotalAmount,
  compareValues,
  getGrnTotalAdjustment,
  inferVatRate,
  resolveMatchStatus,
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

  it('classifies a rounding difference up to 1,000 đ as minor, beyond it as mismatch', () => {
    const grn = doc({ total_amount: 119240000 });
    expect(compareTotalAmount({ po, invoice: doc({ total_amount: 119240600 }), grn })).toBe('minor');
    expect(compareTotalAmount({ po, invoice: doc({ total_amount: 119241000 }), grn })).toBe('minor');
    expect(compareTotalAmount({ po, invoice: doc({ total_amount: 119241001 }), grn })).toBe('mismatch');
  });
});

describe('compareAmounts', () => {
  it('uses the 1,000 đ rounding tolerance', () => {
    expect(compareAmounts([500000, 500000, 500001])).toBe('matched');
    expect(compareAmounts([500000, 500600, 500000])).toBe('minor');
    expect(compareAmounts([500000, 501000, 500000])).toBe('minor');
    expect(compareAmounts([500000, 501001, 500000])).toBe('mismatch');
    expect(compareAmounts([500000, null, 500000])).toBe('missing');
  });
});

describe('minor differences in the batch summary', () => {
  const base = { supplier_name: 'NCC A', supplier_tax_id: '0101', vat_rate_pct: 10 };
  const line = (amount) => ({ sku: 'A', qty: 1, price: 500000, amount });

  it('marks a batch whose only difference is within rounding as minor, not mismatch or missing', () => {
    const summary = calculateMatchSummary({
      po: doc({ ...base, total_amount: 550000, line_items: [line(500000)] }),
      invoice: doc({ ...base, total_amount: 550600, line_items: [line(500000)] }),
      grn: doc({ ...base, total_amount: 550000, line_items: [line(500000)] }),
    });
    expect(summary.status).toBe('minor');
    expect(summary.mismatchFields).toBe(0);
    expect(summary.minorFields).toBe(1);
  });

  it('prefers the backend reconciliation status when there is one', () => {
    expect(resolveMatchStatus('minor_diff', 'mismatch')).toBe('minor');
    expect(resolveMatchStatus('major_diff', 'matched')).toBe('mismatch');
    expect(resolveMatchStatus(null, 'missing')).toBe('missing');
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

describe('aggregateExtractedData', () => {
  const file = (docType, data) => ({ doc_type: docType, status: 'completed', ai_extraction: { extracted_data: data } });
  const base = { supplier_name: 'NCC A', supplier_tax_id: '0101', vat_rate_pct: 10 };

  it('merges files of one type: sums totals and keeps every line item', () => {
    const merged = aggregateExtractedData([
      file('grn', { ...base, grn_number: 'GRN-1', total_amount: 110, line_items: [{ sku: 'A', item_name: 'Bút', qty: 1, price: 100, amount: 100 }] }),
      file('grn', { ...base, grn_number: 'GRN-2', total_amount: 220, line_items: [{ sku: 'B', item_name: 'Vở', qty: 2, price: 100, amount: 200 }] }),
      file('po', { ...base, total_amount: 999 }),
    ], 'grn');

    expect(merged.document_number).toBe('GRN-1, GRN-2');
    expect(merged.total_amount).toBe(330);
    expect(merged.line_items.map((item) => item.sku)).toEqual(['A', 'B']);
  });

  it('adds quantities of the same SKU across files', () => {
    const merged = aggregateExtractedData([
      file('grn', { ...base, line_items: [{ sku: 'A', qty: 1, price: 100, amount: 100 }] }),
      file('grn', { ...base, line_items: [{ sku: 'A', qty: 3, price: 100, amount: 300 }] }),
    ], 'grn');

    expect(merged.line_items).toHaveLength(1);
    expect(merged.line_items[0]).toMatchObject({ qty: 4, amount: 400, price: 100 });
  });

  it('returns null when the batch has no file of that type', () => {
    expect(aggregateExtractedData([file('po', base)], 'grn')).toBeNull();
  });
});

describe('detectForeignCopy', () => {
  const line = (sku) => ({ sku, qty: 1, price: 100, amount: 100 });
  const ours = { supplier_name: 'May An Phát', supplier_tax_id: '0101' };

  it('flags a copy whose supplier and items belong to another transaction', () => {
    const result = detectForeignCopy({
      po: doc({ ...ours, line_items: [line('A'), line('B')] }),
      invoice: doc({ ...ours, line_items: [line('A'), line('B')] }),
      grn: doc({ supplier_name: 'Hưng Thịnh', supplier_tax_id: '0909', line_items: [line('X'), line('Y'), line('Z')] }),
    });
    expect(result).toMatchObject({ copy: 'grn', label: 'GRN', supplierName: 'Hưng Thịnh' });
  });

  it('does not flag a real mismatch from the same supplier', () => {
    expect(detectForeignCopy({
      po: doc({ ...ours, line_items: [line('A')] }),
      invoice: doc({ ...ours, line_items: [{ ...line('A'), price: 120 }] }),
      grn: doc({ ...ours, line_items: [line('A')] }),
    })).toBeNull();
  });

  it('does not flag a different supplier name when most items are shared', () => {
    expect(detectForeignCopy({
      po: doc({ supplier_name: 'May An Phat', line_items: [line('A'), line('B')] }),
      invoice: doc({ supplier_name: 'May An Phat', line_items: [line('A'), line('B')] }),
      grn: doc({ supplier_name: 'Cong ty May An Phat', line_items: [line('A'), line('B')] }),
    })).toBeNull();
  });
});
