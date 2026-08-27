import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Eye,
  FileSearch,
  FileText,
  Loader2,
  PackageCheck,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { fetchUploadFileBlob, finalApproveDocumentBatch, rejectDocumentBatch } from '../api.js';
import {
  fetchDocumentBatchesWithCache,
  getCachedBatches,
  subscribeBatchCache,
  updateCachedBatchItem,
} from '../services/batchCache.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import FilePreviewModal from '../components/FilePreviewModal.jsx';
import ReconciliationHistorySection from '../components/ReconciliationHistorySection.jsx';
import {
  calculateMatchSummary,
  compareDocumentField,
  comparisonStatusToResult,
  compareValues as compareRawValues,
  getComparisonCellClass,
  getGrnTotalAdjustment,
  inferVatRate,
  toNumber,
} from '../reconciliationCompare.js';
import { repairTextDeep } from '../text.js';

const STATUS_META = {
  missing: {
    label: 'Thiếu dữ liệu',
    tone: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    rail: 'bg-amber-500',
  },
  matching: {
    label: 'Đang đối soát',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    rail: 'bg-emerald-500',
  },
  matched: {
    label: 'Khớp hoàn toàn',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rail: 'bg-emerald-500',
  },
  approved: {
    label: 'Đã duyệt',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rail: 'bg-emerald-500',
  },
  final_approved: {
    label: 'Đã duyệt cuối',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rail: 'bg-emerald-500',
  },
  rejected: {
    label: 'Đã từ chối',
    tone: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
    rail: 'bg-red-500',
  },
  mismatch: {
    label: 'Lệch',
    tone: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    rail: 'bg-rose-500',
  },
};

const DOC_TYPES = [
  { key: 'po', short: 'PO', label: 'Đơn đặt hàng', icon: ShoppingCart },
  { key: 'invoice', short: 'Invoice', label: 'Hóa đơn', icon: FileText },
  { key: 'grn', short: 'GRN', label: 'Phiếu nhập kho', icon: PackageCheck },
];
const BATCHES_PER_PAGE = 5;

function getFileExt(filename = '') {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildXmlPreviewHtml(filename, xmlText) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(filename)}</title>
  <style>
    body { margin: 0; background: #f6f9fc; color: #0d253d; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; border-bottom: 1px solid #e3e8ee; background: rgba(255,255,255,.94); padding: 14px 20px; backdrop-filter: blur(12px); }
    h1 { margin: 0; overflow-wrap: anywhere; font-size: 15px; font-weight: 700; }
    main { padding: 20px; }
    pre { margin: 0; overflow: auto; border: 1px solid #e3e8ee; border-radius: 8px; background: #fff; padding: 18px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <header><h1>${escapeHtml(filename)}</h1></header>
  <main><pre>${escapeHtml(xmlText)}</pre></main>
</body>
</html>`;
}

function getCompletion(batch) {
  return DOC_TYPES.filter((docType) => !batch.docs[docType.key]?.missing).length;
}

function isSameBatchId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function isApiBatchReady(batch) {
  if (Array.isArray(batch?.missing_doc_types)) return batch.missing_doc_types.length === 0;
  if (batch?.status === 'ready') return true;

  const uploadedTypes = new Set((batch?.files || []).map((file) => file.doc_type).filter(Boolean));
  return DOC_TYPES.every((type) => uploadedTypes.has(type.key));
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDateInput(value, boundary) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return boundary === 'end' ? endOfDay(date) : startOfDay(date);
}

function toDateInputValue(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseBatchDate(value) {
  if (!value) return null;
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinDateRange(batch, range) {
  if (!range.start && !range.end) return true;
  const date = parseBatchDate(batch?.updatedAt);
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function getStatusIcon(status) {
  if (status === 'matched' || status === 'approved' || status === 'final_approved') return CheckCircle2;
  if (status === 'mismatch' || status === 'rejected') return AlertTriangle;
  if (status === 'matching') return Clock3;
  return ClipboardList;
}

function MatchMeter({ value }) {
  const barColor = value >= 98 ? 'bg-emerald-500' : value >= 85 ? 'bg-amber-500' : value > 0 ? 'bg-rose-500' : 'bg-slate-300';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tỉ lệ khớp</span>
        <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function DocumentCard({ type, doc, docs, onOpenFile }) {
  const Icon = type.icon;
  const files = Array.isArray(docs) && docs.length > 0 ? docs : doc ? [doc] : [];
  const firstDoc = files[0] || {};
  const isMissing = firstDoc.missing;
  const typeLabel = files.length > 1 ? `${type.label} (${files.length} file)` : type.label;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.06)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isMissing ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{typeLabel}</p>
            <p className={`mt-1 truncate text-xs ${isMissing ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {isMissing ? 'Chưa có chứng từ' : `${files.length} chứng từ`}
            </p>
          </div>
        </div>
      </div>

      {!isMissing && (
        <div className="mt-4 space-y-2">
          {files.map((item, idx) => (
            <div key={`${item.file?.id || item.filename || idx}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
              <span className="min-w-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">{item.filename}</span>
              {item.file && (
                <button
                  type="button"
                  onClick={() => onOpenFile?.(item.file)}
                  className="btn-ghost h-8 w-8 shrink-0 rounded-lg p-0"
                  title="Xem chứng từ gốc"
                  aria-label={`Xem chứng từ gốc ${item.filename}`}
                >
                  <Eye size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultPill({ severity, text }) {
  const className = {
    ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  }[severity];

  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${className}`}>{text}</span>;
}

const LINE_ITEM_FIELDS = ['Mã hàng', 'Tên hàng', 'Đơn vị tính', 'Số lượng', 'Đơn giá'];

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  return String(repairTextDeep(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round(numericValue <= 1 ? numericValue * 100 : numericValue);
}

function getExtractionData(file) {
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

function getEmptyDocs() {
  return DOC_TYPES.reduce((acc, type) => {
    acc[type.key] = { filename: '', missing: true, fields: {} };
    return acc;
  }, {});
}

function mapFileToDocument(file, docType) {
  const extractedData = getExtractionData(file);
  const confidence = formatPercent(file?.ai_extraction?.confidence);
  const extractedAt = file?.ai_extraction?.created_at?.split(' ')[1] || file?.created_at?.split(' ')[1] || '-';

  return {
    filename: file.filename,
    extractedAt,
    confidence,
    fields: {
      'Số chứng từ': formatDisplayValue(getDocumentNumber(extractedData, docType)),
      'Nhà cung cấp': formatDisplayValue(extractedData.supplier_name),
      'Mã số thuế': formatDisplayValue(extractedData.supplier_tax_id),
      'Ngày chứng từ': formatDisplayValue(getDocumentDate(extractedData, docType)),
      'Tổng tiền': formatDisplayValue(extractedData.total_amount),
    },
    extractedData,
    file,
  };
}

function getComparableValue(doc, key) {
  if (!doc || doc.missing) return '-';
  const value = doc.extractedData?.[key];
  return formatDisplayValue(value);
}

function formatVatRate(value) {
  return value > 0 ? formatDisplayValue(value) : '-';
}

function compareValues(values) {
  const status = compareRawValues(values.map((value) => (value === '-' ? '' : value)));
  if (status === 'missing' && values.every((value) => value === '-')) {
    return { result: 'Chưa có dữ liệu', severity: 'warning' };
  }
  return comparisonStatusToResult(status);
}

function buildComparisons(docs) {
  const rows = [
    ['Nhà cung cấp', 'supplier_name'],
    ['Mã số thuế', 'supplier_tax_id'],
    ['Thuế suất VAT', 'vat_rate_pct'],
    ['Tổng tiền', 'total_amount'],
  ];

  return rows.map(([field, key]) => {
    const values = [
      getComparableValue(docs.po, key),
      getComparableValue(docs.invoice, key),
      getComparableValue(docs.grn, key),
    ];
    if (key === 'vat_rate_pct') {
      const poVatRate = inferVatRate(docs.po);
      const invoiceVatRate = inferVatRate(docs.invoice);
      const grnVatRate = inferVatRate(docs.grn);
      values[0] = formatVatRate(poVatRate);
      values[1] = formatVatRate(invoiceVatRate);
      values[2] = grnVatRate > 0 ? formatVatRate(grnVatRate) : formatVatRate(poVatRate);
    }
    if (key === 'total_amount') {
      const grnAdjustment = getGrnTotalAdjustment(docs);
      if (grnAdjustment) {
        values[2] = formatDisplayValue(grnAdjustment.adjustedTotal);
      }
    }
    const result = comparisonStatusToResult(compareDocumentField(docs, key));
    return {
      field,
      po: values[0],
      invoice: values[1],
      grn: values[2],
      ...result,
    };
  }).sort((a, b) => ({ danger: 0, warning: 1, ok: 2 }[a.severity] - ({ danger: 0, warning: 1, ok: 2 }[b.severity])));
}

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

function buildLineItems(docs) {
  const poItems = docs.po?.extractedData?.line_items || [];
  const invoiceItems = docs.invoice?.extractedData?.line_items || [];
  const grnItems = docs.grn?.extractedData?.line_items || [];
  const baseItems = collectLineItemBases(poItems, invoiceItems, grnItems);

  return baseItems.map((baseItem, index) => {
    const poItem = findItemByIdentity(poItems, baseItem);
    const invoiceItem = findItemByIdentity(invoiceItems, baseItem);
    const grnItem = findItemByIdentity(grnItems, baseItem);
    const qtyResult = compareValues([
      formatDisplayValue(poItem.qty),
      formatDisplayValue(invoiceItem.qty),
      formatDisplayValue(grnItem.qty),
    ]);
    const priceResult = compareValues([
      formatDisplayValue(poItem.price),
      formatDisplayValue(invoiceItem.price),
      formatDisplayValue(grnItem.price),
    ]);
    const poAmount = getLineAmount(poItem);
    const invoiceAmount = getLineAmount(invoiceItem);
    const grnAmount = getLineAmount(grnItem);
    const amountResult = compareValues([
      formatDisplayValue(poAmount),
      formatDisplayValue(invoiceAmount),
      formatDisplayValue(grnAmount),
    ]);
    const severity = [qtyResult, priceResult, amountResult].some((item) => item.severity === 'danger')
      ? 'danger'
      : [qtyResult, priceResult, amountResult].some((item) => item.severity === 'warning')
        ? 'warning'
        : 'ok';

    return {
      sku: formatDisplayValue(baseItem.sku || `Dòng ${index + 1}`),
      name: formatDisplayValue(baseItem.item_name || baseItem.name),
      unit: formatDisplayValue(baseItem.unit),
      poQty: formatDisplayValue(poItem.qty),
      invoiceQty: formatDisplayValue(invoiceItem.qty),
      grnQty: formatDisplayValue(grnItem.qty),
      poPrice: formatDisplayValue(poItem.price),
      invoicePrice: formatDisplayValue(invoiceItem.price),
      grnPrice: formatDisplayValue(grnItem.price),
      poAmount: formatDisplayValue(poAmount),
      invoiceAmount: formatDisplayValue(invoiceAmount),
      grnAmount: formatDisplayValue(grnAmount),
      vat: formatVatRate(inferVatRate({ extractedData: baseItem })),
      amount: formatDisplayValue(invoiceAmount || poAmount || grnAmount),
      result: severity === 'danger'
        ? 'Có chênh lệch'
        : severity === 'warning'
          ? 'Thiếu dữ liệu'
          : 'Khớp',
      severity,
      qtySeverity: qtyResult.severity,
      priceSeverity: priceResult.severity,
      amountSeverity: amountResult.severity,
    };
  }).sort((a, b) => ({ danger: 0, warning: 1, ok: 2 }[a.severity] - ({ danger: 0, warning: 1, ok: 2 }[b.severity])));
}

function aggregateExtractedData(files, docType) {
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
    const data = getExtractionData(file) || {};
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

function mapApiBatchToAuditBatch(batch) {
  const isReady = isApiBatchReady(batch);
  const docs = getEmptyDocs();
  const docList = { po: [], invoice: [], grn: [] };

  (batch.files || []).forEach((file) => {
    if (!file.doc_type || !docList[file.doc_type]) return;
    const docObj = mapFileToDocument(file, file.doc_type);
    docList[file.doc_type].push(docObj);
  });

  DOC_TYPES.forEach((type) => {
    const filesOfType = (batch.files || []).filter((f) => f.doc_type === type.key);
    if (filesOfType.length === 0) {
      docs[type.key] = { filename: '', missing: true, fields: {} };
    } else if (filesOfType.length === 1) {
      docs[type.key] = docList[type.key][0];
    } else {
      const aggregatedData = aggregateExtractedData(filesOfType, type.key);
      const fileNames = filesOfType.map((f) => f.filename).join(', ');
      docs[type.key] = {
        filename: `${filesOfType.length} file (${fileNames})`,
        fileCount: filesOfType.length,
        extractedAt: '-',
        confidence: Math.round(
          filesOfType.reduce((acc, f) => acc + (formatPercent(f.ai_extraction?.confidence) || 0), 0) / filesOfType.length
        ),
        fields: {
          'Số chứng từ': formatDisplayValue(aggregatedData?.document_number),
          'Nhà cung cấp': formatDisplayValue(aggregatedData?.supplier_name),
          'Mã số thuế': formatDisplayValue(aggregatedData?.supplier_tax_id),
          'Ngày chứng từ': formatDisplayValue(aggregatedData?.document_date),
          'Tổng tiền': formatDisplayValue(aggregatedData?.total_amount),
        },
        extractedData: aggregatedData,
        file: filesOfType[0],
        isAggregated: true,
        files: filesOfType,
      };
    }
  });

  const comparisons = isReady ? buildComparisons(docs) : [];
  const lineItems = isReady ? buildLineItems(docs) : [];
  const summary = isReady ? calculateMatchSummary(docs) : { matchRate: 0, checkedFields: 0, matchedFields: 0, mismatchFields: 0, warningFields: 3 };
  const rejectionNote = batch.rejection_note || '';
  const isApproved = batch.status === 'approved';
  const isFinalApproved = batch.status === 'final_approved';
  const isRejected = batch.status === 'rejected';

  // Xác định trạng thái hiển thị
  let status = isRejected
    ? 'rejected'
    : isFinalApproved
      ? 'final_approved'
      : isApproved
        ? 'approved'
        : summary.status;

  const backendReconciliationStatus = batch.reconciliation_status;

  return {
    id: String(batch.id),
    batchNumber: batch.batch_number,
    note: batch.note || '',
    rejectionNote,
    history: batch.history || [],
    reconciliationStatus: backendReconciliationStatus || null,
    reconciliationNote: batch.reconciliation_ai_summary || batch.reconciliation_ai_note || '',
    status,
    rawStatus: batch.status,
    isApproved,
    isFinalApproved,
    isRejected,
    updatedAt: batch.updated_at || batch.created_at,
    owner: batch.created_by_name || 'Hệ thống',
    approvedBy: batch.approved_by_name || null,
    chiefApprovedBy: batch.chief_approved_by_name || null,
    matchRate: summary.matchRate,
    checkedFields: summary.checkedFields,
    matchedFields: summary.matchedFields,
    mismatchFields: summary.mismatchFields,
    missingFields: summary.warningFields || 0,
    docs,
    docList,
    comparisons,
    lineItems,
    isReady,
  };
}

function filterChiefBatches(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((batch) => {
      try {
        return mapApiBatchToAuditBatch(batch);
      } catch (err) {
        console.error('Error mapping batch for chief accountant:', err, batch);
        return null;
      }
    })
    .filter((batch) => batch && (batch.isApproved || batch.isFinalApproved || batch.isRejected));
}

export default function ChiefAccountantBatches({ token }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBatchId = searchParams.get('batchId');
  const [batches, setBatches] = useState(() => {
    try {
      const cached = getCachedBatches();
      return cached?.items ? filterChiefBatches(cached.items) : [];
    } catch (err) {
      console.error('Error initializing chief batches from cache:', err);
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => !getCachedBatches()?.items);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
  const [detailBatchId, setDetailBatchId] = useState(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [mobileDocsOpen, setMobileDocsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [rejectingBatch, setRejectingBatch] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [filePreview, setFilePreview] = useState(null);
  const [dateRange, setDateRange] = useState(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    return {
      start: parseDateInput(fromParam, 'start'),
      end: parseDateInput(toParam, 'end'),
    };
  });
  const [currentPage, setCurrentPage] = useState(1);

  const closeFilePreview = () => {
    setFilePreview(null);
  };

  useEffect(() => {
    return () => {
      filePreview?.previewUrl && URL.revokeObjectURL(filePreview.previewUrl);
      filePreview?.downloadUrl && filePreview.downloadUrl !== filePreview.previewUrl && URL.revokeObjectURL(filePreview.downloadUrl);
    };
  }, [filePreview]);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setStatusFilter(statusParam);
    } else {
      setStatusFilter('all');
    }
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam || toParam) {
      setDateRange({
        start: parseDateInput(fromParam, 'start'),
        end: parseDateInput(toParam, 'end'),
      });
    } else {
      setDateRange({ start: null, end: null });
    }
  }, [searchParams]);

  const loadBatches = async (forceRefresh = false) => {
    if (!getCachedBatches()?.items) {
      setIsLoading(true);
    }
    try {
      const response = await fetchDocumentBatchesWithCache(token, { forceRefresh });
      if (response?.items) {
        setBatches(filterChiefBatches(response.items));
      }
    } catch (error) {
      console.error('Failed to load batches:', error);
      if (!getCachedBatches()?.items) {
        setActionError(error.message || 'Không thể tải danh sách batch');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeBatchCache((data) => {
      try {
        if (data?.items) {
          setBatches(filterChiefBatches(data.items));
        }
      } catch (err) {
        console.error('Error updating chief batches from subscription:', err);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function refresh() {
      try {
        const response = await fetchDocumentBatchesWithCache(token, { forceRefresh: true });
        if (!isMounted) return;
        if (response?.items) {
          setBatches(filterChiefBatches(response.items));
        }
      } catch (err) {
        console.error('Failed to refresh chief batches:', err);
      }
    }

    if (token) {
      loadBatches();
      refresh();
    }

    const handleFocus = () => refresh();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [token, requestedBatchId]);

  useEffect(() => {
    if (!requestedBatchId) return;
    const requestedBatch = batches.find((batch) => isSameBatchId(batch.id, requestedBatchId));
    if (requestedBatch) {
      setDetailBatchId(requestedBatch.id);
      setDetailPanelOpen(true);
    }
  }, [batches, requestedBatchId]);

  const requestApproveBatch = (batch) => {
    if (!canApproveBatch(batch)) return;
    setApproveConfirm(batch);
  };

  const handleApproveBatch = async () => {
    if (!canApproveBatch(approveConfirm)) return;
    setIsApproving(true);
    setActionError('');
    try {
      const updated = await finalApproveDocumentBatch(token, approveConfirm.id);
      updateCachedBatchItem(updated);
      setDetailPanelOpen(false);
      setApproveConfirm(null);
    } catch (error) {
      console.error('Failed to approve batch:', error);
      setActionError(error.message || 'Không thể duyệt batch');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectBatch = async (batch) => {
    setRejectingBatch(batch);
    setRejectionReason('');
    setRejectionError('');
  };

  const handleCloseRejectModal = () => {
    if (isRejecting) return;
    setRejectingBatch(null);
    setRejectionReason('');
    setRejectionError('');
  };

  const handleConfirmRejectBatch = async () => {
    const reason = rejectionReason.trim();
    if (!reason) {
      setRejectionError('Vui lòng nhập lý do từ chối.');
      return;
    }
    if (!rejectingBatch) return;

    setIsRejecting(true);
    setRejectionError('');
    try {
      const updated = await rejectDocumentBatch(token, rejectingBatch.id, {
        rejection_note: reason,
      });
      updateCachedBatchItem(updated);
      setDetailPanelOpen(false);
      setRejectingBatch(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Failed to reject batch:', error);
      setRejectionError(error.message || 'Không thể từ chối batch');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleOpenFile = async (file) => {
    if (!file) return;
    try {
      const blob = await fetchUploadFileBlob(token, file);
      const fileExt = getFileExt(file.filename);
      const downloadUrl = URL.createObjectURL(blob);
      let previewUrl = downloadUrl;

      if (fileExt === 'xml') {
        const xmlText = await blob.text();
        const previewHtml = buildXmlPreviewHtml(file.filename, xmlText);
        const previewBlob = new Blob([previewHtml], { type: 'text/html; charset=utf-8' });
        previewUrl = URL.createObjectURL(previewBlob);
      }

      setFilePreview({
        filename: file.filename,
        previewUrl,
        downloadUrl,
      });
    } catch (error) {
      console.error('Failed to open file:', error);
      alert(error.message || 'Không thể mở file');
    }
  };

  const filteredBatches = useMemo(() => {
    let result = batches;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((batch) =>
        isSameBatchId(batch.id, requestedBatchId) ||
        batch.batchNumber.toLowerCase().includes(query) ||
        batch.note.toLowerCase().includes(query) ||
        batch.rejectionNote.toLowerCase().includes(query) ||
        batch.owner.toLowerCase().includes(query) ||
        batch.approvedBy?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'unapproved' || statusFilter === 'pending') {
        result = result.filter((batch) => isSameBatchId(batch.id, requestedBatchId) || batch.rawStatus === 'approved');
      } else if (statusFilter === 'approved' || statusFilter === 'final_approved') {
        result = result.filter((batch) => isSameBatchId(batch.id, requestedBatchId) || batch.rawStatus === 'final_approved');
      } else if (statusFilter === 'rejected') {
        result = result.filter((batch) => isSameBatchId(batch.id, requestedBatchId) || batch.rawStatus === 'rejected' || batch.isRejected);
      } else {
        result = result.filter((batch) => isSameBatchId(batch.id, requestedBatchId) || batch.status === statusFilter || batch.rawStatus === statusFilter);
      }
    }

    if (dateRange.start || dateRange.end) {
      result = result.filter((batch) => isSameBatchId(batch.id, requestedBatchId) || isWithinDateRange(batch, dateRange));
    }

    return result;
  }, [batches, searchQuery, statusFilter, dateRange, requestedBatchId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateRange]);

  const totalPages = Math.ceil(filteredBatches.length / BATCHES_PER_PAGE);
  const paginatedBatches = filteredBatches.slice((currentPage - 1) * BATCHES_PER_PAGE, currentPage * BATCHES_PER_PAGE);

  const detailBatch = useMemo(() => {
    return batches.find((b) => isSameBatchId(b.id, detailBatchId));
  }, [batches, detailBatchId]);

  const handleViewDetails = (batch) => {
    setDetailBatchId(batch.id);
    setDetailPanelOpen(true);
    setMobileDocsOpen(false);
  };

  const handleCloseDetailPanel = () => {
    setDetailPanelOpen(false);
    setDetailBatchId(null);
    setMobileDocsOpen(false);
  };

  const canApproveBatch = (batch) => {
    return batch?.rawStatus === 'approved';
  };

  const canRejectBatch = (batch) => {
    return batch?.rawStatus === 'approved';
  };

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-[#0b0f19] dark:text-slate-100 sm:h-screen">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
              Batch đối soát
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Danh sách batch đã được kế toán viên duyệt
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex justify-end sm:hidden">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((open) => !open)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border text-slate-600 shadow-sm transition-colors dark:text-slate-300 ${
              mobileSearchOpen || searchQuery
                ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300'
                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
            }`}
            aria-label="Tìm kiếm batch"
            aria-expanded={mobileSearchOpen}
          >
            <Search size={18} />
          </button>
        </div>

        {mobileSearchOpen && (
          <div className="relative mt-3 sm:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
            <input
              type="text"
              placeholder="Tìm batch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-10"
            />
          </div>
        )}

        <div className="mt-5 hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Tìm theo mã batch, note, người tạo, người duyệt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-10"
            />
          </div>

          <div className="relative w-full sm:min-w-[200px] sm:w-auto">
            <SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setStatusFilter(nextStatus);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (nextStatus === 'all') {
                    next.delete('status');
                  } else {
                    next.set('status', nextStatus);
                  }
                  return next;
                });
              }}
              className="input-field appearance-none pl-9 pr-9 w-full"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="unapproved">Chưa duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          
          <div className="relative w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setFilterMenuOpen(!filterMenuOpen)}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:w-auto ${
                dateRange.start || dateRange.end
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'btn-secondary'
              }`}
            >
              <SlidersHorizontal size={16} />
              {dateRange.start || dateRange.end ? 'Đang lọc thời gian' : 'Lọc theo thời gian'}
            </button>
            
            {filterMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Từ ngày
                    </label>
                    <input
                      type="date"
                      value={toDateInputValue(dateRange.start)}
                      onChange={(e) => setDateRange({ ...dateRange, start: parseDateInput(e.target.value, 'start') })}
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Đến ngày
                    </label>
                    <input
                      type="date"
                      value={toDateInputValue(dateRange.end)}
                      onChange={(e) => setDateRange({ ...dateRange, end: parseDateInput(e.target.value, 'end') })}
                      className="input-field w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDateRange({ start: null, end: null });
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.delete('from');
                          next.delete('to');
                          return next;
                        });
                        setFilterMenuOpen(false);
                      }}
                      className="btn-secondary flex-1"
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          const fromVal = toDateInputValue(dateRange.start);
                          const toVal = toDateInputValue(dateRange.end);
                          if (fromVal) {
                            next.set('from', fromVal);
                          } else {
                            next.delete('from');
                          }
                          if (toVal) {
                            next.set('to', toVal);
                          } else {
                            next.delete('to');
                          }
                          return next;
                        });
                        setFilterMenuOpen(false);
                      }}
                      className="btn-primary flex-1"
                    >
                      Áp dụng
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {actionError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {actionError}
          </div>
        )}
      </div>

      {/* Batch List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="animate-spin text-emerald-600" size={32} />
          </div>
        ) : paginatedBatches.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-500 dark:text-slate-400">
            <FileSearch size={48} className="mb-3 opacity-50" />
            <p className="text-base">Không tìm thấy batch nào</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="card p-4 transition-all hover:shadow-lg sm:p-6"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="break-words text-lg font-bold text-slate-900 dark:text-slate-100 sm:text-xl">
                          {batch.batchNumber}
                        </h3>
                        {batch.status === 'final_approved' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 size={12} />
                            Đã duyệt
                          </span>
                        )}
                        {batch.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle size={12} />
                            Đã từ chối
                          </span>
                        )}
                        {batch.status === 'matched' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 size={12} />
                            Khớp hoàn toàn
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:gap-4">
                        <span>Cập nhật: {batch.updatedAt}</span>
                        <span className="hidden sm:inline">•</span>
                        <span>Tạo bởi: {batch.owner}</span>
                      </div>
                      {batch.note && (
                        <p
                          className="mt-1 max-w-3xl truncate text-sm font-semibold text-slate-700 dark:text-slate-300"
                          title={batch.note}
                        >
                          Note: {batch.note}
                        </p>
                      )}
                      {batch.rejectionNote && (
                        <p
                          className="mt-1 max-w-3xl truncate text-sm font-semibold text-rose-700 dark:text-rose-300"
                          title={batch.rejectionNote}
                        >
                          Lý do từ chối: {batch.rejectionNote}
                        </p>
                      )}
                      
                      {/* Document files */}
                      <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                        {DOC_TYPES.map((type) => {
                          const doc = batch.docs[type.key];
                          const Icon = type.icon;
                          return (
                            <div
                              key={type.key}
                              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                                doc?.missing
                                  ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900'
                                  : 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950'
                              }`}
                            >
                              <Icon size={12} />
                              <span className="font-semibold">{type.short}</span>
                              {!doc?.missing && <span className="max-w-[120px] truncate">{doc.filename}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 xl:flex xl:flex-wrap xl:items-center xl:justify-end">
                      <button
                        type="button"
                        onClick={() => handleViewDetails(batch)}
                        className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:gap-1.5 sm:px-3 sm:text-xs xl:w-auto"
                      >
                        <Eye size={13} />
                        Chi tiết
                      </button>
                      
                      {canApproveBatch(batch) && (
                        <button
                          type="button"
                            onClick={() => requestApproveBatch(batch)}
                          className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-full bg-emerald-600 px-2 text-[11px] font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:gap-1.5 sm:px-3 sm:text-xs xl:w-auto"
                        >
                          <CheckCircle2 size={13} />
                          Duyệt
                        </button>
                      )}
                      
                      {canRejectBatch(batch) && (
                        <button
                          type="button"
                          onClick={() => handleRejectBatch(batch)}
                          className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-full bg-rose-600 px-2 text-[11px] font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 active:scale-[0.98] sm:gap-1.5 sm:px-3 sm:text-xs xl:w-auto"
                        >
                          <X size={13} />
                          Từ chối
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Trang trước
                </button>
                <span className="text-center text-sm text-slate-600 dark:text-slate-400">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Trang sau
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel */}
      {detailPanelOpen && detailBatch && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="card h-dvh w-full max-w-[1360px] overflow-y-auto rounded-none sm:h-auto sm:max-h-[92vh] sm:rounded-xl">
            {/* Panel Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
                    {detailBatch.batchNumber}
                  </h2>
                  <div className="mt-2.5 flex items-center gap-3">
                    {detailBatch.status === 'final_approved' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 size={12} />
                        Đã duyệt
                      </span>
                    )}
                    {detailBatch.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        <AlertTriangle size={12} />
                        Đã từ chối
                      </span>
                    )}
                  </div>
                  {detailBatch.rawStatus === 'rejected' && detailBatch.rejectionNote && (
                    <p className="mt-2 max-w-4xl text-sm font-semibold text-rose-700 dark:text-rose-300">
                      Lý do từ chối: {detailBatch.rejectionNote}
                    </p>
                  )}
                </div>
                
                <div className="grid grid-cols-[1fr_1fr_2.25rem] gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                  {canApproveBatch(detailBatch) && (
                    <button
                      type="button"
                      onClick={() => requestApproveBatch(detailBatch)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:px-3.5 sm:text-sm"
                    >
                      <CheckCircle2 size={14} />
                      Duyệt
                    </button>
                  )}
                  
                  {canRejectBatch(detailBatch) && (
                    <button
                      type="button"
                      onClick={() => handleRejectBatch(detailBatch)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 active:scale-[0.98] sm:px-3.5 sm:text-sm"
                    >
                      <X size={14} />
                      Từ chối
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleCloseDetailPanel}
                    className="inline-flex h-9 w-9 justify-self-end items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 sm:justify-self-auto"
                    aria-label="Đóng chi tiết batch"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Panel Content */}
            <div className="max-h-[calc(92vh-82px)] space-y-4 overflow-y-auto p-3 sm:space-y-5 sm:p-5">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:hidden">
                <button
                  type="button"
                  onClick={() => setMobileDocsOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={mobileDocsOpen}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Chứng từ</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">PO, Invoice và GRN</p>
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${mobileDocsOpen ? 'rotate-180' : ''}`} />
                </button>
                {mobileDocsOpen && (
                  <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
                    {DOC_TYPES.map((type) => {
                      const list = detailBatch.docList?.[type.key] || [];
                      if (list.length === 0) {
                        return (
                          <DocumentCard
                            key={`${type.key}-missing-mobile`}
                            type={type}
                            doc={{ filename: '', missing: true, fields: {} }}
                            onOpenFile={handleOpenFile}
                          />
                        );
                      }
                      return (
                        <DocumentCard
                          key={`${type.key}-mobile`}
                          type={type}
                          docs={list}
                          onOpenFile={handleOpenFile}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                {DOC_TYPES.map((type) => {
                  const list = detailBatch.docList?.[type.key] || [];
                  if (list.length === 0) {
                    return (
                      <DocumentCard
                        key={`${type.key}-missing`}
                        type={type}
                        doc={{ filename: '', missing: true, fields: {} }}
                        onOpenFile={handleOpenFile}
                      />
                    );
                  }
                  return (
                    <DocumentCard
                      key={type.key}
                      type={type}
                      docs={list}
                      onOpenFile={handleOpenFile}
                    />
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Chi tiết hàng hóa</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50">
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Tên hàng / Mã</th>
                        <th className="px-2 py-2.5 text-center text-xs font-bold text-slate-500 dark:text-slate-400">ĐVT</th>
                        <th className="border-l border-dashed border-slate-300 px-2 py-2.5 text-right text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">SL PO</th>
                        <th className="px-2 py-2.5 text-right text-xs font-bold text-slate-500 dark:text-slate-400">SL Invoice</th>
                        <th className="px-2 py-2.5 text-right text-xs font-bold text-slate-500 dark:text-slate-400">SL GRN</th>
                        <th className="border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">Giá PO</th>
                        <th className="px-2.5 py-2.5 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Giá Invoice</th>
                        <th className="px-2.5 py-2.5 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Giá GRN</th>
                        <th className="border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">Tiền PO</th>
                        <th className="px-2.5 py-2.5 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Tiền Invoice</th>
                        <th className="px-2.5 py-2.5 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Tiền GRN</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-slate-500 dark:text-slate-400">Kết quả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detailBatch.lineItems.length > 0 ? (
                        detailBatch.lineItems.map((item, idx) => (
                          <tr key={idx} className="table-row-hover">
                            <td className="px-3 py-2.5 max-w-[240px]">
                              <p className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-snug">{item.name || item.sku}</p>
                              <p className="mt-0.5 text-[11px] font-mono font-medium text-slate-400 dark:text-slate-500">{item.sku}</p>
                            </td>
                            <td className="px-2 py-2.5 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.unit}</td>
                            <td className={`border-l border-dashed border-slate-300 px-2 py-2.5 text-right tabular-nums dark:border-slate-700 ${getComparisonCellClass(item.qtySeverity, item.poQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.poQty}</td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.invoiceQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.invoiceQty}</td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.grnQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.grnQty}</td>
                            <td className={`border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right tabular-nums dark:border-slate-700 whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.poPrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.poPrice}</td>
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.invoicePrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.invoicePrice}</td>
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.grnPrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.grnPrice || '-'}</td>
                            <td className={`border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right tabular-nums dark:border-slate-700 whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.poAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.poAmount || '-'}</td>
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.amount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.amount}</td>
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.grnAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.grnAmount || '-'}</td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <ResultPill severity={item.severity} text={item.result} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                            Chưa có dữ liệu hàng hóa.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bảng đối chiếu thông tin</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Trường</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">PO</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Invoice</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">GRN</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Kết quả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detailBatch.comparisons.map((item, idx) => (
                        <tr key={idx} className="table-row-hover">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{item.field}</td>
                          <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.po, [item.po, item.invoice, item.grn])}`}>{item.po}</td>
                          <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.invoice, [item.po, item.invoice, item.grn])}`}>{item.invoice}</td>
                          <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.grn, [item.po, item.invoice, item.grn])}`}>{item.grn}</td>
                          <td className="min-w-[130px] whitespace-nowrap px-4 py-3">
                            <ResultPill severity={item.severity} text={item.result} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ReconciliationHistorySection
                history={detailBatch.history}
                onOpenFile={handleOpenFile}
              />
            </div>
          </div>
        </div>
      )}

      {rejectingBatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Xác nhận từ chối batch</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rejectingBatch.batchNumber}</p>
              </div>
              <button
                type="button"
                onClick={handleCloseRejectModal}
                disabled={isRejecting}
                className="btn-ghost h-8 w-8 rounded-lg p-0 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <textarea
              value={rejectionReason}
              onChange={(event) => {
                setRejectionReason(event.target.value.slice(0, 1000));
                setRejectionError('');
              }}
              rows={4}
              maxLength={1000}
              placeholder="Nhập lý do từ chối để kế toán viên biết cần điều chỉnh gì..."
              className="mt-4 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-rose-500 dark:focus:bg-slate-900 dark:focus:ring-rose-950"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-rose-600 dark:text-rose-300">{rejectionError}</span>
              <span className="shrink-0 text-slate-400 dark:text-slate-500">{rejectionReason.length}/1000</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseRejectModal}
                disabled={isRejecting}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectBatch}
                disabled={isRejecting}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRejecting && <Loader2 size={14} className="animate-spin" />}
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(approveConfirm)}
        tone="success"
        title="Xác nhận duyệt batch"
        description={approveConfirm ? `Bạn có chắc chắn muốn duyệt batch "${approveConfirm.batchNumber}" không?` : ''}
        confirmLabel="Xác nhận duyệt"
        cancelLabel="Hủy"
        loading={isApproving}
        onCancel={() => {
          if (isApproving) return;
          setApproveConfirm(null);
        }}
        onConfirm={handleApproveBatch}
      />
      <FilePreviewModal filePreview={filePreview} onClose={closeFilePreview} />
    </div>
  );
}
