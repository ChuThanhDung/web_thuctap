import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
    tone: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-300',
    rail: 'bg-brand-500',
  },
  matched: {
    label: 'Khớp hoàn toàn',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rail: 'bg-emerald-500',
  },
  approved: {
    label: 'Đã duyệt',
    tone: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
    rail: 'bg-teal-500',
  },
  final_approved: {
    label: 'Đã duyệt cuối',
    tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    rail: 'bg-blue-500',
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

const SAMPLE_BATCHES = [
  {
    id: 'batch-08',
    batchNumber: 'BATCH_11_08_2026_08',
    status: 'matched',
    updatedAt: '2026-08-11 12:21:18',
    owner: 'Chu Thanh DÅ©ng',
    matchRate: 100,
    checkedFields: 18,
    matchedFields: 18,
    mismatchFields: 0,
    missingFields: 0,
    decision: 'Có thể xác nhận ngay. Tất cả trường quan trọng giữa PO, Invoice và GRN đều khớp.',
    docs: {
      po: {
        filename: 'po_11_08_2026_05.pdf',
        extractedAt: '12:20:42',
        confidence: 98,
        fields: {
          'Số chứng từ': 'PO-2026-0811-05',
          'Nhà cung cấp': 'Công ty Minh An',
          'Mã số thuế': '0312456789',
          'Ngày chứng từ': '2026-08-10',
          'Tổng tiền': '128,500,000 VND',
        },
      },
      invoice: {
        filename: 'invoice_11_08_2026_04.pdf',
        extractedAt: '12:20:48',
        confidence: 97,
        fields: {
          'Số chứng từ': 'INV-2026-0811-04',
          'Nhà cung cấp': 'Công ty Minh An',
          'Mã số thuế': '0312456789',
          'Ngày chứng từ': '2026-08-11',
          'Tổng tiền': '128,500,000 VND',
        },
      },
      grn: {
        filename: 'grn_11_08_2026_02.pdf',
        extractedAt: '12:20:55',
        confidence: 96,
        fields: {
          'Số chứng từ': 'GRN-2026-0811-02',
          'Nhà cung cấp': 'Công ty Minh An',
          'Mã số thuế': '0312456789',
          'Ngày chứng từ': '2026-08-11',
          'Tổng tiền': '128,500,000 VND',
        },
      },
    },
    comparisons: [
      { field: 'Nhà cung cấp', po: 'Công ty Minh An', invoice: 'Công ty Minh An', grn: 'Công ty Minh An', result: 'Khớp', severity: 'ok' },
      { field: 'Mã số thuế', po: '0312456789', invoice: '0312456789', grn: '0312456789', result: 'Khớp', severity: 'ok' },
      { field: 'Mã hàng / Tên hàng', po: 'SKU-2241 - Mực in HP 107A', invoice: 'SKU-2241 - Mực in HP 107A', grn: 'SKU-2241 - Mực in HP 107A', result: 'Đúng chủng loại', severity: 'ok' },
      { field: 'Đơn vị tính', po: 'Hộp', invoice: 'Hộp', grn: 'Hộp', result: 'Khớp', severity: 'ok' },
      { field: 'Số lượng hàng', po: '1,240', invoice: '1,240', grn: '1,240', result: 'Khớp', severity: 'ok' },
      { field: 'Đơn giá', po: '103,629', invoice: '103,629', grn: '-', result: 'Không vượt PO', severity: 'ok' },
      { field: 'Thuế suất VAT', po: '8%', invoice: '8%', grn: '-', result: 'Khớp', severity: 'ok' },
      { field: 'Tổng tiền', po: '128,500,000', invoice: '128,500,000', grn: '128,500,000', result: 'Khớp', severity: 'ok' },
    ],
    lineItems: [
      {
        sku: 'SKU-2241',
        name: 'Mực in HP 107A',
        unit: 'Hộp',
        poQty: '720',
        invoiceQty: '720',
        grnQty: '720',
        poPrice: '103,629',
        invoicePrice: '103,629',
        vat: '8%',
        amount: '74,612,880',
        result: 'Khớp',
        severity: 'ok',
      },
      {
        sku: 'SKU-2242',
        name: 'Mực in Canon 2900',
        unit: 'Hộp',
        poQty: '520',
        invoiceQty: '520',
        grnQty: '520',
        poPrice: '103,629',
        invoicePrice: '103,629',
        vat: '8%',
        amount: '53,887,080',
        result: 'Khớp',
        severity: 'ok',
      },
    ],
    issues: [],
  },
  {
    id: 'batch-07',
    batchNumber: 'BATCH_11_08_2026_07',
    status: 'mismatch',
    updatedAt: '2026-08-11 10:36:20',
    owner: 'Lê Minh Trang',
    matchRate: 82,
    checkedFields: 18,
    matchedFields: 14,
    mismatchFields: 3,
    missingFields: 1,
    decision: 'Cần kiểm tra trước khi xác nhận vì Invoice cao hơn PO và batch còn thiếu GRN.',
    docs: {
      po: {
        filename: 'po_11_08_2026_4.pdf',
        extractedAt: '10:34:02',
        confidence: 96,
        fields: {
          'Số chứng từ': 'PO-2026-0811-04',
          'Nhà cung cấp': 'Tân Phát Logistics',
          'Mã số thuế': '0109988776',
          'Ngày chứng từ': '2026-08-09',
          'Tổng tiền': '74,250,000 VND',
        },
      },
      invoice: {
        filename: 'invoice_11_08_2026_2.pdf',
        extractedAt: '10:34:09',
        confidence: 93,
        fields: {
          'Số chứng từ': 'INV-2026-0811-02',
          'Nhà cung cấp': 'Tân Phát Logistic',
          'Mã số thuế': '0109988776',
          'Ngày chứng từ': '2026-08-11',
          'Tổng tiền': '76,250,000 VND',
        },
      },
      grn: { filename: '', missing: true, fields: {} },
    },
    comparisons: [
      { field: 'Nhà cung cấp', po: 'Tân Phát Logistics', invoice: 'Tân Phát Logistic', grn: '-', result: 'Tên NCC khác 1 ký tự', severity: 'warning' },
      { field: 'Mã hàng / Tên hàng', po: 'SKU-8830 - Pallet nhựa xanh', invoice: 'SKU-8830 - Pallet nhựa xanh', grn: '-', result: 'Chưa có GRN để xác nhận', severity: 'warning' },
      { field: 'Đơn vị tính', po: 'Cái', invoice: 'Cái', grn: '-', result: 'Tạm khớp PO-Invoice', severity: 'ok' },
      { field: 'Số lượng hàng', po: '150', invoice: '150', grn: '-', result: 'Thiếu GRN để chốt thực nhận', severity: 'warning' },
      { field: 'Đơn giá', po: '495,000', invoice: '495,000', grn: '-', result: 'Không vượt PO', severity: 'ok' },
      { field: 'Thuế suất VAT', po: '8%', invoice: '8%', grn: '-', result: 'Khớp', severity: 'ok' },
      { field: 'Tổng tiền', po: '74,250,000', invoice: '76,250,000', grn: '-', result: 'Invoice cao hơn PO 2,000,000', severity: 'danger' },
      { field: 'Phí vận chuyển', po: '0', invoice: '2,000,000', grn: '-', result: 'Invoice có phí ngoài PO', severity: 'danger' },
      { field: 'GRN', po: 'Cần đối chiếu', invoice: 'Cần đối chiếu', grn: 'Thiếu', result: 'Chưa có phiếu nhập kho', severity: 'warning' },
    ],
    lineItems: [
      {
        sku: 'SKU-8830',
        name: 'Pallet nhựa xanh',
        unit: 'Cái',
        poQty: '150',
        invoiceQty: '150',
        grnQty: '-',
        poPrice: '495,000',
        invoicePrice: '495,000',
        vat: '8%',
        amount: '74,250,000',
        result: 'Thiếu GRN để chốt thực nhận',
        severity: 'warning',
      },
      {
        sku: 'FEE-SHIP',
        name: 'Phí vận chuyển',
        unit: 'Lần',
        poQty: '0',
        invoiceQty: '1',
        grnQty: '-',
        poPrice: '0',
        invoicePrice: '2,000,000',
        vat: '8%',
        amount: '2,000,000',
        result: 'Có phí ngoài PO',
        severity: 'danger',
      },
    ],
    issues: [
      'Thiếu phiếu nhập kho GRN nên chưa kết luận được số lượng thực nhận.',
      'Invoice cao hơn PO 2,000,000 VND do xuất hiện phí vận chuyển.',
      'Tên nhà cung cấp trên Invoice thiếu chữ "s" so với PO.',
    ],
  },
  {
    id: 'batch-09',
    batchNumber: 'BATCH_11_08_2026_09',
    status: 'missing',
    updatedAt: '2026-08-11 11:33:11',
    owner: 'Nguyễn Hoàng Anh',
    matchRate: 0,
    checkedFields: 0,
    matchedFields: 0,
    mismatchFields: 0,
    missingFields: 3,
    decision: 'Chưa thể đối soát. Cần bổ sung đủ PO, Invoice và GRN.',
    docs: {
      po: { filename: '', missing: true, fields: {} },
      invoice: { filename: '', missing: true, fields: {} },
      grn: { filename: '', missing: true, fields: {} },
    },
    comparisons: [],
    lineItems: [],
    issues: ['Batch chưa có PO, Invoice và GRN. Cần bổ sung đủ 3 chứng từ để bắt đầu đối soát.'],
  },
  {
    id: 'batch-06',
    batchNumber: 'BATCH_11_08_2026_06',
    status: 'matching',
    updatedAt: '2026-08-11 10:34:42',
    owner: 'Hệ thống AI',
    matchRate: 64,
    checkedFields: 11,
    matchedFields: 7,
    mismatchFields: 1,
    missingFields: 3,
    decision: 'Kết quả đang tạm thời. Hệ thống vẫn đọc bảng hàng hóa trong Invoice và GRN.',
    docs: {
      po: {
        filename: 'po_11_08_2026_3.pdf',
        extractedAt: '10:33:58',
        confidence: 94,
        fields: {
          'Số chứng từ': 'PO-2026-0811-03',
          'Nhà cung cấp': 'Hoa Bình Food',
          'Tổng tiền': '43,890,000 VND',
        },
      },
      invoice: {
        filename: 'invoice_11_08_2026_1.xml',
        extractedAt: '10:34:06',
        confidence: 99,
        fields: {
          'Số chứng từ': 'INV-2026-0811-01',
          'Nhà cung cấp': 'Hoa Bình Food',
          'Tổng tiền': 'Đang đọc dòng hàng',
        },
      },
      grn: {
        filename: 'grn_11_08_2026_01.pdf',
        extractedAt: 'Đang xử lý',
        confidence: 71,
        fields: { 'Trạng thái': 'Đang tách bảng hàng hóa' },
      },
    },
    comparisons: [
      { field: 'Nhà cung cấp', po: 'Hoa Bình Food', invoice: 'Hoa Bình Food', grn: 'Đang đọc', result: 'Tạm khớp PO-Invoice', severity: 'ok' },
      { field: 'Mã hàng / Tên hàng', po: 'SKU-4410 - Bột mì số 11', invoice: 'SKU-4410 - Bột mì số 11', grn: 'Đang đọc', result: 'Chờ GRN hoàn tất', severity: 'warning' },
      { field: 'Đơn vị tính', po: 'Bao', invoice: 'Bao', grn: 'Đang đọc', result: 'Chờ GRN hoàn tất', severity: 'warning' },
      { field: 'Số lượng hàng', po: '300', invoice: 'Đang đọc', grn: 'Đang đọc', result: 'Chờ hệ thống hoàn tất', severity: 'warning' },
      { field: 'Đơn giá', po: '146,300', invoice: 'Đang đọc', grn: '-', result: 'Chờ hệ thống hoàn tất', severity: 'warning' },
      { field: 'Thuế suất VAT', po: '5%', invoice: 'Đang đọc', grn: '-', result: 'Chờ hệ thống hoàn tất', severity: 'warning' },
      { field: 'Tổng tiền', po: '43,890,000', invoice: 'Đang đọc', grn: 'Đang đọc', result: 'Chờ hệ thống hoàn tất', severity: 'warning' },
    ],
    lineItems: [
      {
        sku: 'SKU-4410',
        name: 'Bột mì số 11',
        unit: 'Bao',
        poQty: '300',
        invoiceQty: 'Đang đọc',
        grnQty: 'Đang đọc',
        poPrice: '146,300',
        invoicePrice: 'Đang đọc',
        vat: '5%',
        amount: '43,890,000',
        result: 'Đang đối soát',
        severity: 'warning',
      },
    ],
    issues: ['Hệ thống đang đọc bảng hàng hóa trong Invoice và GRN. Kết quả hiện tại chỉ là tạm thời.'],
  },
  {
    id: 'batch-05',
    batchNumber: 'BATCH_11_08_2026_05',
    status: 'mismatch',
    updatedAt: '2026-08-11 10:17:03',
    owner: 'Phạm Quốc Việt',
    matchRate: 91,
    checkedFields: 18,
    matchedFields: 16,
    mismatchFields: 2,
    missingFields: 0,
    decision: 'Có thể xử lý nếu xác nhận lại số lượng GRN và ngày nhập kho.',
    docs: {
      po: {
        filename: 'po_11_08_2026_3.pdf',
        extractedAt: '10:15:41',
        confidence: 95,
        fields: {
          'Số chứng từ': 'PO-2026-0811-03',
          'Nhà cung cấp': 'An Khang Supplies',
          'Tổng tiền': '52,300,000 VND',
        },
      },
      invoice: {
        filename: 'invoice_11_08_2026_3.pdf',
        extractedAt: '10:15:45',
        confidence: 94,
        fields: {
          'Số chứng từ': 'INV-2026-0811-03',
          'Nhà cung cấp': 'An Khang Supplies',
          'Tổng tiền': '52,300,000 VND',
        },
      },
      grn: {
        filename: 'grn_11_08_2026_03.pdf',
        extractedAt: '10:15:50',
        confidence: 92,
        fields: {
          'Số chứng từ': 'GRN-2026-0811-03',
          'Nhà cung cấp': 'An Khang Supplies',
          'Tổng tiền': '52,300,000 VND',
        },
      },
    },
    comparisons: [
      { field: 'Mã hàng / Tên hàng', po: 'SKU-1182 - Găng tay nitrile', invoice: 'SKU-1182 - Găng tay nitrile', grn: 'SKU-1182 - Găng tay nitrile', result: 'Đúng chủng loại', severity: 'ok' },
      { field: 'Đơn vị tính', po: 'Hộp', invoice: 'Hộp', grn: 'Hộp', result: 'Khớp', severity: 'ok' },
      { field: 'Số lượng hàng', po: '240 hộp', invoice: '240 hộp', grn: '236 hộp', result: 'GRN nhận thiếu 4 hộp', severity: 'danger' },
      { field: 'Đơn giá', po: '217,917', invoice: '217,917', grn: '-', result: 'Không vượt PO', severity: 'ok' },
      { field: 'Thuế suất VAT', po: '8%', invoice: '8%', grn: '-', result: 'Khớp', severity: 'ok' },
      { field: 'Ngày chứng từ', po: '2026-08-08', invoice: '2026-08-11', grn: '2026-08-07', result: 'GRN trước ngày PO', severity: 'warning' },
      { field: 'Tổng tiền', po: '52,300,000', invoice: '52,300,000', grn: '52,300,000', result: 'Khớp', severity: 'ok' },
    ],
    lineItems: [
      {
        sku: 'SKU-1182',
        name: 'Găng tay nitrile',
        unit: 'Hộp',
        poQty: '240',
        invoiceQty: '240',
        grnQty: '236',
        poPrice: '217,917',
        invoicePrice: '217,917',
        vat: '8%',
        amount: '52,300,000',
        result: 'GRN nhận thiếu 4 hộp',
        severity: 'danger',
      },
      {
        sku: 'SKU-1183',
        name: 'Khẩu trang y tế 4 lớp',
        unit: 'Thùng',
        poQty: '80',
        invoiceQty: '80',
        grnQty: '80',
        poPrice: '315,000',
        invoicePrice: '315,000',
        vat: '8%',
        amount: '25,200,000',
        result: 'Khớp',
        severity: 'ok',
      },
    ],
    issues: [
      'GRN ghi nhận thiếu 4 hộp tại mã hàng SKU-1182.',
      'Ngày nhập kho trên GRN sớm hơn ngày PO, cần kiểm tra lại chứng từ gốc.',
    ],
  },
];

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
    incomplete: 'Batch chưa có hồ sơ',
  };
  return labels[overviewFilter] || null;
}

function getStatusIcon(status) {
  if (status === 'matched' || status === 'approved' || status === 'final_approved') return CheckCircle2;
  if (status === 'mismatch' || status === 'rejected') return AlertTriangle;
  if (status === 'matching') return Clock3;
  return ClipboardList;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.matching;
  const Icon = getStatusIcon(status);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
      <Icon size={14} />
      {meta.label}
    </span>
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
  const missingDataFields = missingCount + summary.warningFields;
  const isApproved = batch.status === 'approved';
  const isFinalApproved = batch.status === 'final_approved';
  const hasRejection = Boolean(batch.rejection_note);
  const isRejected = batch.status === 'rejected' || hasRejection;
  const backendReconciliationStatus = batch.reconciliation_status;
  const displayStatus = isRejected
    ? 'rejected'
    : isFinalApproved
      ? 'final_approved'
      : isApproved
        ? 'approved'
        : summary.status;

  return {
    id: batch.id,
    rawStatus: batch.status,
    batchNumber: batch.batch_number,
    note: batch.note || '',
    rejectionNote: batch.rejection_note || '',
    status: displayStatus,
    reconciliationStatus: backendReconciliationStatus || null,
    reconciliationNote: batch.reconciliation_ai_summary || batch.reconciliation_ai_note || '',
    isApproved,
    isFinalApproved,
    isRejected,
    isReady: isApiBatchReady(batch),
    updatedAt: batch.updated_at || batch.created_at,
    owner: batch.created_by_name || 'Hệ thống AI',
    approvedBy: batch.approved_by_name || null,
    chiefApprovedBy: batch.chief_approved_by_name || null,
    matchRate: summary.matchRate,
    checkedFields: summary.checkedFields,
    matchedFields: summary.matchedFields,
    mismatchFields: summary.mismatchFields,
    missingFields: missingDataFields,
    decision:
      summary.mismatchFields > 0
          ? 'Có chênh lệch trong dữ liệu AI đã trích xuất. Cần kiểm tra lại chứng từ.'
        : missingDataFields > 0
          ? 'Batch còn thiếu dữ liệu trích xuất. Cần kiểm tra lại chứng từ hoặc chờ AI đọc đầy đủ.'
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

export default function AuditTrail({ token, role }) {
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
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState('');

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

      let matchesStatus = true;
      if (statusFilter === 'all') {
        matchesStatus = true;
      } else if (statusFilter === 'approved') {
        matchesStatus = batch.status === 'approved' || batch.status === 'final_approved' || batch.isApproved || batch.isFinalApproved;
      } else {
        matchesStatus = batch.status === statusFilter;
      }

      const matchesOverviewGroup = matchesOverviewFilter(batch, overviewFilter);
      const matchesDateRange = isWithinDateRange(batch, overviewDateRange);
      const haystack = [
        batch.batchNumber,
        batch.note,
        batch.rejectionNote,
        batch.owner,
        ...DOC_TYPES.map((type) => batch.docs[type.key]?.filename || ''),
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

  const selectedBatch = filteredBatches.find((batch) => isSameBatchId(batch.id, selectedId)) || filteredBatches[0] || null;
  const summary = {
    total: filteredBatches.length,
    missing: filteredBatches.filter((batch) => batch.status === 'missing').length,
    matching: filteredBatches.filter((batch) => batch.status === 'matching').length,
    mismatch: filteredBatches.filter((batch) => batch.status === 'mismatch').length,
    matched: filteredBatches.filter((batch) => batch.status === 'matched').length,
    approved: filteredBatches.filter((batch) => batch.status === 'approved').length,
  };
  const documentComparisons = selectedBatch?.comparisons.filter((item) => !isLineItemComparison(item)) || [];
  const lineItems = selectedBatch?.lineItems || [];
  const modalBatch = batches.find((batch) => isSameBatchId(batch.id, modalBatchId)) || null;
  const modalComparisons = modalBatch?.comparisons.filter((item) => !isLineItemComparison(item)) || [];
  const modalLineItems = modalBatch?.lineItems || [];

  const requestApproveBatch = (batch, options = {}) => {
    // Kiểm tra điều kiện theo role
    const isChiefAccountant = role === 'chief_accountant';
    
    // Kế toán trưởng: có thể duyệt batch 'approved' (đã qua KTV) hoặc 'matched' (duyệt trực tiếp)
    // Kế toán viên: chỉ duyệt batch 'matched'
    const canApprove = !batch?.rejectionNote && (
      isChiefAccountant 
        ? (batch.status === 'approved' || batch.status === 'matched')
        : batch.status === 'matched'
    );
    
    if (!batch?.id || !canApprove || approvingBatchIds.includes(batch.id)) return;
    setApproveConfirm({ batch, options });
  };

  const handleApproveBatch = async () => {
    const batch = approveConfirm?.batch;
    const options = approveConfirm?.options || {};
    if (!batch?.id || approvingBatchIds.includes(batch.id)) return;

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
      if (!options.keepModalOpen) {
        setModalBatchId(null);
      }
      setApproveConfirm(null);
    } catch (err) {
      setError(err.message || 'Không thể duyệt batch này. Vui lòng thử lại.');
    } finally {
      setApprovingBatchIds((prev) => prev.filter((id) => !isSameBatchId(id, batch.id)));
    }
  };

  const handleOpenUploadedFile = async (file) => {
    if (!file?.file_url || file.status !== 'completed') return;

    const previewTab = window.open('', '_blank');
    if (!previewTab) {
      alert('Trình duyệt đang chặn tab mới. Vui lòng cho phép pop-up để xem file.');
      return;
    }

    try {
      previewTab.document.title = file.filename;
      previewTab.document.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px;">Đang mở file...</p>';
      const blob = await fetchUploadFileBlob(token, file);
      const ext = getFileExt(file.filename);

      if (ext === 'xml') {
        const xmlText = await blob.text();
        previewTab.document.open();
        previewTab.document.write(buildXmlPreviewHtml(file.filename, xmlText));
        previewTab.document.close();
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      previewTab.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      previewTab.close();
      alert(err.message || 'Không thể mở file này. Vui lòng thử lại.');
    }
  };

  const handleUploadSupplement = (batch) => {
    if (!batch?.id) return;
    navigate(`/upload?batchId=${encodeURIComponent(batch.id)}&mode=supplement`);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Đang tải dữ liệu batch...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (!selectedBatch) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Chưa có batch nào đã đủ PO, Invoice và GRN. Các batch còn thiếu chứng từ vẫn nằm ở Hàng đợi xử lý.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Batch đối soát</h1>
          {overviewFilterLabel && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Đang xem nhóm: <span className="font-semibold text-slate-700 dark:text-slate-200">{overviewFilterLabel}</span>
            </p>
          )}
        </div>
        <button type="button" className="btn-primary self-start lg:self-auto">
          <FileSearch size={16} />
          Xuất báo cáo
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Tổng batch', summary.total, 'text-slate-900 dark:text-slate-100'],
          ['Thiếu dữ liệu', summary.missing, 'text-amber-700 dark:text-amber-300'],
          ['Khớp hoàn toàn', summary.matched, 'text-emerald-700 dark:text-emerald-300'],
          ['Lệch', summary.mismatch, 'text-rose-700 dark:text-rose-300'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo mã batch, note, người xử lý, tên file..."
              className="input-field pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="relative min-w-[220px]">
            <SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input-field appearance-none pl-9 pr-9"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="matched">Khớp hoàn toàn</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Đã từ chối</option>
              <option value="mismatch">Lệch</option>
              <option value="missing">Thiếu dữ liệu</option>
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Danh sách batch ({filteredBatches.length})</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Mỗi batch gồm 3 chứng từ để đối khớp.</p>
          </div>

          <div className="space-y-3">
            {paginatedBatches.map((batch) => {
              const isSelected = isSameBatchId(batch.id, selectedBatch.id);
              const completion = getCompletion(batch);
              const meta = STATUS_META[batch.status];
              const hasMissingData = batch.status === 'missing';
              // Kế toán viên: duyệt batch matched
              // Kế toán trưởng: duyệt batch approved hoặc matched
              const canApprove = !batch.rejectionNote && (
                role === 'chief_accountant' 
                  ? (batch.status === 'approved' || batch.status === 'matched')
                  : batch.status === 'matched'
              );
              const isApproving = approvingBatchIds.some((id) => isSameBatchId(id, batch.id));

              return (
                <div
                  key={batch.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(batch.id);
                    setModalBatchId(batch.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(batch.id);
                      setModalBatchId(batch.id);
                    }
                  }}
                  className={`relative block w-full rounded-xl border bg-white p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-900 ${
                    hasMissingData
                      ? 'z-10 border-amber-300 bg-amber-50/60 shadow-[0_14px_36px_rgba(146,64,14,0.16)] ring-1 ring-amber-100 dark:border-amber-700 dark:bg-amber-950/15 dark:ring-amber-900/60'
                      : isSelected
                      ? 'z-10 border-brand-300 shadow-[0_12px_30px_rgba(0,55,112,0.14)] ring-1 ring-brand-100 dark:border-brand-700 dark:ring-brand-900'
                      : 'border-slate-200 shadow-sm hover:z-10 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_18px_42px_rgba(0,55,112,0.18)] dark:border-slate-800 dark:hover:border-brand-800'
                  }`}
                >
                  <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-r-full ${meta.rail}`} />
                  <div className="pl-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{batch.batchNumber}</p>
                          {role !== 'chief_accountant' && <StatusBadge status={batch.status} />}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cập nhật: {batch.updatedAt}</p>
                        {batch.note && (
                          <p
                            className="mt-1 max-w-xl truncate text-xs font-semibold text-slate-700 dark:text-slate-300"
                            title={batch.note}
                          >
                            Note: {batch.note}
                          </p>
                        )}
                        {batch.rejectionNote && (
                          <p
                            className="mt-1 max-w-xl truncate text-xs font-semibold text-rose-700 dark:text-rose-300"
                            title={batch.rejectionNote}
                          >
                            Lý do từ chối: {batch.rejectionNote}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                        <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{batch.matchRate}%</p>
                        <p className="text-[11px] text-slate-400">match</p>
                        {canApprove && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestApproveBatch(batch);
                            }}
                            disabled={isApproving}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Duyệt batch"
                            aria-label={`Duyệt batch ${batch.batchNumber}`}
                          >
                            {isApproving ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={13} />
                            )}
                            Duyệt
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {DOC_TYPES.map((type) => {
                        const doc = batch.docs[type.key];
                        return (
                          <span
                            key={type.key}
                            className={`min-w-0 rounded-lg border px-2.5 py-2 text-xs ${
                              doc?.missing
                                ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                            }`}
                          >
                            <span className="block font-bold">{type.short}</span>
                            <span className="mt-0.5 block truncate">{doc?.missing ? 'Chưa có' : doc.filename}</span>
                          </span>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <span>{completion}/3 chứng từ</span>
                      <span className="shrink-0 tabular-nums">{batch.mismatchFields} lệch · {batch.missingFields} thiếu dữ liệu</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredBatches.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 px-5 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Không có batch phù hợp với bộ lọc hiện tại.
              </div>
            )}
          </div>

          {filteredBatches.length > BATCHES_PER_PAGE && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Hiển thị {batchStartIndex}-{batchEndIndex} / {filteredBatches.length} batch
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBatchPage((page) => Math.max(1, page - 1))}
                  disabled={safeBatchPage === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Trước
                </button>
                <span className="min-w-[88px] text-center font-semibold text-slate-700 dark:text-slate-200">
                  Trang {safeBatchPage}/{totalBatchPages}
                </span>
                <button
                  type="button"
                  onClick={() => setBatchPage((page) => Math.min(totalBatchPages, page + 1))}
                  disabled={safeBatchPage === totalBatchPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{selectedBatch.batchNumber}</h2>
                  {role !== 'chief_accountant' && <StatusBadge status={selectedBatch.status} />}
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Xử lý bởi {selectedBatch.owner} · Cập nhật {selectedBatch.updatedAt}
                </p>
              </div>
              <button type="button" className="btn-secondary self-start">
                <Eye size={16} />
                Xem hồ sơ
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase text-slate-400">Kết luận</p>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-800 dark:text-slate-200">{selectedBatch.decision}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DOC_TYPES.map((type) => {
              const list = selectedBatch.docList?.[type.key] || [];
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

          <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bảng đối chiếu thông tin</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Hiện rõ từng trường AI đã lấy ra từ 3 chứng từ và kết quả so khớp.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
                  {documentComparisons.length > 0 ? (
                    documentComparisons.map((item) => (
                      <tr key={`${selectedBatch.id}-${item.field}`} className="table-row-hover">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{item.field}</td>
                        <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.po, [item.po, item.invoice, item.grn])}`}>{item.po}</td>
                        <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.invoice, [item.po, item.invoice, item.grn])}`}>{item.invoice}</td>
                        <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.grn, [item.po, item.invoice, item.grn])}`}>{item.grn}</td>
                        <td className="min-w-[130px] whitespace-nowrap px-4 py-3"><ResultPill severity={item.severity} text={item.result} /></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        Chưa có dữ liệu đối chiếu. Hãy bổ sung đủ 3 chứng từ để hệ thống bắt đầu so khớp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Chi tiết hàng hóa</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Mỗi dòng là một mã hàng trong PO, Invoice và GRN để kiểm tra chủng loại, ĐVT, số lượng và giá.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Mã hàng / Tên hàng</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">ĐVT</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">SL PO</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">SL Invoice</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">SL GRN</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Giá PO</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Giá Invoice</th>
                    <th className="border-l border-dashed border-slate-300 px-4 py-3 text-right text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">Tiền PO</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Tiền Invoice</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Tiền GRN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lineItems.length > 0 ? (
                    lineItems.map((item) => (
                      <tr key={`${selectedBatch.id}-${item.sku}`} className="table-row-hover">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">{item.name || item.sku}</p>
                          <p className="mt-0.5 text-[11px] font-mono font-medium text-slate-400 dark:text-slate-500">{item.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.unit}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.poQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.poQty}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.invoiceQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.invoiceQty}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.grnQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.grnQty}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.priceSeverity, item.poPrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.poPrice}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.priceSeverity, item.invoicePrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.invoicePrice}</td>
                        <td className={`border-l border-dashed border-slate-300 px-4 py-3 text-right tabular-nums dark:border-slate-700 ${getComparisonCellClass(item.amountSeverity, item.poAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.poAmount}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.amountSeverity, item.invoiceAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.invoiceAmount}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${getComparisonCellClass(item.amountSeverity, item.grnAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.grnAmount}</td>
                        <td className="px-4 py-3"><ResultPill severity={item.severity} text={item.result} /></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        Chưa có dữ liệu hàng hóa. Khi đủ chứng từ, hệ thống sẽ tách từng dòng hàng để đối chiếu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {modalBatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-detail-title"
          onClick={() => setModalBatchId(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-[1360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(0,55,112,0.24)] dark:border-slate-800 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="batch-detail-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {modalBatch.batchNumber}
                  </h2>
                  {role !== 'chief_accountant' && <StatusBadge status={modalBatch.status} />}
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Xử lý bởi {modalBatch.owner} · Cập nhật {modalBatch.updatedAt}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {role !== 'chief_accountant' && modalBatch.status === 'rejected' && (
                  <button
                    type="button"
                    onClick={() => handleUploadSupplement(modalBatch)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    title="Upload bổ sung vào batch này"
                    aria-label={`Upload bổ sung vào batch ${modalBatch.batchNumber}`}
                  >
                    <UploadCloud size={14} />
                    Upload bổ sung
                  </button>
                )}
                {!modalBatch.rejectionNote && modalBatch.status === 'matched' && (
                  <button
                    type="button"
                    onClick={() => requestApproveBatch(modalBatch, { keepModalOpen: true })}
                    disabled={approvingBatchIds.some((id) => isSameBatchId(id, modalBatch.id))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Duyệt batch"
                    aria-label={`Duyệt batch ${modalBatch.batchNumber}`}
                  >
                    {approvingBatchIds.some((id) => isSameBatchId(id, modalBatch.id)) ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Duyệt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalBatchId(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                  title="Đóng"
                  aria-label="Đóng chi tiết batch"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(92vh-82px)] space-y-5 overflow-y-auto p-5">
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

              <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
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
                      {modalLineItems.length > 0 ? (
                        modalLineItems.map((item) => (
                          <tr key={`${modalBatch.id}-modal-${item.sku}`} className="table-row-hover">
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
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.grnPrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.grnPrice}</td>
                            <td className={`border-l border-dashed border-slate-300 px-2.5 py-2.5 text-right tabular-nums dark:border-slate-700 whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.poAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.poAmount}</td>
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.invoiceAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.invoiceAmount}</td>
                            <td className={`px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.grnAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.grnAmount}</td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap"><ResultPill severity={item.severity} text={item.result} /></td>
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
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bảng đối chiếu thông tin</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
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
                      {modalComparisons.map((item) => (
                        <tr key={`${modalBatch.id}-modal-${item.field}`} className="table-row-hover">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{item.field}</td>
                          <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.po, [item.po, item.invoice, item.grn])}`}>{item.po}</td>
                          <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.invoice, [item.po, item.invoice, item.grn])}`}>{item.invoice}</td>
                          <td className={`px-4 py-3 tabular-nums ${getComparisonCellClass(item.severity, item.grn, [item.po, item.invoice, item.grn])}`}>{item.grn}</td>
                          <td className="min-w-[130px] whitespace-nowrap px-4 py-3"><ResultPill severity={item.severity} text={item.result} /></td>
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

      <ConfirmDialog
        open={Boolean(approveConfirm)}
        tone="success"
        title={role === 'chief_accountant' ? 'Xác nhận duyệt cuối' : 'Xác nhận duyệt batch'}
        description={
          approveConfirm
            ? `Bạn có chắc chắn muốn duyệt batch "${approveConfirm.batch.batchNumber}" không?`
            : ''
        }
        confirmLabel="Xác nhận duyệt"
        cancelLabel="Hủy"
        loading={Boolean(approveConfirm?.batch && approvingBatchIds.some((id) => isSameBatchId(id, approveConfirm.batch.id)))}
        onCancel={() => {
          if (approveConfirm?.batch && approvingBatchIds.some((id) => isSameBatchId(id, approveConfirm.batch.id))) return;
          setApproveConfirm(null);
        }}
        onConfirm={handleApproveBatch}
      />
    </div>
  );
}


