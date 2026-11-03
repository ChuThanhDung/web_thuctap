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

// Quy tắc cố định (PRODUCT.md): số tiền lệch tối đa 1.000 đ là do làm tròn, xếp "lệch nhỏ"; quá mức này là lệch lớn.
// Đơn giá, số lượng, MST, thuế suất không có ngưỡng: phải khớp tuyệt đối.
export const MINOR_AMOUNT_TOLERANCE = 1000;

/** So sánh các số tiền: 'matched' (lệch ≤ 1 đ), 'minor' (≤ 1.000 đ), 'mismatch', hoặc 'missing' khi thiếu giá trị. */
export function compareAmounts(values) {
  const numbers = values.map(toNumber);
  if (numbers.some((value) => value === null)) return 'missing';
  const spread = Math.max(...numbers) - Math.min(...numbers);
  if (spread <= 1) return 'matched';
  return spread <= MINOR_AMOUNT_TOLERANCE ? 'minor' : 'mismatch';
}

/** Như compareAmounts nhưng trả kết quả hiển thị cho một ô thành tiền (giá trị '-' coi là trống). */
export function compareAmountResult(values) {
  const cleaned = values.map((value) => (value === '-' ? null : value));
  if (cleaned.every((value) => value === null || value === undefined || value === '')) {
    return { result: 'Chưa có dữ liệu', severity: 'warning' };
  }
  return comparisonStatusToResult(compareAmounts(cleaned));
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

  // Hóa đơn và PO phải ghi tổng tiền; GRN được phép không ghi (nhiều phiếu nhập chỉ ghi số lượng), giống engine ở backend.
  if (poTotal === null || invoiceTotal === null) return 'missing';
  const poInvoice = compareAmounts([poTotal, invoiceTotal]);
  if (poInvoice === 'mismatch') return 'mismatch';
  if (grnTotal === null) return poInvoice;

  let grnInvoice = compareAmounts([grnTotal, invoiceTotal]);
  if (grnInvoice === 'mismatch') {
    // Phiếu nhập kho thường ghi tổng chưa VAT: thử cộng VAT theo thuế suất PO trước khi kết luận lệch.
    const vatRate = inferVatRate(docs.po);
    if (vatRate > 0) grnInvoice = compareAmounts([grnTotal * (1 + vatRate / 100), invoiceTotal]);
  }
  if (grnInvoice === 'mismatch') return 'mismatch';
  return poInvoice === 'minor' || grnInvoice === 'minor' ? 'minor' : 'matched';
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
  // Hổ phách dành cho lệch nhỏ; `minor` để phân biệt với "thiếu dữ liệu" (cũng là mức cảnh báo).
  if (status === 'minor') return { result: 'Lệch nhỏ · trong ngưỡng làm tròn 1.000 đ', severity: 'warning', minor: true };
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
    if (matchingValues.length === 1) return 'bg-tone-danger-bg font-semibold text-tone-danger-fg';
  }
  if (status === 'warning' && !hasValue) return 'text-fg-subtle';
  return 'text-fg-muted';
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
      compareAmounts([getLineAmount(poItem), getLineAmount(invoiceItem), getLineAmount(grnItem)]),
    ];

    if (statuses.includes('mismatch')) return 'mismatch';
    if (statuses.includes('missing')) return 'missing';
    if (statuses.includes('minor')) return 'minor';
    return 'matched';
  });
}

// Trường trống ở cả ba liên (ví dụ chứng từ không ghi thuế suất) không có gì để đối chiếu: bỏ qua, không tính là thiếu.
function isFieldAbsentEverywhere(docs, field) {
  const types = ['po', 'invoice', 'grn'];
  if (types.some((type) => !docs[type] || docs[type].missing)) return false;
  if (field === 'vat_rate_pct') return types.every((type) => inferVatRate(docs[type]) <= 0);
  return types.every((type) => normalizeComparableValue(rawValue(docs[type], field)) === '');
}

export function calculateMatchSummary(docs) {
  const documentStatuses = SUMMARY_FIELDS
    .filter((field) => !isFieldAbsentEverywhere(docs, field))
    .map((field) => compareDocumentField(docs, field));
  const lineStatuses = getLineItemComparisonStatus(docs);
  const statuses = [...documentStatuses, ...lineStatuses];

  const checkedFields = statuses.length;
  const mismatchFields = statuses.filter((status) => status === 'mismatch').length;
  const warningFields = statuses.filter((status) => status === 'missing').length;
  const minorFields = statuses.filter((status) => status === 'minor').length;
  // Lệch nhỏ (làm tròn) vẫn tính là khớp cho tỉ lệ; trạng thái tách riêng để tô hổ phách.
  const matchedFields = statuses.filter((status) => status === 'matched').length + minorFields;
  const matchRate = checkedFields === 0 ? 0 : Math.round((matchedFields / checkedFields) * 100);
  const status = mismatchFields > 0
    ? 'mismatch'
    : matchRate === 100
      ? (minorFields > 0 ? 'minor' : 'matched')
      : 'missing';

  return {
    checkedFields,
    matchedFields,
    mismatchFields,
    minorFields,
    warningFields,
    matchRate,
    status,
  };
}

/**
 * Kết quả đối soát của một bộ, một nguồn cho mọi nơi hiển thị: ưu tiên `reconciliation_status` của backend
 * (engine dùng bảng ngưỡng), chỉ khi chưa có mới dùng phép tính ở frontend.
 */
export function resolveMatchStatus(backendStatus, computedStatus) {
  if (backendStatus === 'matched') return 'matched';
  if (backendStatus === 'minor_diff') return 'minor';
  // Backend xếp "thiếu tổng tiền trên hóa đơn/PO" vào major_diff để chặn duyệt; khi không có trường nào lệch thật,
  // đó là thiếu dữ liệu chứ không phải lệch lớn.
  if (backendStatus === 'major_diff') return computedStatus === 'missing' ? 'missing' : 'mismatch';
  return computedStatus;
}

/** Trạng thái đối chiếu từ số trường đã tính sẵn trên một bộ (matchRate, mismatchFields), cùng quy tắc với calculateMatchSummary. */
export function batchMatchStatus(batch) {
  const computed = batch?.mismatchFields > 0
    ? 'mismatch'
    : batch?.matchRate === 100
      ? (batch?.minorFields > 0 ? 'minor' : 'matched')
      : 'missing';
  return resolveMatchStatus(batch?.reconciliationStatus, computed);
}

/** Nhãn kết quả của một bộ theo cách kế toán đọc, thay cho phần trăm khớp. */
export function matchStatusLabel(status) {
  if (status === 'matched') return 'Ba liên khớp';
  if (status === 'minor') return 'Lệch nhỏ (làm tròn)';
  if (status === 'mismatch') return 'Lệch lớn';
  return 'Thiếu dữ liệu';
}

function getFileExtraction(file) {
  return file?.ai_extraction?.extracted_data || {};
}

function getDocumentNumber(data, docType) {
  if (data.document_number) return data.document_number;
  if (docType === 'po') return data.po_number;
  if (docType === 'invoice') return data.invoice_number;
  if (docType === 'grn') return data.grn_number;
  return null;
}

function getDocumentDate(data, docType) {
  if (data.document_date) return data.document_date;
  if (docType === 'po') return data.po_date;
  if (docType === 'invoice') return data.invoice_date;
  if (docType === 'grn') return data.grn_date;
  return null;
}

/** Gộp dữ liệu trích xuất của nhiều file cùng loại trong một bộ (ví dụ 2 phiếu nhập kho): cộng tổng tiền, cộng dòng hàng trùng SKU/tên. */
export function aggregateExtractedData(files, docType) {
  const validFiles = (files || []).filter(
    (f) => f.doc_type === docType && (f.ai_extraction?.extracted_data || f.status === 'completed')
  );
  if (validFiles.length === 0) return null;

  const docNumbers = [];
  const docDates = [];
  const suppliers = [];
  const taxIds = [];
  let totalAmount = 0;
  let hasTotalAmount = false;
  let vatRate = null;
  const lineItemsMap = new Map();
  const anonymousLineItems = [];

  validFiles.forEach((file) => {
    const data = getFileExtraction(file) || {};
    const docNum = getDocumentNumber(data, docType);
    if (docNum && !docNumbers.includes(docNum)) docNumbers.push(docNum);

    const docDate = getDocumentDate(data, docType);
    if (docDate && !docDates.includes(docDate)) docDates.push(docDate);

    if (data.supplier_name && !suppliers.includes(data.supplier_name)) suppliers.push(data.supplier_name);
    if (data.supplier_tax_id && !taxIds.includes(data.supplier_tax_id)) taxIds.push(data.supplier_tax_id);

    const fileTotal = toNumber(data.total_amount);
    if (fileTotal !== null) {
      totalAmount += fileTotal;
      hasTotalAmount = true;
    }

    if (vatRate === null) {
      const fileVat = toNumber(data.vat_rate_pct ?? data.tax_rate_pct);
      if (fileVat !== null && fileVat > 0) vatRate = fileVat;
    }

    const items = Array.isArray(data.line_items) ? data.line_items : [];
    items.forEach((item) => {
      const key = getItemIdentityKey(item);
      if (!key) {
        anonymousLineItems.push({ ...item });
        return;
      }

      const qty = toNumber(item.qty) || 0;
      const price = toNumber(item.price);
      const amount = toNumber(item.amount ?? item.line_total) ?? (price !== null ? qty * price : 0);

      if (!lineItemsMap.has(key)) {
        lineItemsMap.set(key, {
          ...item,
          qty,
          price,
          amount,
          _weightedPriceAmount: amount,
          _weightedPriceQty: qty,
        });
      } else {
        const existing = lineItemsMap.get(key);
        existing.qty += qty;
        existing.amount += amount;
        existing._weightedPriceAmount += amount;
        existing._weightedPriceQty += qty;
      }
    });
  });

  const aggregatedLineItems = [...lineItemsMap.values()].map((item) => {
    const itemCopy = { ...item };
    if (itemCopy._weightedPriceQty > 0) {
      itemCopy.price = itemCopy._weightedPriceAmount / itemCopy._weightedPriceQty;
    }
    delete itemCopy._weightedPriceAmount;
    delete itemCopy._weightedPriceQty;
    return itemCopy;
  }).concat(anonymousLineItems);

  return {
    document_number: docNumbers.join(', '),
    document_date: docDates.join(', '),
    supplier_name: suppliers[0] || null,
    supplier_tax_id: taxIds[0] || null,
    total_amount: hasTotalAmount ? totalAmount : null,
    vat_rate_pct: vatRate,
    line_items: aggregatedLineItems,
  };
}

const COPY_LABELS = { po: 'PO', invoice: 'HĐ', grn: 'GRN' };

function lineItemKeys(doc) {
  const items = getExtractionData(doc)?.line_items || [];
  return new Set(items.map(getItemIdentityKey).filter(Boolean));
}

/**
 * Liên gắn nhầm: một liên có nhà cung cấp khác hẳn hai liên còn lại (hai liên kia trùng nhau)
 * và gần như không có mặt hàng chung (dưới 20%). Đây là chứng từ của giao dịch khác,
 * không phải chênh lệch cần nhà cung cấp sửa. Trả null khi không phát hiện.
 */
export function detectForeignCopy(docs) {
  const types = ['po', 'invoice', 'grn'];
  if (types.some((type) => !docs?.[type] || docs[type].missing)) return null;
  const taxIds = types.map((type) => normalizeTaxId(rawValue(docs[type], 'supplier_tax_id')));
  const names = types.map((type) => normalizeItemText(rawValue(docs[type], 'supplier_name')));
  // So MST khi cả ba liên đều có; không thì so tên nhà cung cấp.
  const suppliers = taxIds.every(Boolean) ? taxIds : names;
  if (suppliers.some((value) => !value)) return null;

  for (let index = 0; index < types.length; index += 1) {
    const others = types.filter((_, otherIndex) => otherIndex !== index);
    const [first, second] = types.map((_, i) => i).filter((i) => i !== index).map((i) => suppliers[i]);
    if (first !== second || suppliers[index] === first) continue;

    const own = lineItemKeys(docs[types[index]]);
    if (own.size === 0) continue;
    const shared = new Set([...lineItemKeys(docs[others[0]]), ...lineItemKeys(docs[others[1]])]);
    const overlap = [...own].filter((key) => shared.has(key)).length / own.size;
    if (overlap < 0.2) {
      return {
        copy: types[index],
        label: COPY_LABELS[types[index]],
        supplierName: rawValue(docs[types[index]], 'supplier_name') || '',
      };
    }
  }
  return null;
}

/** Dữ liệu ba liên của một bộ lấy thẳng từ API (gộp khi một loại có nhiều file), cho các trang không dựng chi tiết. */
export function docsFromApiBatch(batch) {
  return ['po', 'invoice', 'grn'].reduce((acc, type) => {
    const files = (batch?.files || []).filter((file) => file.doc_type === type);
    if (files.length === 0) acc[type] = null;
    else if (files.length === 1) acc[type] = files[0]?.ai_extraction?.extracted_data || {};
    else acc[type] = aggregateExtractedData(files, type);
    return acc;
  }, {});
}
