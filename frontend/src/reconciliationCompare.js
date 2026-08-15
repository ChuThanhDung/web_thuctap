function rawValue(doc, key) {
  if (!doc || doc.missing) return null;
  return doc.extractedData?.[key] ?? doc[key] ?? null;
}

export function normalizeComparableValue(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim().toLowerCase();
}

function normalizeTaxId(value) {
  return String(value || '').replace(/\D/g, '');
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/[^\d,.-]/g, '');

  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');
  if (commaIndex > -1 && dotIndex > -1) {
    text = commaIndex > dotIndex
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (commaIndex > -1) {
    const [, decimalPart = ''] = text.split(',');
    text = decimalPart.length > 0 && decimalPart.length <= 2
      ? text.replace(',', '.')
      : text.replace(/,/g, '');
  } else if (dotIndex > -1) {
    const [, decimalPart = ''] = text.split('.');
    text = decimalPart.length > 0 && decimalPart.length <= 2
      ? text
      : text.replace(/\./g, '');
  }

  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function almostEqual(a, b) {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= 1;
}

export function inferVatRate(...docs) {
  for (const doc of docs) {
    if (!doc || doc.missing) continue;
    const data = doc.extractedData || doc;
    const docRate = toNumber(data.vat_rate_pct ?? data.tax_rate_pct);
    if (docRate && docRate > 0) return docRate;

    const items = Array.isArray(data.line_items) ? data.line_items : [];
    for (const item of items) {
      const itemRate = toNumber(item?.vat_rate_pct ?? item?.tax_rate_pct);
      if (itemRate && itemRate > 0) return itemRate;
    }
  }
  return 0;
}

function documentHasVat(doc) {
  if (!doc || doc.missing) return false;
  const data = doc.extractedData || doc;
  if (toNumber(data.vat_rate_pct ?? data.tax_rate_pct) > 0) return true;
  if (toNumber(data.vat_amount ?? data.tax_amount ?? data.total_tax_amount) > 0) return true;

  const items = Array.isArray(data.line_items) ? data.line_items : [];
  return items.some((item) => (
    toNumber(item?.vat_rate_pct ?? item?.tax_rate_pct) > 0
    || toNumber(item?.vat_amount ?? item?.tax_amount ?? item?.total_tax_amount) > 0
  ));
}

export function compareValues(values) {
  const normalized = values.map(normalizeComparableValue);
  const present = normalized.filter(Boolean);
  if (present.length === 0) return 'missing';
  if (present.length < values.length) return 'missing';
  return present.every((value) => value === present[0]) ? 'matched' : 'mismatch';
}

export function compareTaxId(docs) {
  const poTaxId = normalizeTaxId(rawValue(docs.po, 'supplier_tax_id'));
  const invoiceTaxId = normalizeTaxId(rawValue(docs.invoice, 'supplier_tax_id'));
  if (!poTaxId || !invoiceTaxId) return 'missing';
  return poTaxId === invoiceTaxId ? 'matched' : 'mismatch';
}

export function compareVatRate(docs) {
  const poVatRate = inferVatRate(docs.po);
  const invoiceVatRate = inferVatRate(docs.invoice);
  if (poVatRate <= 0 || invoiceVatRate <= 0) return 'missing';

  const grnVatRate = inferVatRate(docs.grn);
  const effectiveGrnVatRate = grnVatRate > 0 ? grnVatRate : poVatRate;
  return almostEqual(invoiceVatRate, poVatRate) && almostEqual(effectiveGrnVatRate, poVatRate)
    ? 'matched'
    : 'mismatch';
}

export function compareTotalAmount(docs) {
  const poTotal = toNumber(rawValue(docs.po, 'total_amount'));
  const invoiceTotal = toNumber(rawValue(docs.invoice, 'total_amount'));
  const grnTotal = toNumber(rawValue(docs.grn, 'total_amount'));

  if (poTotal === null || invoiceTotal === null) return 'missing';
  if (!almostEqual(poTotal, invoiceTotal)) return 'mismatch';
  if (grnTotal === null) return 'missing';
  if (almostEqual(grnTotal, invoiceTotal)) return 'matched';

  const vatRate = inferVatRate(docs.po);
  const grnTotalWithVat = vatRate > 0 ? grnTotal * (1 + vatRate / 100) : grnTotal;
  return almostEqual(grnTotalWithVat, invoiceTotal) ? 'matched' : 'mismatch';
}

export function getGrnTotalAdjustment(docs) {
  const grnTotal = toNumber(rawValue(docs.grn, 'total_amount'));
  const vatRate = inferVatRate(docs.po);
  if (grnTotal === null || vatRate <= 0 || documentHasVat(docs.grn)) {
    return null;
  }

  const grnTotalWithVat = grnTotal * (1 + vatRate / 100);
  return { baseTotal: grnTotal, vatRate, adjustedTotal: grnTotalWithVat };
}

export function compareDocumentField(docs, field) {
  if (field === 'supplier_tax_id') return compareTaxId(docs);
  if (field === 'vat_rate_pct' || field === 'tax_rate_pct') return compareVatRate(docs);
  if (field === 'total_amount') return compareTotalAmount(docs);
  return compareValues(['po', 'invoice', 'grn'].map((type) => rawValue(docs[type], field)));
}

export function comparisonStatusToResult(status) {
  if (status === 'matched') return { result: 'Khớp', severity: 'ok' };
  if (status === 'missing') return { result: 'Thiếu dữ liệu', severity: 'warning' };
  return { result: 'Có chênh lệch', severity: 'danger' };
}
