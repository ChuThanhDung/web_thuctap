import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Eye,
  FileSearch,
  FileText,
  PackageCheck,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from 'lucide-react';

const STATUS_META = {
  missing: {
    label: 'Thiếu chứng từ',
    tone: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    rail: 'bg-slate-400',
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
  mismatch: {
    label: 'Có chênh lệch',
    tone: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    rail: 'bg-rose-500',
  },
};

const DOC_TYPES = [
  { key: 'po', short: 'PO', label: 'Đơn đặt hàng', icon: ShoppingCart },
  { key: 'invoice', short: 'Invoice', label: 'Hóa đơn', icon: FileText },
  { key: 'grn', short: 'GRN', label: 'Phiếu nhập kho', icon: PackageCheck },
];

const SAMPLE_BATCHES = [
  {
    id: 'batch-08',
    batchNumber: 'BATCH_11_08_2026_08',
    status: 'matched',
    updatedAt: '2026-08-11 12:21:18',
    owner: 'Chu Thanh Dũng',
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

function getStatusIcon(status) {
  if (status === 'matched') return CheckCircle2;
  if (status === 'mismatch') return AlertTriangle;
  if (status === 'matching') return Clock3;
  return ClipboardList;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  const Icon = getStatusIcon(status);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
      <Icon size={14} />
      {meta.label}
    </span>
  );
}

function MatchMeter({ value }) {
  const barColor = value >= 98 ? 'bg-emerald-500' : value >= 85 ? 'bg-amber-500' : value > 0 ? 'bg-rose-500' : 'bg-slate-300';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tỉ lệ khớp</span>
        <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function DocumentCard({ type, doc }) {
  const Icon = type.icon;
  const visibleFields = Object.entries(doc?.fields || {}).filter(([label]) =>
    ['Số chứng từ', 'Ngày chứng từ'].includes(label)
  );

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
          <button type="button" className="btn-ghost h-8 w-8 rounded-lg p-0" title="Xem chứng từ gốc">
            <Eye size={16} />
          </button>
        )}
      </div>

      {!doc?.missing && (
        <>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-950/50">
            <span className="text-slate-500 dark:text-slate-400">OCR {doc.confidence}%</span>
            <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{doc.extractedAt}</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {visibleFields.map(([label, value]) => (
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

const LINE_ITEM_FIELDS = ['Mã hàng', 'Tên hàng', 'Đơn vị tính', 'Số lượng', 'Đơn giá', 'Thuế suất VAT'];

function isLineItemComparison(item) {
  return LINE_ITEM_FIELDS.some((fieldName) => item.field.includes(fieldName));
}

export default function AuditTrail() {
  const [selectedId, setSelectedId] = useState(SAMPLE_BATCHES[0].id);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBatches = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return SAMPLE_BATCHES.filter((batch) => {
      const matchesStatus = statusFilter === 'all' || batch.status === statusFilter;
      const haystack = [
        batch.batchNumber,
        batch.owner,
        ...DOC_TYPES.map((type) => batch.docs[type.key]?.filename || ''),
      ].join(' ').toLowerCase();

      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [searchQuery, statusFilter]);

  const selectedBatch = filteredBatches.find((batch) => batch.id === selectedId) || filteredBatches[0] || SAMPLE_BATCHES[0];
  const summary = {
    total: SAMPLE_BATCHES.length,
    missing: SAMPLE_BATCHES.filter((batch) => batch.status === 'missing').length,
    matching: SAMPLE_BATCHES.filter((batch) => batch.status === 'matching').length,
    mismatch: SAMPLE_BATCHES.filter((batch) => batch.status === 'mismatch').length,
    matched: SAMPLE_BATCHES.filter((batch) => batch.status === 'matched').length,
  };
  const documentComparisons = selectedBatch.comparisons.filter((item) => !isLineItemComparison(item));
  const lineItems = selectedBatch.lineItems || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Batch đối soát</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Theo dõi từng bộ PO, Invoice, GRN và xem hệ thống đã so khớp trường nào, lệch ở đâu.
          </p>
        </div>
        <button type="button" className="btn-primary self-start lg:self-auto">
          <FileSearch size={16} />
          Xuất báo cáo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Tổng batch', summary.total, 'text-slate-900 dark:text-slate-100'],
          ['Thiếu chứng từ', summary.missing, 'text-slate-700 dark:text-slate-200'],
          ['Đang đối soát', summary.matching, 'text-brand-700 dark:text-brand-300'],
          ['Khớp hoàn toàn', summary.matched, 'text-emerald-700 dark:text-emerald-300'],
          ['Có chênh lệch', summary.mismatch, 'text-rose-700 dark:text-rose-300'],
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
              placeholder="Tìm theo mã batch, người xử lý, tên file..."
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
              <option value="missing">Thiếu chứng từ</option>
              <option value="matching">Đang đối soát</option>
              <option value="matched">Khớp hoàn toàn</option>
              <option value="mismatch">Có chênh lệch</option>
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.45fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Danh sách batch ({filteredBatches.length})</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Mỗi batch gồm 3 chứng từ để đối khớp.</p>
          </div>

          <div className="space-y-3">
            {filteredBatches.map((batch) => {
              const isSelected = batch.id === selectedBatch.id;
              const completion = getCompletion(batch);
              const meta = STATUS_META[batch.status];

              return (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => setSelectedId(batch.id)}
                  className={`relative block w-full rounded-xl border bg-white p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-900 ${
                    isSelected
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
                          <StatusBadge status={batch.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cập nhật: {batch.updatedAt}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{batch.matchRate}%</p>
                        <p className="text-[11px] text-slate-400">match</p>
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
                </button>
              );
            })}

            {filteredBatches.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 px-5 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Không có batch phù hợp với bộ lọc hiện tại.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{selectedBatch.batchNumber}</h2>
                  <StatusBadge status={selectedBatch.status} />
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

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['Đã đối chiếu', selectedBatch.checkedFields, 'text-slate-900 dark:text-slate-100'],
                  ['Khớp', selectedBatch.matchedFields, 'text-emerald-700 dark:text-emerald-300'],
                  ['Lệch', selectedBatch.mismatchFields, 'text-rose-700 dark:text-rose-300'],
                  ['Thiếu', selectedBatch.missingFields, 'text-amber-700 dark:text-amber-300'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <MatchMeter value={selectedBatch.matchRate} />
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase text-slate-400">Kết luận</p>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-800 dark:text-slate-200">{selectedBatch.decision}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {DOC_TYPES.map((type) => (
              <DocumentCard key={type.key} type={type} doc={selectedBatch.docs[type.key]} />
            ))}
          </div>

          {selectedBatch.issues.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Điểm cần kiểm tra</h3>
                  <div className="mt-3 space-y-2">
                    {selectedBatch.issues.map((issue) => (
                      <p key={issue} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                        {issue}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                        <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{item.po}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{item.invoice}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{item.grn}</td>
                        <td className="px-4 py-3"><ResultPill severity={item.severity} text={item.result} /></td>
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
                Mỗi dòng là một mã hàng trong PO, Invoice và GRN để kiểm tra chủng loại, ĐVT, số lượng, giá và VAT.
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
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">VAT</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400">Thành tiền</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lineItems.length > 0 ? (
                    lineItems.map((item) => (
                      <tr key={`${selectedBatch.id}-${item.sku}`} className="table-row-hover">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{item.sku}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.name}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.unit}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.poQty}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.invoiceQty}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.grnQty}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.poPrice}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.invoicePrice}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.vat}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.amount}</td>
                        <td className="px-4 py-3"><ResultPill severity={item.severity} text={item.result} /></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
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
    </div>
  );
}
