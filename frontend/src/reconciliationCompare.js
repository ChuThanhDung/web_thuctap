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

function getExtractionData(doc) {
  if (!doc || doc.missing) return null;
  return doc.extractedData || doc;
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

export function getComparisonCellClass(status, value, peerValues = [value]) {
  const normalizedDisplayValue = normalizeComparableValue(value);
  const hasValue = normalizedDisplayValue !== '' && normalizedDisplayValue !== '-';
  if (status === 'danger' && hasValue) {
    const normalizedValue = normalizedDisplayValue;
    const matchingValues = peerValues
      .map(normalizeComparableValue)
      .filter(Boolean)
      .filter((peerValue) => peerValue === normalizedValue);
    if (matchingValues.length === 1) return 'text-rose-600 dark:text-rose-400';
  }
  if (status === 'warning' && !hasValue) return 'text-amber-700 dark:text-amber-400';
  return 'text-slate-600 dark:text-slate-300';
}

const SUMMARY_FIELDS = ['supplier_name', 'supplier_tax_id', 'vat_rate_pct', 'total_amount'];

function normalizeItemText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeItemSku(value) {
  return String(value || '').trim().toLowerCase();
}

function getItemIdentityKey(item) {
  const sku = normalizeItemSku(item?.sku);
  if (sku) return `sku:${sku}`;
  const name = normalizeItemText(item?.item_name);
  return name ? `name:${name}` : '';
}

function getItemNameKey(item) {
  const name = normalizeItemText(item?.item_name);
  return name ? `name:${name}` : '';
}

function collectLineItemBases(...itemGroups) {
  const byIdentity = new Map();
  const anonymous = [];

  itemGroups.forEach((items) => {
    items.forEach((item) => {
      const key = getItemIdentityKey(item);
      if (!key) {
        anonymous.push(item);
        return;
      }
      const nameKey = getItemNameKey(item);
      if (key.startsWith('sku:') && nameKey && byIdentity.has(nameKey)) {
        return;
      }
      if (key.startsWith('name:')) {
        const sameNameSkuKey = [...byIdentity.keys()].find((existingKey) => (
          existingKey.startsWith('sku:') && getItemNameKey(byIdentity.get(existingKey)) === key
        ));
        if (sameNameSkuKey) return;
      }
      if (!byIdentity.has(key)) byIdentity.set(key, item);
    });
  });

  return [...byIdentity.values(), ...anonymous];
}

function findItemByIdentity(items, sourceItem) {
  const sourceSku = normalizeItemSku(sourceItem?.sku);
  if (sourceSku) {
    const foundBySku = items.find((item) => normalizeItemSku(item?.sku) === sourceSku);
    if (foundBySku) return foundBySku;
  }

  const sourceName = normalizeItemText(sourceItem?.item_name);
  if (sourceName) {
    const foundByName = items.find((item) => normalizeItemText(item?.item_name) === sourceName);
    if (foundByName) return foundByName;
  }

  return {};
}

function getLineAmount(item) {
  const explicitAmount = toNumber(item?.amount ?? item?.line_total ?? item?.total_amount);
  if (explicitAmount !== null) return explicitAmount;

  const qty = toNumber(item?.qty);
  const price = toNumber(item?.price);
  if (qty === null || price === null) return null;
  return qty * price;
}

export function getLineItemComparisonStatus(docs) {
  const poItems = getExtractionData(docs.po)?.line_items || [];
  const invoiceItems = getExtractionData(docs.invoice)?.line_items || [];
  const grnItems = getExtractionData(docs.grn)?.line_items || [];
  const baseItems = collectLineItemBases(poItems, invoiceItems, grnItems);

  return baseItems.map((baseItem) => {
    const poItem = findItemByIdentity(poItems, baseItem);
    const invoiceItem = findItemByIdentity(invoiceItems, baseItem);
    const grnItem = findItemByIdentity(grnItems, baseItem);

    const statuses = [
      compareValues([poItem.qty, invoiceItem.qty, grnItem.qty]),
      compareValues([poItem.price, invoiceItem.price, grnItem.price]),
      compareValues([getLineAmount(poItem), getLineAmount(invoiceItem), getLineAmount(grnItem)]),
    ];

    if (statuses.includes('mismatch')) return 'mismatch';
    if (statuses.includes('missing')) return 'missing';
    return 'matched';
  });
}

export function calculateMatchSummary(docs) {
  const documentStatuses = SUMMARY_FIELDS.map((field) => compareDocumentField(docs, field));
  const lineStatuses = getLineItemComparisonStatus(docs);
  const statuses = [...documentStatuses, ...lineStatuses];

  const checkedFields = statuses.length;
  const mismatchFields = statuses.filter((status) => status === 'mismatch').length;
  const warningFields = statuses.filter((status) => status === 'missing').length;
  const matchedFields = statuses.filter((status) => status === 'matched').length;
  const matchRate = checkedFields === 0 ? 0 : Math.round((matchedFields / checkedFields) * 100);
  const status = matchRate === 100
    ? 'matched'
    : mismatchFields > 0
      ? 'mismatch'
      : 'missing';

  return {
    checkedFields,
    matchedFields,
    mismatchFields,
    warningFields,
    matchRate,
    status,
  };
}
