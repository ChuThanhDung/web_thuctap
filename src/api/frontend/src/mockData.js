// ═══════════════════════════════════════════════════════
// Mock Data — Đối soát Hóa đơn & Chứng từ Kế toán
// Dữ liệu mẫu đủ các trạng thái: khớp, chênh lệch SL,
// chênh lệch giá, chênh lệch thuế, confidence thấp
// ═══════════════════════════════════════════════════════

export const PARTNERS = [
  'Công ty TNHH Vận tải Phương Nam',
  'CTCP Dịch vụ Ô tô Sài Gòn',
  'Công ty TNHH Phụ tùng Hoàng Long',
  'CTCP Nhiên liệu Đông Á',
  'Công ty TNHH Bảo hiểm Toàn Cầu',
  'CTCP Công nghệ AutoTech',
  'Công ty TNHH Lốp xe Miền Nam',
  'CTCP Dầu nhớt Việt Hàn',
];

export const STATUS_MAP = {
  matched: { label: 'Khớp hoàn toàn', color: 'emerald', dotColor: 'bg-emerald-500' },
  minor_diff: { label: 'Chênh lệch nhẹ', color: 'amber', dotColor: 'bg-amber-500' },
  major_diff: { label: 'Cần xem xét', color: 'rose', dotColor: 'bg-rose-500' },
  low_confidence: { label: 'Confidence thấp', color: 'slate', dotColor: 'bg-slate-400' },
};

// ── Helper: format VND ──
export function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ── Reconciliation Cases (danh sách chính) ──
export const reconciliationCases = [
  {
    id: 'RC-001',
    invoiceNumber: 'HD-2024-00156',
    poNumber: 'PO-2024-0089',
    grnNumber: 'PN-2024-0134',
    partner: 'Công ty TNHH Phụ tùng Hoàng Long',
    date: '2024-03-15',
    totalAmount: 125000000,
    status: 'matched',
    riskLevel: 'low',
    confidence: 0.98,
    aiNote: 'Tất cả các trường khớp hoàn toàn giữa 3 chứng từ.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-002',
    invoiceNumber: 'HD-2024-00157',
    poNumber: 'PO-2024-0090',
    grnNumber: 'PN-2024-0135',
    partner: 'CTCP Nhiên liệu Đông Á',
    date: '2024-03-15',
    totalAmount: 87500000,
    status: 'minor_diff',
    riskLevel: 'medium',
    confidence: 0.92,
    aiNote: 'Chênh lệch giá đơn vị xăng RON95 (500đ/lít) — trong ngưỡng cho phép 2%.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-003',
    invoiceNumber: 'HD-2024-00158',
    poNumber: 'PO-2024-0091',
    grnNumber: 'PN-2024-0136',
    partner: 'Công ty TNHH Vận tải Phương Nam',
    date: '2024-03-14',
    totalAmount: 342000000,
    status: 'major_diff',
    riskLevel: 'high',
    confidence: 0.85,
    aiNote: 'Số lượng trên hóa đơn (120) cao hơn phiếu nhập (100) — chênh 20 đơn vị, tương đương 50.000.000đ. Cần xác minh lại với kho.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-004',
    invoiceNumber: 'HD-2024-00159',
    poNumber: 'PO-2024-0092',
    grnNumber: 'PN-2024-0137',
    partner: 'CTCP Dịch vụ Ô tô Sài Gòn',
    date: '2024-03-14',
    totalAmount: 56300000,
    status: 'matched',
    riskLevel: 'low',
    confidence: 0.99,
    aiNote: 'Khớp hoàn toàn. Đã xác minh mã hàng, số lượng, đơn giá và thuế VAT.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-005',
    invoiceNumber: 'HD-2024-00160',
    poNumber: 'PO-2024-0093',
    grnNumber: 'PN-2024-0138',
    partner: 'Công ty TNHH Bảo hiểm Toàn Cầu',
    date: '2024-03-13',
    totalAmount: 198000000,
    status: 'low_confidence',
    riskLevel: 'high',
    confidence: 0.45,
    aiNote: 'Hóa đơn scan mờ — không đọc được số lượng hàng dòng 3 và 4. Cần nhập tay hoặc scan lại.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-006',
    invoiceNumber: 'HD-2024-00161',
    poNumber: 'PO-2024-0094',
    grnNumber: 'PN-2024-0139',
    partner: 'CTCP Công nghệ AutoTech',
    date: '2024-03-13',
    totalAmount: 73200000,
    status: 'minor_diff',
    riskLevel: 'low',
    confidence: 0.94,
    aiNote: 'Thuế VAT trên hóa đơn (10%) khác PO (8%) — chênh lệch 1.464.000đ. Có thể do thay đổi chính sách thuế.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-007',
    invoiceNumber: 'HD-2024-00162',
    poNumber: 'PO-2024-0095',
    grnNumber: 'PN-2024-0140',
    partner: 'Công ty TNHH Lốp xe Miền Nam',
    date: '2024-03-12',
    totalAmount: 415000000,
    status: 'major_diff',
    riskLevel: 'high',
    confidence: 0.78,
    aiNote: 'Nhiều dòng hàng chênh lệch: (1) Số lượng lốp 205/55R16 chênh 30 bộ, (2) Đơn giá lốp 265/70R17 chênh 150.000đ/bộ. Tổng chênh lệch ~62.000.000đ.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-008',
    invoiceNumber: 'HD-2024-00163',
    poNumber: 'PO-2024-0096',
    grnNumber: 'PN-2024-0141',
    partner: 'CTCP Dầu nhớt Việt Hàn',
    date: '2024-03-12',
    totalAmount: 29800000,
    status: 'matched',
    riskLevel: 'low',
    confidence: 0.97,
    aiNote: 'Khớp hoàn toàn. Đơn hàng nhỏ, 2 dòng sản phẩm.',
    processedBy: 'Nguyễn Thị Lan',
    processedAt: '2024-03-13T09:15:00',
  },
  {
    id: 'RC-009',
    invoiceNumber: 'HD-2024-00164',
    poNumber: 'PO-2024-0097',
    grnNumber: 'PN-2024-0142',
    partner: 'Công ty TNHH Vận tải Phương Nam',
    date: '2024-03-11',
    totalAmount: 156700000,
    status: 'matched',
    riskLevel: 'low',
    confidence: 0.96,
    aiNote: 'Khớp hoàn toàn.',
    processedBy: 'Nguyễn Thị Lan',
    processedAt: '2024-03-12T14:30:00',
  },
  {
    id: 'RC-010',
    invoiceNumber: 'HD-2024-00165',
    poNumber: 'PO-2024-0098',
    grnNumber: 'PN-2024-0143',
    partner: 'CTCP Nhiên liệu Đông Á',
    date: '2024-03-11',
    totalAmount: 92100000,
    status: 'low_confidence',
    riskLevel: 'high',
    confidence: 0.52,
    aiNote: 'Thiếu phiếu nhập kho tương ứng. Chỉ có hóa đơn và PO. Cần bổ sung phiếu nhập hoặc xác nhận hàng chưa về.',
    processedBy: null,
    processedAt: null,
  },
  {
    id: 'RC-011',
    invoiceNumber: 'HD-2024-00166',
    poNumber: 'PO-2024-0099',
    grnNumber: 'PN-2024-0144',
    partner: 'CTCP Dịch vụ Ô tô Sài Gòn',
    date: '2024-03-10',
    totalAmount: 44500000,
    status: 'matched',
    riskLevel: 'low',
    confidence: 0.99,
    aiNote: 'Khớp hoàn toàn.',
    processedBy: 'Trần Văn Minh',
    processedAt: '2024-03-11T08:45:00',
  },
  {
    id: 'RC-012',
    invoiceNumber: 'HD-2024-00167',
    poNumber: 'PO-2024-0100',
    grnNumber: 'PN-2024-0145',
    partner: 'Công ty TNHH Phụ tùng Hoàng Long',
    date: '2024-03-10',
    totalAmount: 267800000,
    status: 'minor_diff',
    riskLevel: 'medium',
    confidence: 0.91,
    aiNote: 'Chênh lệch nhỏ về đơn giá má phanh (2.000đ/bộ) — trong ngưỡng cho phép.',
    processedBy: null,
    processedAt: null,
  },
];

// ── Chi tiết một case (RC-003 — case chênh lệch số lượng) ──
export const caseDetailRC003 = {
  id: 'RC-003',
  invoiceNumber: 'HD-2024-00158',
  poNumber: 'PO-2024-0091',
  grnNumber: 'PN-2024-0136',
  partner: 'Công ty TNHH Vận tải Phương Nam',
  date: '2024-03-14',
  status: 'major_diff',
  riskLevel: 'high',
  overallConfidence: 0.85,

  // 3 nguồn dữ liệu — so sánh theo dòng hàng
  lineItems: [
    {
      rowId: 1,
      itemCode: 'PT-001',
      itemName: 'Lốp xe 205/55R16',
      invoice: { qty: 120, unitPrice: 2500000, taxRate: 10, confidence: 0.97 },
      po:      { qty: 120, unitPrice: 2500000, taxRate: 10, confidence: 0.99 },
      grn:     { qty: 100, unitPrice: 2500000, taxRate: 10, confidence: 0.95 },
      diffs: [
        {
          field: 'qty',
          type: 'quantity_mismatch',
          description: 'Số lượng trên hóa đơn (120) cao hơn phiếu nhập kho (100) — chênh 20 đơn vị, tương đương 50.000.000đ. PO ghi 120, khớp với hóa đơn. Có thể hàng chưa nhập hết hoặc đang trên đường vận chuyển.',
          severity: 'high',
        },
      ],
    },
    {
      rowId: 2,
      itemCode: 'PT-002',
      itemName: 'Dầu động cơ 5W-30 (thùng 20L)',
      invoice: { qty: 50, unitPrice: 1800000, taxRate: 10, confidence: 0.98 },
      po:      { qty: 50, unitPrice: 1800000, taxRate: 10, confidence: 0.99 },
      grn:     { qty: 50, unitPrice: 1800000, taxRate: 10, confidence: 0.97 },
      diffs: [],
    },
    {
      rowId: 3,
      itemCode: 'PT-003',
      itemName: 'Bộ lọc gió cabin',
      invoice: { qty: 200, unitPrice: 350000, taxRate: 10, confidence: 0.96 },
      po:      { qty: 200, unitPrice: 350000, taxRate: 10, confidence: 0.99 },
      grn:     { qty: 200, unitPrice: 350000, taxRate: 10, confidence: 0.94 },
      diffs: [],
    },
  ],

  // Tổng hợp
  totals: {
    invoice: { subtotal: 460000000, tax: 46000000, total: 506000000, confidence: 0.97 },
    po:      { subtotal: 460000000, tax: 46000000, total: 506000000, confidence: 0.99 },
    grn:     { subtotal: 410000000, tax: 41000000, total: 451000000, confidence: 0.95 },
  },

  totalDiff: {
    description: 'Tổng chênh lệch giữa Hóa đơn và Phiếu nhập kho: 55.000.000đ (10.87%). Nguyên nhân chính: chênh lệch số lượng lốp xe dòng 1.',
    amount: 55000000,
    percentage: 10.87,
  },
};

// ── Chi tiết case RC-007 — case chênh lệch nhiều dòng ──
export const caseDetailRC007 = {
  id: 'RC-007',
  invoiceNumber: 'HD-2024-00162',
  poNumber: 'PO-2024-0095',
  grnNumber: 'PN-2024-0140',
  partner: 'Công ty TNHH Lốp xe Miền Nam',
  date: '2024-03-12',
  status: 'major_diff',
  riskLevel: 'high',
  overallConfidence: 0.78,

  lineItems: [
    {
      rowId: 1,
      itemCode: 'LX-101',
      itemName: 'Lốp 205/55R16 Michelin',
      invoice: { qty: 80, unitPrice: 3200000, taxRate: 10, confidence: 0.95 },
      po:      { qty: 80, unitPrice: 3200000, taxRate: 10, confidence: 0.99 },
      grn:     { qty: 50, unitPrice: 3200000, taxRate: 10, confidence: 0.88 },
      diffs: [
        {
          field: 'qty',
          type: 'quantity_mismatch',
          description: 'Số lượng nhập kho (50) ít hơn đơn hàng (80) — chênh 30 bộ, tương đương 96.000.000đ.',
          severity: 'high',
        },
      ],
    },
    {
      rowId: 2,
      itemCode: 'LX-205',
      itemName: 'Lốp 265/70R17 Bridgestone',
      invoice: { qty: 40, unitPrice: 5500000, taxRate: 10, confidence: 0.93 },
      po:      { qty: 40, unitPrice: 5350000, taxRate: 10, confidence: 0.99 },
      grn:     { qty: 40, unitPrice: 5350000, taxRate: 10, confidence: 0.91 },
      diffs: [
        {
          field: 'unitPrice',
          type: 'price_mismatch',
          description: 'Đơn giá trên hóa đơn (5.500.000đ) cao hơn PO và phiếu nhập (5.350.000đ) — chênh 150.000đ/bộ × 40 = 6.000.000đ.',
          severity: 'medium',
        },
      ],
    },
    {
      rowId: 3,
      itemCode: 'LX-310',
      itemName: 'Săm xe 205/55R16',
      invoice: { qty: 80, unitPrice: 450000, taxRate: 10, confidence: 0.60 },
      po:      { qty: 80, unitPrice: 450000, taxRate: 10, confidence: 0.99 },
      grn:     { qty: 80, unitPrice: 450000, taxRate: 10, confidence: 0.55 },
      diffs: [
        {
          field: 'confidence',
          type: 'low_confidence',
          description: 'Confidence thấp trên hóa đơn và phiếu nhập — ảnh scan không rõ, cần xác minh lại số liệu.',
          severity: 'low',
        },
      ],
    },
  ],

  totals: {
    invoice: { subtotal: 512000000, tax: 51200000, total: 563200000, confidence: 0.90 },
    po:      { subtotal: 506000000, tax: 50600000, total: 556600000, confidence: 0.99 },
    grn:     { subtotal: 389000000, tax: 38900000, total: 427900000, confidence: 0.82 },
  },

  totalDiff: {
    description: 'Tổng chênh lệch giữa Hóa đơn và Phiếu nhập kho: 135.300.000đ (24.03%). Gồm chênh lệch số lượng và đơn giá trên nhiều dòng.',
    amount: 135300000,
    percentage: 24.03,
  },
};

// ── Case detail lookup ──
export const caseDetails = {
  'RC-003': caseDetailRC003,
  'RC-007': caseDetailRC007,
};

// ── Dashboard stats ──
export const dashboardStats = {
  totalProcessed: 847,
  totalPending: 38,
  awaitingEscalation: 5,
  totalValueProcessed: 12450000000,
  totalValuePending: 1890000000,
  automationRate: 72.4,
  humanOverrideRate: 8.3,
  averageProcessingTime: '2.4 phút',
};

// ── Escalated cases ──
export const escalatedCases = [
  {
    id: 'RC-003',
    invoiceNumber: 'HD-2024-00158',
    partner: 'Công ty TNHH Vận tải Phương Nam',
    totalAmount: 342000000,
    reason: 'Chênh lệch số lượng 20 đơn vị (16.7%), vượt ngưỡng 5%',
    escalatedBy: 'Nguyễn Thị Lan',
    escalatedAt: '2024-03-14T16:30:00',
    status: 'major_diff',
  },
  {
    id: 'RC-007',
    invoiceNumber: 'HD-2024-00162',
    partner: 'Công ty TNHH Lốp xe Miền Nam',
    totalAmount: 415000000,
    reason: 'Nhiều dòng chênh lệch, tổng sai biệt 62.000.000đ (14.9%)',
    escalatedBy: 'Hệ thống AI',
    escalatedAt: '2024-03-12T10:15:00',
    status: 'major_diff',
  },
  {
    id: 'RC-005',
    invoiceNumber: 'HD-2024-00160',
    partner: 'Công ty TNHH Bảo hiểm Toàn Cầu',
    totalAmount: 198000000,
    reason: 'Confidence thấp (45%) — hóa đơn scan mờ, không đọc được 2 dòng hàng',
    escalatedBy: 'Hệ thống AI',
    escalatedAt: '2024-03-13T08:00:00',
    status: 'low_confidence',
  },
  {
    id: 'RC-010',
    invoiceNumber: 'HD-2024-00165',
    partner: 'CTCP Nhiên liệu Đông Á',
    totalAmount: 92100000,
    reason: 'Thiếu phiếu nhập kho — không thể đối soát 3 bên',
    escalatedBy: 'Hệ thống AI',
    escalatedAt: '2024-03-11T11:45:00',
    status: 'low_confidence',
  },
  {
    id: 'RC-012',
    invoiceNumber: 'HD-2024-00167',
    partner: 'Công ty TNHH Phụ tùng Hoàng Long',
    totalAmount: 267800000,
    reason: 'Giá trị lớn (>200 triệu), cần duyệt cấp trên theo quy trình',
    escalatedBy: 'Nguyễn Thị Lan',
    escalatedAt: '2024-03-10T15:20:00',
    status: 'minor_diff',
  },
];

// ── Automation trend data (cho biểu đồ) ──
export const automationTrend = [
  { month: 'T10/23', autoRate: 58, overrideRate: 15 },
  { month: 'T11/23', autoRate: 62, overrideRate: 13 },
  { month: 'T12/23', autoRate: 65, overrideRate: 12 },
  { month: 'T01/24', autoRate: 68, overrideRate: 10 },
  { month: 'T02/24', autoRate: 70, overrideRate: 9 },
  { month: 'T03/24', autoRate: 72.4, overrideRate: 8.3 },
];

// ── Audit trail ──
export const auditTrailData = [
  {
    id: 'AT-001',
    timestamp: '2024-03-15T10:23:00',
    user: 'Nguyễn Thị Lan',
    action: 'Duyệt',
    target: 'HD-2024-00156 (RC-001)',
    detail: 'Duyệt hóa đơn khớp hoàn toàn',
    ipAddress: '192.168.1.45',
  },
  {
    id: 'AT-002',
    timestamp: '2024-03-15T10:25:00',
    user: 'Nguyễn Thị Lan',
    action: 'Duyệt hàng loạt',
    target: '3 hóa đơn (RC-004, RC-008, RC-009)',
    detail: 'Duyệt hàng loạt các case khớp hoàn toàn',
    ipAddress: '192.168.1.45',
  },
  {
    id: 'AT-003',
    timestamp: '2024-03-15T10:32:00',
    user: 'Nguyễn Thị Lan',
    action: 'Escalate',
    target: 'HD-2024-00158 (RC-003)',
    detail: 'Đẩy lên kế toán trưởng — chênh lệch vượt ngưỡng',
    ipAddress: '192.168.1.45',
  },
  {
    id: 'AT-004',
    timestamp: '2024-03-15T11:00:00',
    user: 'Trần Văn Minh',
    action: 'Từ chối',
    target: 'HD-2024-00162 (RC-007)',
    detail: 'Từ chối — yêu cầu nhà cung cấp xuất lại hóa đơn đúng đơn giá PO',
    ipAddress: '192.168.1.52',
  },
  {
    id: 'AT-005',
    timestamp: '2024-03-14T15:45:00',
    user: 'Hệ thống AI',
    action: 'Auto-match',
    target: 'HD-2024-00159 (RC-004)',
    detail: 'Tự động đối soát — confidence 99%, tất cả trường khớp',
    ipAddress: '—',
  },
  {
    id: 'AT-006',
    timestamp: '2024-03-14T16:00:00',
    user: 'Hệ thống AI',
    action: 'Cảnh báo',
    target: 'HD-2024-00160 (RC-005)',
    detail: 'Confidence thấp 45% — đánh dấu cần xem xét thủ công',
    ipAddress: '—',
  },
  {
    id: 'AT-007',
    timestamp: '2024-03-14T09:30:00',
    user: 'Admin',
    action: 'Cấu hình',
    target: 'Ngưỡng chênh lệch',
    detail: 'Cập nhật ngưỡng cho phép từ 3% lên 5% cho nhóm nhiên liệu',
    ipAddress: '192.168.1.10',
  },
];

// ── Upload queue ──
export const uploadQueue = [
  { id: 'UQ-001', filename: 'HD_PhungNam_T3_001.pdf', size: '2.4 MB', uploadedAt: '2024-03-15T08:00:00', status: 'processing', progress: 75 },
  { id: 'UQ-002', filename: 'HD_DongA_T3_lot2.pdf', size: '1.8 MB', uploadedAt: '2024-03-15T08:02:00', status: 'queued', progress: 0 },
  { id: 'UQ-003', filename: 'PO_AutoTech_0094.xlsx', size: '156 KB', uploadedAt: '2024-03-15T07:55:00', status: 'completed', progress: 100 },
  { id: 'UQ-004', filename: 'PN_LopXe_MN_0140.pdf', size: '3.1 MB', uploadedAt: '2024-03-15T07:50:00', status: 'completed', progress: 100 },
  { id: 'UQ-005', filename: 'HD_BaoHiem_TC_multi.zip', size: '12.6 MB', uploadedAt: '2024-03-15T08:05:00', status: 'error', progress: 30, error: 'File nén chứa định dạng không hỗ trợ (.docx)' },
];

// ── Threshold config ──
export const thresholdConfig = [
  { id: 'TH-001', category: 'Phụ tùng ô tô', percentThreshold: 3, absoluteThreshold: 5000000, lastUpdated: '2024-02-01', updatedBy: 'Admin' },
  { id: 'TH-002', category: 'Nhiên liệu', percentThreshold: 5, absoluteThreshold: 10000000, lastUpdated: '2024-03-14', updatedBy: 'Admin' },
  { id: 'TH-003', category: 'Bảo hiểm', percentThreshold: 1, absoluteThreshold: 2000000, lastUpdated: '2024-01-15', updatedBy: 'Admin' },
  { id: 'TH-004', category: 'Dịch vụ sửa chữa', percentThreshold: 5, absoluteThreshold: 8000000, lastUpdated: '2024-02-20', updatedBy: 'Admin' },
  { id: 'TH-005', category: 'Công nghệ / Phần mềm', percentThreshold: 2, absoluteThreshold: 3000000, lastUpdated: '2024-01-10', updatedBy: 'Admin' },
  { id: 'TH-006', category: 'Mặc định (tất cả)', percentThreshold: 3, absoluteThreshold: 5000000, lastUpdated: '2024-01-01', updatedBy: 'Admin' },
];
