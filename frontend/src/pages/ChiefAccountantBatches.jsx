import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Lock,
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
import LineItemCopies from '../components/LineItemCopies.jsx';
import FieldComparisonTable from '../components/FieldComparisonTable.jsx';
import SignatureStrip from '../components/SignatureStrip.jsx';
import ApprovalConfirmBody from '../components/ApprovalConfirmBody.jsx';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Badge, Button, Field, Modal, Textarea, cn } from '../ui/index.js';
import useMediaQuery from '../lib/useMediaQuery.js';
import FilePreviewModal from '../components/FilePreviewModal.jsx';
import ReconciliationHistorySection from '../components/ReconciliationHistorySection.jsx';
import BatchListItem, { BatchMetaLine, ForeignCopyNotice } from '../components/BatchListItem.jsx';
import {
  aggregateExtractedData,
  calculateMatchSummary,
  compareDocumentField,
  comparisonStatusToResult,
  compareAmountResult,
  compareValues as compareRawValues,
  getComparisonCellClass,
  getGrnTotalAdjustment,
  inferVatRate,
  detectForeignCopy,
  resolveMatchStatus,
  toNumber,
} from '../reconciliationCompare.js';
import { repairTextDeep } from '../text.js';
import { useToast } from '../ui/Toast.jsx';
import { EXPORT_FONT_STACK } from '../lib/exportStyles.js';
import { vi } from '../i18n/vi.js';

const STATUS_META = {
  missing: {
    label: 'Thiếu dữ liệu',
    tone: 'border-tone-warning-line bg-tone-warning-bg text-tone-warning-fg',
    rail: 'bg-chart-warning',
  },
  matching: {
    label: 'Đang đối soát',
    tone: 'border-tone-success-line bg-tone-success-bg text-tone-success-fg',
    rail: 'bg-chart-success',
  },
  matched: {
    label: 'Khớp hoàn toàn',
    tone: 'border-tone-success-line bg-tone-success-bg text-tone-success-fg',
    rail: 'bg-chart-success',
  },
  approved: {
    label: 'Đã duyệt cấp 1',
    tone: 'border-tone-success-line bg-tone-success-bg text-tone-success-fg',
    rail: 'bg-chart-success',
  },
  final_approved: {
    label: 'Đã duyệt cuối',
    tone: 'border-tone-success-line bg-tone-success-bg text-tone-success-fg',
    rail: 'bg-chart-success',
  },
  rejected: {
    label: 'Đã từ chối',
    tone: 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg',
    rail: 'bg-chart-danger',
  },
  mismatch: {
    label: 'Lệch',
    tone: 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg',
    rail: 'bg-chart-danger',
  },
};

const DOC_TYPES = [
  { key: 'po', short: 'PO', label: 'Đơn đặt hàng', icon: ShoppingCart },
  { key: 'invoice', short: 'HĐ', label: 'Hóa đơn', icon: FileText },
  { key: 'grn', short: 'GRN', label: 'Phiếu nhập kho', icon: PackageCheck },
];
// Đủ dài cho một ngày làm việc; trang sau vẫn tới được bằng ↓ ở dòng cuối.
const BATCHES_PER_PAGE = 50;

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
    body { margin: 0; background: #f6f9fc; color: #0d253d; font-family: ${EXPORT_FONT_STACK}; }
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
  const barColor = value >= 98 ? 'bg-chart-success' : value >= 85 ? 'bg-chart-warning' : value > 0 ? 'bg-chart-danger' : 'bg-chart-neutral/40';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-fg-subtle">Tỉ lệ khớp</span>
        <span className="text-sm font-bold tabular-nums text-fg">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** XML được đọc tại máy chủ, không gửi AI; PDF và ảnh qua AI trích xuất. */
function getReadSource(files) {
  const exts = files.map((item) => getFileExt(item.filename));
  const xml = exts.filter((ext) => ext === 'xml').length;
  if (xml === exts.length) return 'XML · đọc cục bộ, không gửi AI';
  if (xml === 0) return 'PDF/ảnh · AI trích xuất';
  return `${xml} XML đọc cục bộ, ${exts.length - xml} file AI trích xuất`;
}

function DocumentCard({ type, doc, docs, onOpenFile }) {
  const Icon = type.icon;
  const files = Array.isArray(docs) && docs.length > 0 ? docs : doc ? [doc] : [];
  const firstDoc = files[0] || {};
  const isMissing = firstDoc.missing;
  const typeLabel = files.length > 1 ? `${type.label} (${files.length} file)` : type.label;

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${isMissing ? 'bg-surface-muted text-fg-subtle' : 'bg-tone-brand-bg text-tone-brand-fg'}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-fg"><span className="text-primary">Liên {type.short}</span> · {typeLabel}</p>
            <p className="mt-1 truncate text-xs text-fg-subtle">
              {isMissing ? 'Chưa có chứng từ' : getReadSource(files)}
            </p>
          </div>
        </div>
      </div>

      {!isMissing && (
        <div className="mt-4 space-y-2">
          {files.map((item, idx) => (
            <div key={`${item.file?.id || item.filename || idx}`} className="flex items-center justify-between gap-3 border-t border-line pt-2">
              <span className="min-w-0 truncate text-xs font-medium text-fg-muted">{item.filename}</span>
              {item.file && (
                <button
                  type="button"
                  onClick={() => onOpenFile?.(item.file)}
                  className="btn-ghost h-8 w-8 shrink-0 rounded-control p-0"
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
    ok: 'bg-tone-success-bg text-tone-success-fg',
    warning: 'bg-tone-warning-bg text-tone-warning-fg',
    danger: 'bg-tone-danger-bg text-tone-danger-fg',
  }[severity];

  return <span className={`inline-flex whitespace-nowrap rounded-control px-2 py-1 text-xs font-semibold ${className}`}>{text}</span>;
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
  return value > 0 ? `${formatDisplayValue(value)}%` : '-';
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
  });
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
    const amountResult = compareAmountResult([poAmount, invoiceAmount, grnAmount]);
    const severity = [qtyResult, priceResult, amountResult].some((item) => item.severity === 'danger')
      ? 'danger'
      : [qtyResult, priceResult, amountResult].some((item) => item.severity === 'warning')
        ? 'warning'
        : 'ok';
    // Chỉ thành tiền lệch trong ngưỡng, số lượng và đơn giá khớp: lệch nhỏ do làm tròn, không phải thiếu dữ liệu.
    const minor = Boolean(amountResult.minor) && qtyResult.severity === 'ok' && priceResult.severity === 'ok';

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
          ? (minor ? 'Lệch nhỏ · trong ngưỡng làm tròn 1.000 đ' : 'Thiếu dữ liệu')
          : 'Khớp',
      severity,
      minor,
      qtySeverity: qtyResult.severity,
      priceSeverity: priceResult.severity,
      amountSeverity: amountResult.severity,
    };
  }).sort((a, b) => ({ danger: 0, warning: 1, ok: 2 }[a.severity] - ({ danger: 0, warning: 1, ok: 2 }[b.severity])));
}

function getBatchSupplierName(docs) {
  return DOC_TYPES
    .map((type) => docs[type.key]?.extractedData?.supplier_name || docs[type.key]?.fields?.['Nhà cung cấp'])
    .find((value) => value && value !== '-') || '';
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
  const supplierName = getBatchSupplierName(docs);
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
        : resolveMatchStatus(batch.reconciliation_status, summary.status);

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
    supplierName,
    approvedBy: batch.approved_by_name || null,
    chiefApprovedBy: batch.chief_approved_by_name || null,
    matchRate: summary.matchRate,
    checkedFields: summary.checkedFields,
    matchedFields: summary.matchedFields,
    mismatchFields: summary.mismatchFields,
    foreignCopy: detectForeignCopy(docs),
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

const STATUS_TABS = [
  { value: 'all', label: vi.batchFilters.all },
  { value: 'unapproved', label: vi.batchFilters.pendingChief },
  { value: 'approved', label: vi.batchFilters.archived },
  { value: 'rejected', label: vi.batchFilters.rejected },
];

export default function ChiefAccountantBatches({ token }) {
  const toast = useToast();
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
        setActionError(error.message || 'Không thể tải danh sách bộ chứng từ');
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

  // Bộ chờ duyệt cuối kế tiếp trong danh sách đang hiển thị, để quyết định xong là xem được bộ sau ngay.
  const getNextPendingId = (currentId) => {
    const pending = paginatedBatches.filter((batch) => batch.rawStatus === 'approved');
    const index = pending.findIndex((batch) => isSameBatchId(batch.id, currentId));
    const next = pending[index + 1] || pending.find((batch) => !isSameBatchId(batch.id, currentId));
    return next?.id ?? null;
  };

  const handleApproveBatch = async () => {
    if (!canApproveBatch(approveConfirm)) return;
    const nextId = getNextPendingId(approveConfirm.id);
    setIsApproving(true);
    setActionError('');
    try {
      const updated = await finalApproveDocumentBatch(token, approveConfirm.id);
      updateCachedBatchItem(updated);
      setDetailPanelOpen(false);
      setApproveConfirm(null);
      if (isWide && nextId !== null) setDetailBatchId(nextId);
      toast.success(`Đã duyệt cuối và lưu trữ ${approveConfirm.batchNumber}.`);
    } catch (error) {
      console.error('Failed to approve batch:', error);
      setActionError(error.message || 'Không thể duyệt bộ chứng từ');
      toast.error(error.message || 'Không thể duyệt bộ chứng từ. Vui lòng thử lại.');
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

    const nextId = getNextPendingId(rejectingBatch.id);
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
      if (isWide && nextId !== null) setDetailBatchId(nextId);
      toast.success(`Đã từ chối ${rejectingBatch.batchNumber} và gửi email cho người tạo.`);
    } catch (error) {
      console.error('Failed to reject batch:', error);
      setRejectionError(error.message || 'Không thể từ chối bộ chứng từ');
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
      let xmlText = '';

      if (fileExt === 'xml') {
        xmlText = await blob.text();
      }

      setFilePreview({
        filename: file.filename,
        previewUrl,
        downloadUrl,
        xmlText,
      });
    } catch (error) {
      console.error('Failed to open file:', error);
      toast.error(error.message || 'Không thể mở file');
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
        batch.owner.toLowerCase().includes(query) ||
        batch.supplierName.toLowerCase().includes(query)
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

  const isWide = useMediaQuery('(min-width: 1280px)');
  const listRef = useRef(null);

  useEffect(() => {
    if (!isWide) return;
    if (paginatedBatches.length === 0) {
      if (detailBatchId !== null) setDetailBatchId(null);
      return;
    }
    if (!paginatedBatches.some((batch) => isSameBatchId(batch.id, detailBatchId))) {
      setDetailBatchId(paginatedBatches[0].id);
    }
  }, [isWide, paginatedBatches, detailBatchId]);

  // ↑/↓ chuyển giữa các bộ trong danh sách; trên màn rộng chi tiết đổi theo ngay. Ở mép trang thì sang trang kề bên.
  const pendingRowFocusRef = useRef(null);
  const handleListKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...(listRef.current?.querySelectorAll('[data-batch-row]') || [])];
    const index = rows.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const down = event.key === 'ArrowDown';
    if (down && index === rows.length - 1 && currentPage < totalPages) {
      pendingRowFocusRef.current = 'first';
      setCurrentPage(currentPage + 1);
      return;
    }
    if (!down && index === 0 && currentPage > 1) {
      pendingRowFocusRef.current = 'last';
      setCurrentPage(currentPage - 1);
      return;
    }
    const nextIndex = down ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1);
    rows[nextIndex].focus();
    if (isWide) setDetailBatchId(paginatedBatches[nextIndex].id);
  };

  useEffect(() => {
    const target = pendingRowFocusRef.current;
    if (!target || paginatedBatches.length === 0) return;
    pendingRowFocusRef.current = null;
    const index = target === 'first' ? 0 : paginatedBatches.length - 1;
    listRef.current?.querySelectorAll('[data-batch-row]')[index]?.focus();
    if (isWide) setDetailBatchId(paginatedBatches[index].id);
  });

  useEffect(() => {
    if (!isWide) return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (approveConfirm || rejectingBatch || !detailBatch) return;
      const key = event.key.toLowerCase();
      if (key === 'a' && canApproveBatch(detailBatch)) {
        event.preventDefault();
        requestApproveBatch(detailBatch);
      } else if (key === 'r' && canRejectBatch(detailBatch)) {
        event.preventDefault();
        handleRejectBatch(detailBatch);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const statusCounts = useMemo(
    () => ({
      unapproved: batches.filter((batch) => batch.rawStatus === 'approved').length,
      approved: batches.filter((batch) => batch.rawStatus === 'final_approved').length,
      rejected: batches.filter((batch) => batch.rawStatus === 'rejected' || batch.isRejected).length,
      all: batches.length,
    }),
    [batches],
  );

  const applyStatusFilter = (nextStatus) => {
    setStatusFilter(nextStatus);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextStatus === 'all') next.delete('status');
      else next.set('status', nextStatus);
      return next;
    });
  };

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

  // Màn rộng: chi tiết nằm cạnh danh sách. Màn hẹp: chi tiết mở trong hộp thoại.
  const DetailTitle = isWide ? 'h2' : DialogTitle;
  const detailView = detailBatch ? (
    <>
            {/* Panel Header */}
            <div className={cn('border-b border-line bg-surface px-4 py-4 sm:px-6 sm:py-5', !isWide && 'sticky top-0 z-10')}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <DetailTitle className="break-words text-lg font-bold text-fg sm:text-2xl">
                    {detailBatch.batchNumber}
                  </DetailTitle>
                  <BatchMetaLine batch={detailBatch} />
                  <SignatureStrip batch={detailBatch} className="mt-3 max-w-3xl" />
                  {detailBatch.rawStatus === 'rejected' && detailBatch.rejectionNote && (
                    <p className="mt-2 max-w-4xl text-sm font-semibold text-tone-danger-fg">
                      Lý do từ chối: {detailBatch.rejectionNote}
                    </p>
                  )}
                </div>
                
                {/* Từ chối và Duyệt cuối đứng cách xa nhau (surface brief): trên mobile hai nút ở hai đầu, không phải hai nút sinh đôi. */}
                <div className="flex items-center gap-2 sm:justify-end">
                  {canRejectBatch(detailBatch) && (
                    <Button variant="danger" leadingIcon={X} onClick={() => handleRejectBatch(detailBatch)} aria-keyshortcuts={isWide ? 'R' : undefined}>
                      Từ chối
                      {isWide && <kbd className="ml-1 rounded-sm border border-current/30 px-1 font-sans text-xs opacity-70">R</kbd>}
                    </Button>
                  )}
                  <span aria-hidden="true" className="flex-1 sm:w-12 sm:flex-none" />
                  {canApproveBatch(detailBatch) && (
                    <Button variant="primary" leadingIcon={CheckCircle2} onClick={() => requestApproveBatch(detailBatch)} aria-keyshortcuts={isWide ? 'A' : undefined}>
                      Duyệt cuối
                      {isWide && <kbd className="ml-1 rounded-sm border border-current/30 px-1 font-sans text-xs opacity-70">A</kbd>}
                    </Button>
                  )}

                  {!isWide && (
                  <Button
                    iconOnly
                    leadingIcon={X}
                    onClick={handleCloseDetailPanel}
                    className="ml-2"
                    aria-label="Đóng chi tiết bộ chứng từ"
                  />
                  )}
                </div>
              </div>
            </div>

            {/* Panel Content */}
            <div className={cn('space-y-4 p-3 sm:space-y-5 sm:p-5', !isWide && 'max-h-[calc(92vh-82px)] overflow-y-auto')}>
              <div className="rounded-card border border-line bg-surface shadow-card sm:hidden">
                <button
                  type="button"
                  onClick={() => setMobileDocsOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={mobileDocsOpen}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-fg">Chứng từ</p>
                    <p className="mt-0.5 truncate text-xs text-fg-subtle">PO, hóa đơn và GRN</p>
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-fg-subtle transition-transform ${mobileDocsOpen ? 'rotate-180' : ''}`} />
                </button>
                {mobileDocsOpen && (
                  <div className="space-y-3 border-t border-line p-3">
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

              <ForeignCopyNotice foreignCopy={detailBatch.foreignCopy} />

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

              <section>
                <div className="pb-2">
                  <h3 className="text-base font-bold text-fg">Bảng đối chiếu thông tin</h3>
                </div>
                <FieldComparisonTable items={detailBatch.comparisons} />
              </section>

              <section>
                <div className="pb-2">
                  <h3 className="text-base font-bold text-fg">Chi tiết hàng hóa</h3>
                </div>
                <LineItemCopies items={detailBatch.lineItems} emptyText="Chưa có dữ liệu hàng hóa. Khi đủ chứng từ, hệ thống sẽ tách từng dòng hàng để đối chiếu." />
              </section>

              <ReconciliationHistorySection
                history={detailBatch.history}
                onOpenFile={handleOpenFile}
              />
            </div>
    </>
  ) : null;

  return (
    <div className="-mx-4 -my-5 flex min-h-screen flex-col bg-surface text-fg md:-mx-6 md:-my-6">
      {/* Header */}
      <div className="border-b border-line bg-surface px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-fg sm:text-2xl">Bộ đối soát</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Các bộ kế toán viên đã duyệt, đang chờ kế toán trưởng quyết định.
            </p>
          </div>
        </div>

        {/* Filters */}

        <div className="relative mt-3 sm:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" size={17} />
            <input
              type="text"
              placeholder="Tìm theo tên bộ chứng từ, ghi chú, người tạo, nhà cung cấp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-10"
            />
          </div>

        <div className="mt-5 hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" size={18} />
            <input
              type="text"
              placeholder="Tìm theo tên bộ chứng từ, ghi chú, người tạo, nhà cung cấp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-10"
            />
          </div>

          
          <div className="relative w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setFilterMenuOpen(!filterMenuOpen)}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-control border px-3 py-2 text-sm font-medium transition-colors sm:w-auto ${
                dateRange.start || dateRange.end
                  ? 'border-tone-success-line bg-tone-success-bg text-tone-success-fg'
                  : 'btn-secondary'
              }`}
            >
              <SlidersHorizontal size={16} />
              {dateRange.start || dateRange.end ? 'Đang lọc thời gian' : 'Lọc theo thời gian'}
            </button>
            
            {filterMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-4 shadow-pop">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
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
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
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
          <div className="mt-4 rounded-card border border-tone-danger-line bg-tone-danger-bg px-4 py-3 text-sm font-semibold text-tone-danger-fg">
            {actionError}
          </div>
        )}
      </div>

      <div className="flex-1 xl:grid xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Batch List */}
      <div className="bg-surface-muted xl:border-r xl:border-line xl:px-0 xl:py-0">
        <div role="group" aria-label={vi.batchFilters.groupLabel} className="sticky top-0 z-10 flex flex-wrap gap-0.5 border-b border-line bg-surface-muted px-2 py-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={statusFilter === tab.value}
              aria-label={vi.batchFilters.countLabel(tab.label, isLoading ? '–' : statusCounts[tab.value] ?? 0)}
              onClick={() => applyStatusFilter(tab.value)}
              className={cn(
                'shrink-0 rounded-control px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                statusFilter === tab.value ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface hover:text-fg',
              )}
            >
              {tab.label}
              <span className="ml-1.5 tabular-nums opacity-80">{isLoading ? '–' : statusCounts[tab.value] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-4 sm:px-6 xl:p-0">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : paginatedBatches.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-fg-subtle">
            <FileSearch size={48} className="mb-3 opacity-50" />
            <p className="text-base">Không tìm thấy bộ chứng từ nào</p>
          </div>
        ) : (
          <>
            <ul ref={listRef} aria-label="Danh sách bộ chứng từ" onKeyDown={handleListKeyDown} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface xl:rounded-none xl:border-0 xl:bg-transparent">
              {paginatedBatches.map((batch) => {
                const selected = isWide && isSameBatchId(batch.id, detailBatchId);
                return (
                  <li key={batch.id}>
                    <BatchListItem batch={batch} role="chief_accountant" selected={selected} onSelect={() => handleViewDetails(batch)} />
                  </li>
                );
              })}
            </ul>

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
                <span className="text-center text-sm text-fg-muted">
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
      </div>
      {isWide && (
        <section aria-label="Chi tiết bộ chứng từ" className="min-w-0 bg-surface">
          {detailView || (
            <p className="px-6 py-16 text-center text-sm text-fg-subtle">Chọn một bộ ở danh sách bên trái để xem ba liên chứng từ.</p>
          )}
        </section>
      )}
      </div>

      {/* Detail Panel */}
      <Dialog open={!isWide && Boolean(detailPanelOpen && detailBatch)} onClose={handleCloseDetailPanel} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-scrim/50" />
        <div className="fixed inset-0 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
          {detailBatch && (
            <DialogPanel className="h-dvh w-full max-w-[1360px] overflow-y-auto bg-surface text-fg shadow-pop sm:h-auto sm:max-h-[92vh] sm:rounded-modal">
              {detailView}
            </DialogPanel>
          )}
        </div>
      </Dialog>

      <Modal
        open={Boolean(rejectingBatch)}
        onClose={handleCloseRejectModal}
        title="Từ chối bộ chứng từ"
        description={rejectingBatch?.batchNumber}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseRejectModal} disabled={isRejecting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleConfirmRejectBatch} loading={isRejecting}>
              Từ chối và gửi email
            </Button>
          </>
        }
      >
        <Field
          label="Lý do từ chối"
          required
          error={rejectionError}
          hint={`Lý do được gửi email cho người tạo bộ và hiện trên bộ chứng từ. ${rejectionReason.length}/1000 ký tự.`}
        >
          <Textarea
            value={rejectionReason}
            onChange={(event) => {
              setRejectionReason(event.target.value.slice(0, 1000));
              setRejectionError('');
            }}
            rows={4}
            maxLength={1000}
            placeholder="Ví dụ: Đơn giá dòng 3 trên hóa đơn khác PO, cần nhà cung cấp xuất lại hóa đơn."
            data-autofocus
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(approveConfirm)}
        title="Duyệt cuối và lưu trữ hồ sơ"
        description="Kiểm tra lại thông tin trước khi khóa hồ sơ."
        confirmLabel="Duyệt và lưu trữ"
        cancelLabel="Hủy"
        loading={isApproving}
        onCancel={() => {
          if (isApproving) return;
          setApproveConfirm(null);
        }}
        onConfirm={handleApproveBatch}
      >
        <ApprovalConfirmBody batch={approveConfirm} final />
      </ConfirmDialog>
      <FilePreviewModal filePreview={filePreview} onClose={closeFilePreview} />
    </div>
  );
}
