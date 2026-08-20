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
import {
  calculateMatchSummary,
  compareDocumentField,
  comparisonStatusToResult,
  compareValues as compareRawValues,
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

// Badge cho kế toán trưởng - hiển thị "Được duyệt bởi [Tên]"
function ApprovedByBadge({ approvedBy }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CheckCircle2 size={14} />
      Được duyệt bởi {approvedBy}
    </span>
  );
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

function DocumentCard({ type, doc, onOpenFile }) {
  const Icon = type.icon;
  const normalizedVisibleFields = Object.entries(doc?.fields || {})
    .map(([label, value]) => [repairTextDeep(label), value])
    .filter(([label]) => ['Số chứng từ', 'Ngày chứng từ'].includes(label));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.06)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${doc?.missing ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{type.label}</p>
            <p className={`mt-1 truncate text-xs ${doc?.missing ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {doc?.missing ? 'Chưa có chứng từ' : doc.filename}
            </p>
          </div>
        </div>
        {!doc?.missing && (
          <button
            type="button"
            onClick={() => onOpenFile?.(doc.file)}
            className="btn-ghost h-8 w-8 rounded-lg p-0"
            title="Xem chứng từ gốc"
            aria-label={`Xem chứng từ gốc ${doc.filename}`}
          >
            <Eye size={16} />
          </button>
        )}
      </div>

      {!doc?.missing && (
        <>
          <div className="mt-4 space-y-2.5">
            {normalizedVisibleFields.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="max-w-[58%] text-right font-semibold text-slate-800 dark:text-slate-200">{value}</span>
              </div>
            ))}
          </div>
        </>
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

  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${className}`}>{text}</span>;
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
        values[2] = `${formatDisplayValue(grnAdjustment.baseTotal)} + ${grnAdjustment.vatRate}%`;
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

function findItemByIdentity(items, sourceItem, index) {
  const sku = sourceItem?.sku;
  if (sku) {
    const foundBySku = items.find((item) => item?.sku && item.sku === sku);
    if (foundBySku) return foundBySku;
  }
  return items[index] || {};
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
  const maxLength = Math.max(poItems.length, invoiceItems.length, grnItems.length);

  return Array.from({ length: maxLength }).map((_, index) => {
    const baseItem = poItems[index] || invoiceItems[index] || grnItems[index] || {};
    const poItem = findItemByIdentity(poItems, baseItem, index);
    const invoiceItem = findItemByIdentity(invoiceItems, baseItem, index);
    const grnItem = findItemByIdentity(grnItems, baseItem, index);
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
      result: qtyResult.result || priceResult.result || amountResult.result || 'Khớp',
      severity,
    };
  });
}

function mapApiBatchToAuditBatch(batch) {
  const isReady = isApiBatchReady(batch);
  const filesByType = DOC_TYPES.reduce((acc, type) => {
    const validFile = (batch.files || []).find(
      (file) =>
        file.doc_type === type.key &&
        file.ai_extraction &&
        file.ai_extraction.is_correct_type &&
        file.ai_extraction.extracted_data
    );
    acc[type.key] = validFile || null;
    return acc;
  }, {});

  const docs = getEmptyDocs();
  DOC_TYPES.forEach((type) => {
    const file = filesByType[type.key];
    if (file) {
      docs[type.key] = mapFileToDocument(file, type.key);
    }
  });

  const comparisons = isReady ? buildComparisons(docs) : [];
  const lineItems = isReady ? buildLineItems(docs) : [];
  const summary = isReady ? calculateMatchSummary(comparisons, lineItems) : { matchRate: 0, checkedFields: 0, matchedFields: 0, mismatchFields: 0, missingFields: 3 };

  // Xác định trạng thái batch
  let status = batch.status || 'missing';
  
  // Nếu backend trả về status rõ ràng, sử dụng luôn
  if (['matched', 'approved', 'final_approved', 'rejected', 'mismatch'].includes(batch.status)) {
    status = batch.status;
  } else if (isReady) {
    status = summary.matchRate === 100 ? 'matched' : summary.matchRate > 0 ? 'mismatch' : 'matching';
  }

  return {
    id: String(batch.id),
    batchNumber: batch.batch_number,
    status,
    updatedAt: batch.updated_at || batch.created_at,
    owner: batch.created_by_name || 'Hệ thống',
    approvedBy: batch.approved_by_name || null,
    chiefApprovedBy: batch.chief_approved_by_name || null,
    matchRate: summary.matchRate,
    checkedFields: summary.checkedFields,
    matchedFields: summary.matchedFields,
    mismatchFields: summary.mismatchFields,
    missingFields: summary.missingFields,
    docs,
    comparisons,
    lineItems,
    isReady,
  };
}

function filterChiefBatches(items) {
  return (items || [])
    .map(mapApiBatchToAuditBatch)
    .filter((batch) => ['matched', 'approved', 'final_approved', 'rejected'].includes(batch.status));
}

export default function ChiefAccountantBatches({ token }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const cached = getCachedBatches();
  const [batches, setBatches] = useState(() => filterChiefBatches(cached?.items));
  const [isLoading, setIsLoading] = useState(() => !cached);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
  const [detailBatchId, setDetailBatchId] = useState(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [dateRange, setDateRange] = useState(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    return {
      start: parseDateInput(fromParam, 'start'),
      end: parseDateInput(toParam, 'end'),
    };
  });
  const [currentPage, setCurrentPage] = useState(1);

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
    if (!getCachedBatches()) {
      setIsLoading(true);
    }
    try {
      const response = await fetchDocumentBatchesWithCache(token, { forceRefresh });
      setBatches(filterChiefBatches(response?.items));
    } catch (error) {
      console.error('Failed to load batches:', error);
      if (!getCachedBatches()) {
        alert(error.message || 'Không thể tải danh sách batch');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeBatchCache((data) => {
      if (data?.items) {
        setBatches(filterChiefBatches(data.items));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (token) {
      loadBatches();
    }
  }, [token]);

  const handleApproveBatch = async (batch) => {
    if (!window.confirm('Bạn có muốn duyệt không?')) return;

    try {
      const updated = await finalApproveDocumentBatch(token, batch.id);
      updateCachedBatchItem(updated);
      setDetailPanelOpen(false);
    } catch (error) {
      console.error('Failed to approve batch:', error);
      alert(error.message || 'Không thể duyệt batch');
    }
  };

  const handleRejectBatch = async (batch) => {
    if (!window.confirm('Bạn có chắc chắn muốn từ chối batch này không?')) return;

    try {
      const updated = await rejectDocumentBatch(token, batch.id);
      updateCachedBatchItem(updated);
      setDetailPanelOpen(false);
    } catch (error) {
      console.error('Failed to reject batch:', error);
      alert(error.message || 'Không thể từ chối batch');
    }
  };

  const handleOpenFile = async (file) => {
    if (!file) return;
    try {
      const blob = await fetchUploadFileBlob(token, file);
      const blobUrl = URL.createObjectURL(blob);
      const fileExt = getFileExt(file.filename);

      if (fileExt === 'xml') {
        const xmlText = await blob.text();
        const previewHtml = buildXmlPreviewHtml(file.filename, xmlText);
        const previewBlob = new Blob([previewHtml], { type: 'text/html; charset=utf-8' });
        const previewUrl = URL.createObjectURL(previewBlob);
        window.open(previewUrl, '_blank');
      } else {
        window.open(blobUrl, '_blank');
      }
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
        batch.batchNumber.toLowerCase().includes(query) ||
        batch.owner.toLowerCase().includes(query) ||
        batch.approvedBy?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'unapproved') {
        result = result.filter((batch) => batch.status === 'approved' || batch.status === 'matched');
      } else if (statusFilter === 'approved') {
        result = result.filter((batch) => batch.status === 'final_approved');
      } else if (statusFilter === 'rejected') {
        result = result.filter((batch) => batch.status === 'rejected');
      } else {
        result = result.filter((batch) => batch.status === statusFilter);
      }
    }

    if (dateRange.start || dateRange.end) {
      result = result.filter((batch) => isWithinDateRange(batch, dateRange));
    }

    return result;
  }, [batches, searchQuery, statusFilter, dateRange]);

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
  };

  const handleCloseDetailPanel = () => {
    setDetailPanelOpen(false);
    setDetailBatchId(null);
  };

  const canApproveBatch = (batch) => {
    return batch.status === 'matched' || batch.status === 'approved';
  };

  const canRejectBatch = (batch) => {
    return batch.status === 'approved';
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Batch đối soát
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Danh sách batch đã được kế toán viên duyệt
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Tìm theo mã batch, người tạo, người duyệt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-10"
            />
          </div>

          <div className="relative min-w-[200px]">
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
          
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterMenuOpen(!filterMenuOpen)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                dateRange.start || dateRange.end
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'btn-secondary'
              }`}
            >
              <SlidersHorizontal size={16} />
              {dateRange.start || dateRange.end ? 'Đang lọc thời gian' : 'Lọc theo thời gian'}
            </button>
            
            {filterMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Từ ngày
                    </label>
                    <input
                      type="date"
                      value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
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
                      value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
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
                          if (dateRange.start) {
                            next.set('from', dateRange.start.toISOString().split('T')[0]);
                          } else {
                            next.delete('from');
                          }
                          if (dateRange.end) {
                            next.set('to', dateRange.end.toISOString().split('T')[0]);
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
      </div>

      {/* Batch List */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
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
                  className="card p-6 transition-all hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                          {batch.batchNumber}
                        </h3>
                        {/* Hiển thị badge "Được duyệt bởi [Tên]" */}
                        {batch.status === 'approved' && batch.approvedBy && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 size={12} />
                            Được duyệt bởi {batch.approvedBy}
                          </span>
                        )}
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
                      <div className="mt-2 flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                        <span>Cập nhật: {batch.updatedAt}</span>
                        <span>•</span>
                        <span>Tạo bởi: {batch.owner}</span>
                      </div>
                      
                      {/* Document files */}
                      <div className="mt-3 flex flex-wrap gap-2">
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

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewDetails(batch)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Eye size={13} />
                        Chi tiết
                      </button>
                      
                      {canApproveBatch(batch) && (
                        <button
                          type="button"
                          onClick={() => handleApproveBatch(batch)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-700"
                        >
                          <CheckCircle2 size={13} />
                          Duyệt
                        </button>
                      )}
                      
                      {canRejectBatch(batch) && (
                        <button
                          type="button"
                          onClick={() => handleRejectBatch(batch)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 active:scale-[0.98]"
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
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Trang trước
                </button>
                <span className="text-sm text-slate-600 dark:text-slate-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-sm">
          <div className="card max-h-[92vh] w-full max-w-[1360px] overflow-y-auto">
            {/* Panel Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {detailBatch.batchNumber}
                  </h2>
                  <div className="mt-2.5 flex items-center gap-3">
                    {detailBatch.status === 'approved' && detailBatch.approvedBy && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 size={12} />
                        Được duyệt bởi {detailBatch.approvedBy}
                      </span>
                    )}
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
                </div>
                
                <div className="flex items-center gap-2">
                  {canApproveBatch(detailBatch) && (
                    <button
                      type="button"
                      onClick={() => handleApproveBatch(detailBatch)}
                      className="inline-flex h-8.5 sm:h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={14} />
                      Duyệt
                    </button>
                  )}
                  
                  {canRejectBatch(detailBatch) && (
                    <button
                      type="button"
                      onClick={() => handleRejectBatch(detailBatch)}
                      className="inline-flex h-8.5 sm:h-9 items-center gap-1.5 rounded-full bg-rose-600 px-3.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 active:scale-[0.98]"
                    >
                      <X size={14} />
                      Từ chối
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleCloseDetailPanel}
                    className="btn-ghost h-8 w-8 rounded-lg p-0"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Panel Content */}
            <div className="max-h-[calc(92vh-82px)] space-y-5 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-3">
                {DOC_TYPES.map((type) => (
                  <DocumentCard
                    key={type.key}
                    type={type}
                    doc={detailBatch.docs[type.key]}
                    onOpenFile={handleOpenFile}
                  />
                ))}
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
                            <td className="border-l border-dashed border-slate-300 px-2 py-2.5 text-right tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">{item.poQty}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.invoiceQty}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.grnQty}</td>
                            <td className="border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap">{item.poPrice}</td>
                            <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.invoicePrice}</td>
                            <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.grnPrice || '-'}</td>
                            <td className="border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap">{item.poAmount || '-'}</td>
                            <td className="px-2.5 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{item.amount}</td>
                            <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.grnAmount || '-'}</td>
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
                          <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{item.po}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{item.invoice}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{item.grn}</td>
                          <td className="px-4 py-3">
                            <ResultPill severity={item.severity} text={item.result} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
