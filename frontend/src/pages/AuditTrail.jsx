import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileSearch,
  FileText,
  Loader2,
  PackageCheck,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  UploadCloud,
  X,
} from 'lucide-react';
import { approveDocumentBatch, fetchUploadFileBlob, finalApproveDocumentBatch } from '../api.js';
import {
  fetchDocumentBatchesWithCache,
  getCachedBatches,
  subscribeBatchCache,
  updateCachedBatchItem,
} from '../services/batchCache.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LineItemCopies from '../components/LineItemCopies.jsx';
import FieldComparisonTable from '../components/FieldComparisonTable.jsx';
import ApprovalConfirmBody from '../components/ApprovalConfirmBody.jsx';
import FilePreviewModal from '../components/FilePreviewModal.jsx';
import ReconciliationHistorySection from '../components/ReconciliationHistorySection.jsx';
import BatchListItem, { BatchMetaLine, ForeignCopyNotice } from '../components/BatchListItem.jsx';
import ReconciliationReportModal from '../components/ReconciliationReportModal.jsx';
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
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Button, PageHeader, cn } from '../ui/index.js';
import useMediaQuery from '../lib/useMediaQuery.js';
import SignatureStrip from '../components/SignatureStrip.jsx';
import { useToast } from '../ui/Toast.jsx';
import { EXPORT_FONT_STACK } from '../lib/exportStyles.js';
import { vi } from '../i18n/vi.js';

const DOC_TYPES = [
  { key: 'po', short: 'PO', label: 'Đơn đặt hàng', icon: ShoppingCart },
  { key: 'invoice', short: 'HĐ', label: 'Hóa đơn', icon: FileText },
  { key: 'grn', short: 'GRN', label: 'Phiếu nhập kho', icon: PackageCheck },
];
// Đủ dài cho một ngày làm việc; trang sau vẫn tới được bằng ↓ ở dòng cuối.
const BATCHES_PER_PAGE = 50;

/** XML được đọc tại máy chủ, không gửi AI; PDF và ảnh qua AI trích xuất. */
function getReadSource(files) {
  const exts = files.map((item) => getFileExt(item.filename));
  const xml = exts.filter((ext) => ext === 'xml').length;
  if (xml === exts.length) return 'XML · đọc cục bộ, không gửi AI';
  if (xml === 0) return 'PDF/ảnh · AI trích xuất';
  return `${xml} XML đọc cục bộ, ${exts.length - xml} file AI trích xuất`;
}

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

// Kế toán viên duyệt cấp 1 được bộ khớp và bộ lệch nhỏ (chênh lệch tiền trong ngưỡng làm tròn), giống quy tắc ở backend.
function canAccountantApprove(batch) {
  return Boolean(batch) && ['matched', 'minor'].includes(batch.status) && batch.rawStatus !== 'rejected';
}

/** Vì sao bộ chưa duyệt được và cần làm gì; null khi duyệt được hoặc bộ đã qua bước duyệt cấp 1. */
function getApproveBlockReason(batch) {
  if (!batch || ['approved', 'final_approved', 'rejected'].includes(batch.rawStatus)) return null;
  if (batch.foreignCopy) {
    return `Chưa duyệt được: liên ${batch.foreignCopy.label} có vẻ thuộc giao dịch khác. Thay liên ${batch.foreignCopy.label} bằng chứng từ đúng.`;
  }
  if (batch.status === 'mismatch') {
    const field = batch.comparisons?.find((item) => item.severity === 'danger')?.field
      || (batch.lineItems?.some((item) => item.priceSeverity === 'danger') && 'đơn giá')
      || (batch.lineItems?.some((item) => item.qtySeverity === 'danger') && 'số lượng')
      || (batch.lineItems?.some((item) => item.amountSeverity === 'danger') && 'thành tiền');
    const where = field ? ` ở ${String(field).toLowerCase()}` : '';
    return `Chưa duyệt được: lệch lớn${where}. Cần nhà cung cấp điều chỉnh chứng từ, rồi bổ sung hoặc thay chứng từ.`;
  }
  if (batch.status === 'missing') {
    return 'Chưa duyệt được: thiếu dữ liệu trích xuất ở một liên. Kiểm tra lại chứng từ hoặc thay bản rõ hơn.';
  }
  return null;
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

function matchesOverviewFilter(batch, overviewFilter) {
  if (!overviewFilter || overviewFilter === 'all') return true;
  if (overviewFilter === 'ready') return batch.isReady;
  if (overviewFilter === 'matched') return batch.isReady && ['matched', 'approved', 'final_approved'].includes(batch.status);
  if (overviewFilter === 'review') return batch.isReady && ['mismatch', 'missing'].includes(batch.status);
  if (overviewFilter === 'rejected') return batch.isReady && batch.status === 'rejected';
  if (overviewFilter === 'incomplete') return false;
  return true;
}

function getOverviewFilterLabel(overviewFilter) {
  const labels = {
    ready: 'Tổng hồ sơ',
    matched: 'Đã khớp',
    review: 'Cần xem',
    rejected: 'Từ chối',
    incomplete: 'Chưa đủ chứng từ',
  };
  return labels[overviewFilter] || null;
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
            <p className={`mt-1 truncate text-xs ${isMissing ? 'text-fg-subtle' : 'text-fg-subtle'}`}>
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

function RejectionNoteAlert({ note }) {
  if (!note) return null;

  return (
    <div className="flex items-start gap-2 text-tone-danger-fg">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-semibold leading-6">
        Lí do: {note}
      </p>
    </div>
  );
}

const LINE_ITEM_FIELDS = ['Mã hàng', 'Tên hàng', 'Đơn vị tính', 'Số lượng', 'Đơn giá'];

function isLineItemComparison(item) {
  return LINE_ITEM_FIELDS.some((fieldName) => item.field.includes(fieldName));
}

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
      name: formatDisplayValue(baseItem.item_name),
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

  const missingCount = DOC_TYPES.filter((type) => docs[type.key]?.missing).length;
  const comparisons = buildComparisons(docs);
  const lineItems = buildLineItems(docs);
  const summary = calculateMatchSummary(docs);
  const supplierName = getBatchSupplierName(docs);
  const missingDataFields = missingCount + summary.warningFields;
  const isApproved = batch.status === 'approved';
  const isFinalApproved = batch.status === 'final_approved';
  const isRejected = batch.status === 'rejected';
  const backendReconciliationStatus = batch.reconciliation_status;
  const displayStatus = isRejected
    ? 'rejected'
    : isFinalApproved
      ? 'final_approved'
      : isApproved
        ? 'approved'
        : resolveMatchStatus(backendReconciliationStatus, summary.status);

  return {
    id: batch.id,
    rawStatus: batch.status,
    batchNumber: batch.batch_number,
    note: batch.note || '',
    rejectionNote: batch.rejection_note || '',
    history: batch.history || [],
    status: displayStatus,
    reconciliationStatus: backendReconciliationStatus || null,
    reconciliationNote: batch.reconciliation_ai_summary || batch.reconciliation_ai_note || '',
    isApproved,
    isFinalApproved,
    isRejected,
    isReady: isApiBatchReady(batch),
    updatedAt: batch.updated_at || batch.created_at,
    owner: batch.created_by_name || 'Hệ thống AI',
    supplierName,
    approvedBy: batch.approved_by_name || null,
    chiefApprovedBy: batch.chief_approved_by_name || null,
    matchRate: summary.matchRate,
    checkedFields: summary.checkedFields,
    matchedFields: summary.matchedFields,
    mismatchFields: summary.mismatchFields,
    minorFields: summary.minorFields,
    missingFields: missingDataFields,
    foreignCopy: detectForeignCopy(docs),
    decision:
      summary.mismatchFields > 0
          ? 'Có chênh lệch trong dữ liệu AI đã trích xuất. Cần kiểm tra lại chứng từ.'
        : missingDataFields > 0
          ? 'Bộ chứng từ còn thiếu dữ liệu trích xuất. Cần kiểm tra lại chứng từ hoặc chờ AI đọc đầy đủ.'
          : 'Các trường AI đã trích xuất đang khớp theo dữ liệu hiện có.',
    docs,
    docList,
    comparisons,
    lineItems,
    issues: comparisons
      .filter((item) => item.severity !== 'ok')
      .map((item) => `${item.field}: ${item.result}`),
  };
}

// Năm tab theo việc cần làm: duyệt được (khớp, lệch nhỏ), cần xem lại (lệch lớn, thiếu dữ liệu), đã qua cấp 1, bị trả lại.
const AUDIT_STATUS_TABS = [
  { value: 'all', label: vi.batchFilters.all },
  { value: 'pending', label: vi.batchFilters.pendingAccountant },
  { value: 'review', label: vi.batchFilters.review },
  { value: 'approved', label: vi.batchFilters.approvedByAccountant },
  { value: 'rejected', label: vi.batchFilters.rejected },
];

/** Điều kiện của từng tab trạng thái; dùng chung cho danh sách và số đếm trên tab. */
function matchesStatusTab(batch, value) {
  if (value === 'all') return true;
  if (value === 'pending') return canAccountantApprove(batch);
  if (value === 'review') return ['mismatch', 'missing'].includes(batch.status);
  if (value === 'approved') return batch.status === 'approved' || batch.status === 'final_approved' || batch.isApproved || batch.isFinalApproved;
  return batch.status === value;
}

export default function AuditTrail({ token, role, currentUser }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedBatchId = searchParams.get('batchId');
  const overviewFilter = searchParams.get('overviewFilter') || 'all';
  const overviewFilterLabel = getOverviewFilterLabel(overviewFilter);
  const overviewDateRange = useMemo(() => ({
    start: parseDateInput(searchParams.get('from'), 'start'),
    end: parseDateInput(searchParams.get('to'), 'end'),
  }), [searchParams]);
  const cached = getCachedBatches();
  const [batches, setBatches] = useState(() => (cached?.items || []).map(mapApiBatchToAuditBatch));
  const [selectedId, setSelectedId] = useState(() => {
    const initialBatches = (cached?.items || []).map(mapApiBatchToAuditBatch);
    if (requestedBatchId) {
      const match = initialBatches.find((b) => isSameBatchId(b.id, requestedBatchId));
      if (match) return match.id;
    }
    return initialBatches[0]?.id || null;
  });
  const [modalBatchId, setModalBatchId] = useState(() => {
    if (!requestedBatchId || !cached?.items) return null;
    const initialBatches = cached.items.map(mapApiBatchToAuditBatch);
    const match = initialBatches.find((b) => isSameBatchId(b.id, requestedBatchId));
    return match ? match.id : null;
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [batchPage, setBatchPage] = useState(1);
  const [approvingBatchIds, setApprovingBatchIds] = useState([]);
  const [approveConfirm, setApproveConfirm] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState('');

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
    const unsubscribe = subscribeBatchCache((data) => {
      if (data?.items) {
        setBatches(data.items.map(mapApiBatchToAuditBatch));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchBatches() {
      try {
        if (!getCachedBatches()) {
          setLoading(true);
        }
        setError('');
        const data = await fetchDocumentBatchesWithCache(token, { forceRefresh: true });
        const mappedBatches = (data.items || []).map(mapApiBatchToAuditBatch);
        if (!isMounted) return;
        setBatches(mappedBatches);
        if (requestedBatchId) {
          const requestedBatch = mappedBatches.find((batch) => isSameBatchId(batch.id, requestedBatchId));
          if (requestedBatch) setModalBatchId(requestedBatch.id);
        }
        setSelectedId((currentId) => {
          const requestedBatch = mappedBatches.find((batch) => isSameBatchId(batch.id, requestedBatchId));
          if (requestedBatch) return requestedBatch.id;
          if (currentId && mappedBatches.some((batch) => isSameBatchId(batch.id, currentId))) return currentId;
          return mappedBatches[0]?.id || null;
        });
      } catch (err) {
        if (!isMounted) return;
        if (!getCachedBatches()) {
          setError(err.message || 'Không thể tải danh sách batch.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchBatches();
    return () => {
      isMounted = false;
    };
  }, [token, requestedBatchId]);

  useEffect(() => {
    let isMounted = true;

    async function refreshBatches() {
      try {
        const data = await fetchDocumentBatchesWithCache(token, { forceRefresh: true });
        if (!isMounted) return;
        const mappedBatches = (data.items || []).map(mapApiBatchToAuditBatch);
        setBatches(mappedBatches);
        if (requestedBatchId) {
          const requestedBatch = mappedBatches.find((batch) => isSameBatchId(batch.id, requestedBatchId));
          if (requestedBatch) setModalBatchId(requestedBatch.id);
        }
      } catch (err) {
        console.error('Không thể làm mới trạng thái batch:', err);
      }
    }

    const handleFocus = () => {
      refreshBatches();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshBatches();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token, requestedBatchId]);

  const filteredBatches = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return batches.filter((batch) => {
      if (!batch.isReady) return false;

      // Kế toán trưởng thấy: matched, approved, final_approved, rejected
      if (role === 'chief_accountant') {
        const allowedStatuses = ['matched', 'approved', 'final_approved', 'rejected'];
        if (!allowedStatuses.includes(batch.status)) {
          return false;
        }
      }

      const matchesStatus = matchesStatusTab(batch, statusFilter);

      const matchesOverviewGroup = matchesOverviewFilter(batch, overviewFilter);
      const matchesDateRange = isWithinDateRange(batch, overviewDateRange);
      const haystack = [
        batch.batchNumber,
        batch.note,
        batch.owner,
        batch.supplierName,
      ].join(' ').toLowerCase();

      return matchesStatus && matchesOverviewGroup && matchesDateRange && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [batches, overviewDateRange, overviewFilter, role, searchQuery, statusFilter]);

  const totalBatchPages = Math.max(1, Math.ceil(filteredBatches.length / BATCHES_PER_PAGE));
  const safeBatchPage = Math.min(batchPage, totalBatchPages);
  const paginatedBatches = filteredBatches.slice(
    (safeBatchPage - 1) * BATCHES_PER_PAGE,
    safeBatchPage * BATCHES_PER_PAGE
  );
  const batchStartIndex = filteredBatches.length === 0 ? 0 : (safeBatchPage - 1) * BATCHES_PER_PAGE + 1;
  const batchEndIndex = Math.min(safeBatchPage * BATCHES_PER_PAGE, filteredBatches.length);

  useEffect(() => {
    setBatchPage(1);
  }, [overviewDateRange, overviewFilter, searchQuery, statusFilter]);

  useEffect(() => {
    if (batchPage > totalBatchPages) {
      setBatchPage(totalBatchPages);
    }
  }, [batchPage, totalBatchPages]);

  useEffect(() => {
    if (filteredBatches.length === 0) return;
    if (!filteredBatches.some((batch) => isSameBatchId(batch.id, selectedId))) {
      setSelectedId(filteredBatches[0].id);
    }
  }, [filteredBatches, selectedId]);

  const summary = {
    total: filteredBatches.length,
    missing: filteredBatches.filter((batch) => batch.status === 'missing').length,
    matching: filteredBatches.filter((batch) => batch.status === 'matching').length,
    mismatch: filteredBatches.filter((batch) => batch.status === 'mismatch').length,
    matched: filteredBatches.filter((batch) => batch.status === 'matched').length,
    approved: filteredBatches.filter((batch) => batch.status === 'approved').length,
  };
  const modalBatch = batches.find((batch) => isSameBatchId(batch.id, modalBatchId)) || null;
  const modalComparisons = modalBatch?.comparisons.filter((item) => !isLineItemComparison(item)) || [];
  const modalLineItems = modalBatch?.lineItems || [];

  const isWide = useMediaQuery('(min-width: 1280px)');
  const listRef = useRef(null);
  const tabCounts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const base = batches.filter((batch) => {
      if (!batch.isReady) return false;
      if (role === 'chief_accountant' && !['matched', 'approved', 'final_approved', 'rejected'].includes(batch.status)) return false;
      const haystack = [batch.batchNumber, batch.note, batch.owner, batch.supplierName].join(' ').toLowerCase();
      return (
        matchesOverviewFilter(batch, overviewFilter) &&
        isWithinDateRange(batch, overviewDateRange) &&
        (!normalizedQuery || haystack.includes(normalizedQuery))
      );
    });
    return Object.fromEntries(AUDIT_STATUS_TABS.map((tab) => [tab.value, base.filter((batch) => matchesStatusTab(batch, tab.value)).length]));
  }, [batches, overviewDateRange, overviewFilter, role, searchQuery]);

  useEffect(() => {
    if (!isWide) return;
    if (paginatedBatches.length === 0) {
      if (modalBatchId !== null) setModalBatchId(null);
      return;
    }
    if (!paginatedBatches.some((batch) => isSameBatchId(batch.id, modalBatchId))) {
      setModalBatchId(paginatedBatches[0].id);
    }
  }, [isWide, paginatedBatches, modalBatchId]);

  // ↑/↓ chuyển giữa các bộ; trên màn rộng chi tiết đổi theo ngay. Ở mép trang thì sang trang kề bên.
  const pendingRowFocusRef = useRef(null);
  const selectRow = (batch) => {
    if (!isWide || !batch) return;
    setSelectedId(batch.id);
    setModalBatchId(batch.id);
  };
  const handleListKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...(listRef.current?.querySelectorAll('[data-batch-row]') || [])];
    const index = rows.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const down = event.key === 'ArrowDown';
    if (down && index === rows.length - 1 && safeBatchPage < totalBatchPages) {
      pendingRowFocusRef.current = 'first';
      setBatchPage(safeBatchPage + 1);
      return;
    }
    if (!down && index === 0 && safeBatchPage > 1) {
      pendingRowFocusRef.current = 'last';
      setBatchPage(safeBatchPage - 1);
      return;
    }
    const nextIndex = down ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1);
    rows[nextIndex].focus();
    selectRow(paginatedBatches[nextIndex]);
  };

  useEffect(() => {
    const target = pendingRowFocusRef.current;
    if (!target || paginatedBatches.length === 0) return;
    pendingRowFocusRef.current = null;
    const index = target === 'first' ? 0 : paginatedBatches.length - 1;
    listRef.current?.querySelectorAll('[data-batch-row]')[index]?.focus();
    selectRow(paginatedBatches[index]);
  });

  const requestApproveBatch = (batch, options = {}) => {
    // Kiểm tra điều kiện theo role
    const isChiefAccountant = role === 'chief_accountant';
    
    // Kế toán trưởng: có thể duyệt batch 'approved' (đã qua KTV) hoặc 'matched' (duyệt trực tiếp)
    // Kế toán viên: chỉ duyệt batch 'matched'
    const canApprove = isChiefAccountant 
      ? (batch.status === 'approved' || batch.status === 'matched')
      : canAccountantApprove(batch);
    
    if (!batch?.id || !canApprove || approvingBatchIds.includes(batch.id)) return;
    setApproveConfirm({ batch, options });
  };

  // Bộ khớp kế tiếp đang chờ duyệt cấp 1 trong danh sách đang hiển thị.
  const getNextApprovableId = (currentId) => {
    const pending = paginatedBatches.filter(canAccountantApprove);
    const index = pending.findIndex((item) => isSameBatchId(item.id, currentId));
    const next = pending[index + 1] || pending.find((item) => !isSameBatchId(item.id, currentId));
    return next?.id ?? null;
  };

  const handleApproveBatch = async () => {
    const batch = approveConfirm?.batch;
    const options = approveConfirm?.options || {};
    if (!batch?.id || approvingBatchIds.includes(batch.id)) return;
    const nextId = getNextApprovableId(batch.id);

    setError('');
    setApprovingBatchIds((prev) => [...prev, batch.id]);
    try {
      // Gọi API phù hợp theo role
      const isChiefAccountant = role === 'chief_accountant';
      const approveFunc = isChiefAccountant ? finalApproveDocumentBatch : approveDocumentBatch;
      const approvedBatch = repairTextDeep(await approveFunc(token, batch.id));
      updateCachedBatchItem(approvedBatch);
      const mappedBatch = mapApiBatchToAuditBatch(approvedBatch);
      setBatches((prev) => prev.map((item) => (isSameBatchId(item.id, mappedBatch.id) ? mappedBatch : item)));
      setSelectedId(mappedBatch.id);
      if (isWide && nextId !== null) {
        setSelectedId(nextId);
        setModalBatchId(nextId);
      } else if (!options.keepModalOpen) {
        setModalBatchId(null);
      }
      setApproveConfirm(null);
      toast.success(
        isChiefAccountant
          ? `Đã duyệt cuối và lưu trữ ${batch.batchNumber}.`
          : `Đã duyệt ${batch.batchNumber}, chờ kế toán trưởng duyệt cuối.`,
      );
    } catch (err) {
      setError(err.message || 'Không thể duyệt bộ chứng từ này. Vui lòng thử lại.');
      toast.error(err.message || 'Không thể duyệt bộ chứng từ này. Vui lòng thử lại.');
    } finally {
      setApprovingBatchIds((prev) => prev.filter((id) => !isSameBatchId(id, batch.id)));
    }
  };

  useEffect(() => {
    if (!isWide || role === 'chief_accountant') return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.key.toLowerCase() !== 'a') return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (approveConfirm || !canAccountantApprove(modalBatch)) return;
      event.preventDefault();
      requestApproveBatch(modalBatch, { keepModalOpen: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleOpenUploadedFile = async (file) => {
    if (!file?.file_url || file.status !== 'completed') return;

    try {
      const blob = await fetchUploadFileBlob(token, file);
      const ext = getFileExt(file.filename);
      const downloadUrl = URL.createObjectURL(blob);
      let previewUrl = downloadUrl;
      let xmlText = '';

      if (ext === 'xml') {
        xmlText = await blob.text();
      }

      setFilePreview({
        filename: file.filename,
        previewUrl,
        downloadUrl,
        xmlText,
      });
    } catch (err) {
      toast.error(err.message || 'Không thể mở file này. Vui lòng thử lại.');
    }
  };

  const handleUploadSupplement = (batch) => {
    if (!batch?.id) return;
    navigate(`/upload?batchId=${encodeURIComponent(batch.id)}&mode=supplement`);
  };

  if (loading) {
    return (
      <div className="rounded-card border border-line bg-surface px-5 py-12 text-center text-sm text-fg-subtle shadow-card">
        Đang tải danh sách bộ chứng từ...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-tone-danger-line bg-tone-danger-bg px-5 py-4 text-sm font-medium text-tone-danger-fg">
        {error}
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Bộ đối soát" description="Các bộ đã đủ PO, Hóa đơn và GRN để đối soát và duyệt." />
        <div className="rounded-card border border-dashed border-tone-neutral-line bg-surface px-5 py-12 text-center text-sm text-fg-subtle">
          Chưa có bộ chứng từ nào đã đủ PO, hóa đơn và GRN. Các bộ chứng từ còn thiếu chứng từ vẫn nằm ở Hàng đợi xử lý.
        </div>
      </div>
    );
  }

  // Màn rộng: chi tiết nằm cạnh danh sách. Màn hẹp: chi tiết mở trong hộp thoại.
  const AuditTitle = isWide ? 'h2' : DialogTitle;
  const auditDetailView = modalBatch ? (
    <>
            <div className={cn('flex flex-col gap-3 border-b border-line bg-surface px-5 py-4 lg:flex-row lg:items-start lg:justify-between', !isWide && 'sticky top-0 z-10')}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <AuditTitle className="text-2xl font-bold text-fg">
                    {modalBatch.batchNumber}
                  </AuditTitle>
                </div>
                <BatchMetaLine batch={{ ...modalBatch, completion: getCompletion(modalBatch) }} />
                {role !== 'chief_accountant' && getApproveBlockReason(modalBatch) && (
                  <p className="mt-1 max-w-3xl text-sm text-fg-muted">{getApproveBlockReason(modalBatch)}</p>
                )}
                <SignatureStrip batch={modalBatch} className="mt-3 max-w-3xl" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {role !== 'chief_accountant' && (modalBatch.status === 'rejected' || getApproveBlockReason(modalBatch)) && (
                  <button
                    type="button"
                    onClick={() => handleUploadSupplement(modalBatch)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-control bg-primary px-3 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    title="Upload bổ sung vào bộ chứng từ này"
                    aria-label={`Upload bổ sung vào bộ chứng từ ${modalBatch.batchNumber}`}
                  >
                    <UploadCloud size={14} />
                    {modalBatch.status === 'rejected' ? 'Upload bổ sung' : 'Bổ sung / thay chứng từ'}
                  </button>
                )}
                {role !== 'chief_accountant' && canAccountantApprove(modalBatch) && (
                  <Button
                    variant="primary"
                    leadingIcon={CheckCircle2}
                    loading={approvingBatchIds.some((id) => isSameBatchId(id, modalBatch.id))}
                    onClick={() => requestApproveBatch(modalBatch, { keepModalOpen: true })}
                    aria-keyshortcuts={isWide ? 'A' : undefined}
                  >
                    Duyệt cấp 1
                    {isWide && <kbd className="ml-1 rounded-sm border border-current/30 px-1 font-sans text-xs opacity-70">A</kbd>}
                  </Button>
                )}
                {!isWide && (
                <button
                  type="button"
                  onClick={() => setModalBatchId(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  title="Đóng"
                  aria-label="Đóng chi tiết bộ chứng từ"
                >
                  <X size={18} />
                </button>
                )}
              </div>
            </div>

            <div className={cn('space-y-6 p-5', !isWide && 'max-h-[calc(92vh-82px)] overflow-y-auto')}>
              {modalBatch.rawStatus === 'rejected' && (
                <RejectionNoteAlert note={modalBatch.rejectionNote} />
              )}
              <ForeignCopyNotice foreignCopy={modalBatch.foreignCopy} />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DOC_TYPES.map((type) => {
                  const list = modalBatch.docList?.[type.key] || [];
                  if (list.length === 0) {
                    return (
                      <DocumentCard
                        key={`${type.key}-missing`}
                        type={type}
                        doc={{ filename: '', missing: true, fields: {} }}
                        onOpenFile={handleOpenUploadedFile}
                      />
                    );
                  }
                  return (
                    <DocumentCard
                      key={type.key}
                      type={type}
                      docs={list}
                      onOpenFile={handleOpenUploadedFile}
                    />
                  );
                })}
              </div>

              <section>
                <div className="pb-2">
                  <h3 className="text-base font-bold text-fg">Bảng đối chiếu thông tin</h3>
                </div>
                <FieldComparisonTable items={modalComparisons} />
              </section>

              <section>
                <div className="pb-2">
                  <h3 className="text-base font-bold text-fg">Chi tiết hàng hóa</h3>
                </div>
                <LineItemCopies items={modalLineItems} emptyText="Chưa có dữ liệu hàng hóa. Khi đủ chứng từ, hệ thống sẽ tách từng dòng hàng để đối chiếu." />
              </section>

              <ReconciliationHistorySection
                history={modalBatch.history}
                onOpenFile={handleOpenUploadedFile}
              />
            </div>
    </>
  ) : null;

  return (
    <div className="-mx-4 -my-5 min-h-screen space-y-5 bg-surface px-4 pt-5 md:-mx-6 md:-my-6 md:px-6 md:pt-6">
      <PageHeader
        title="Bộ đối soát"
        description={
          overviewFilterLabel ? (
            <>
              Đang xem nhóm: <span className="font-semibold text-fg">{overviewFilterLabel}</span>
            </>
          ) : (
            'Các bộ đã đủ PO, Hóa đơn và GRN để đối soát và duyệt.'
          )
        }
        actions={
          <Button variant="primary" leadingIcon={FileSearch} onClick={() => setIsReportModalOpen(true)} title="Xuất báo cáo đối soát dạng PDF / In">
            Xuất báo cáo
          </Button>
        }
      />

      {error && (
        <div className="rounded-card border border-tone-danger-line bg-tone-danger-bg px-4 py-3 text-sm font-semibold text-tone-danger-fg">
          {error}
        </div>
      )}


      <div className="border-b border-line pb-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo tên bộ chứng từ, ghi chú, người tạo, nhà cung cấp..."
              className="input-field pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
                title="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="-mx-4 grid border-t border-line md:-mx-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 bg-surface-muted xl:border-r xl:border-line">
          <h2 className="sr-only">Danh sách bộ chứng từ ({filteredBatches.length})</h2>
          <div role="group" aria-label={vi.batchFilters.groupLabel} className="sticky top-0 z-10 flex flex-wrap gap-0.5 border-b border-line bg-surface-muted px-2 py-2">
            {AUDIT_STATUS_TABS.map((tab) => {
              const count = loading ? '–' : tabCounts[tab.value] ?? 0;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={statusFilter === tab.value}
                  aria-label={vi.batchFilters.countLabel(tab.label, count)}
                  onClick={() => setStatusFilter(tab.value)}
                  className={cn(
                    'shrink-0 rounded-control px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    statusFilter === tab.value ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface hover:text-fg',
                  )}
                >
                  {tab.label}
                  <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="px-4 py-4 md:px-6 xl:px-4">

          <div className="space-y-3">
            <ul ref={listRef} aria-label="Danh sách bộ chứng từ" onKeyDown={handleListKeyDown} className="min-w-0 divide-y divide-line border-y border-line bg-surface">
            {paginatedBatches.map((batch) => {
              const isSelected = isWide && isSameBatchId(batch.id, modalBatch?.id);
              return (
                <li key={batch.id}>
                  <BatchListItem
                    batch={{ ...batch, completion: getCompletion(batch) }}
                    role={role}
                    selected={isSelected}
                    onSelect={() => {
                      setSelectedId(batch.id);
                      setModalBatchId(batch.id);
                    }}
                  />
                </li>
              );
            })}
            </ul>

            {filteredBatches.length === 0 && (
              <div className="rounded-control border border-dashed border-tone-neutral-line px-5 py-12 text-center text-sm text-fg-subtle">
                <FileSearch size={36} className="mx-auto mb-2 opacity-40" />
                <p className="font-semibold text-fg-muted">Không tìm thấy bộ chứng từ phù hợp với bộ lọc hiện tại.</p>
                <p className="mt-1 text-xs text-fg-subtle">Thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh bộ lọc.</p>
                {(searchQuery || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted shadow-card transition-colors hover:bg-surface-muted"
                  >
                    Xóa bộ lọc & tìm kiếm
                  </button>
                )}
              </div>
            )}
          </div>

          {filteredBatches.length > BATCHES_PER_PAGE && (
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
              <span>
                Hiển thị {batchStartIndex}-{batchEndIndex} / {filteredBatches.length} bộ chứng từ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBatchPage((page) => Math.max(1, page - 1))}
                  disabled={safeBatchPage === 1}
                  className="rounded-control border border-line px-3 py-1.5 font-semibold text-fg-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Trước
                </button>
                <span className="min-w-[88px] text-center font-semibold text-fg-muted">
                  Trang {safeBatchPage}/{totalBatchPages}
                </span>
                <button
                  type="button"
                  onClick={() => setBatchPage((page) => Math.min(totalBatchPages, page + 1))}
                  disabled={safeBatchPage === totalBatchPages}
                  className="rounded-control border border-line px-3 py-1.5 font-semibold text-fg-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {isWide && (
          <section aria-label="Chi tiết bộ chứng từ" className="min-w-0 bg-surface">
            {auditDetailView || (
              <p className="px-6 py-16 text-center text-sm text-fg-subtle">Chọn một bộ ở danh sách bên trái để xem ba liên chứng từ.</p>
            )}
          </section>
        )}

      </div>

      <Dialog open={!isWide && Boolean(modalBatch)} onClose={() => setModalBatchId(null)} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-scrim/50" />
        <div className="fixed inset-0 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
          {modalBatch && (
            <DialogPanel className="h-dvh w-full max-w-[1360px] overflow-y-auto bg-surface text-fg shadow-pop sm:h-auto sm:max-h-[92vh] sm:rounded-modal">
              {auditDetailView}
            </DialogPanel>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(approveConfirm)}
        title={role === 'chief_accountant' ? 'Duyệt cuối và lưu trữ hồ sơ' : 'Duyệt bộ chứng từ (cấp 1)'}
        description={
          role === 'chief_accountant'
            ? 'Kiểm tra lại thông tin trước khi khóa hồ sơ.'
            : 'Bộ sẽ được chuyển cho kế toán trưởng duyệt cuối.'
        }
        confirmLabel={role === 'chief_accountant' ? 'Duyệt và lưu trữ' : 'Duyệt và chuyển'}
        cancelLabel="Hủy"
        loading={Boolean(approveConfirm?.batch && approvingBatchIds.some((id) => isSameBatchId(id, approveConfirm.batch.id)))}
        onCancel={() => {
          if (approveConfirm?.batch && approvingBatchIds.some((id) => isSameBatchId(id, approveConfirm.batch.id))) return;
          setApproveConfirm(null);
        }}
        onConfirm={handleApproveBatch}
      >
        <ApprovalConfirmBody batch={approveConfirm?.batch} final={role === 'chief_accountant'} />
      </ConfirmDialog>
      <FilePreviewModal filePreview={filePreview} onClose={closeFilePreview} />
      <ReconciliationReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        batches={filteredBatches}
        summary={summary}
        overviewFilterLabel={overviewFilterLabel}
        overviewDateRange={overviewDateRange}
        currentUser={currentUser}
      />
    </div>
  );
}


