import { vi } from '../i18n/vi.js';

/**
 * Hệ trạng thái dùng chung cho badge, biểu đồ, bộ lọc và báo cáo.
 *
 * Hai nhóm tách bạch:
 *  - Đối soát (do AI/hệ thống): processing, missing_docs, matched, mismatch
 *  - Duyệt (do con người):      pending_accountant, pending_chief, approved, rejected
 *
 * Nguồn sự thật cho "khớp / chênh lệch" là `reconciliation_status` backend trả về, không tính lại ở frontend.
 * (Đo trên bộ dữ liệu mẫu: phép tính cũ ở frontend báo sai 2/4 bộ khớp là "thiếu dữ liệu".)
 */

export const RECONCILIATION_STATUSES = ['processing', 'missing_docs', 'matched', 'mismatch'];
export const APPROVAL_STATUSES = ['pending_accountant', 'pending_chief', 'approved', 'rejected'];

// `icon` là tên icon lucide, được ánh xạ sang component ở src/ui/StatusBadge.jsx (giữ module này thuần dữ liệu).
const RECONCILIATION_META = {
  processing: { tone: 'info', icon: 'Loader2' },
  missing_docs: { tone: 'warning', icon: 'FileWarning' },
  matched: { tone: 'success', icon: 'CheckCircle2' },
  mismatch: { tone: 'danger', icon: 'AlertTriangle' },
};

const APPROVAL_META = {
  pending_accountant: { tone: 'brand', icon: 'Clock' },
  pending_chief: { tone: 'brand', icon: 'Hourglass' },
  approved: { tone: 'success', icon: 'BadgeCheck' },
  rejected: { tone: 'danger', icon: 'XCircle' },
};

export function getReconciliationMeta(status) {
  const meta = RECONCILIATION_META[status];
  if (!meta) return null;
  return { key: status, ...meta, ...vi.reconciliation[status] };
}

export function getApprovalMeta(status) {
  const meta = APPROVAL_META[status];
  if (!meta) return null;
  return { key: status, ...meta, ...vi.approval[status] };
}

const hasItems = (list) => Array.isArray(list) && list.length > 0;

/**
 * Trạng thái đối soát của một bộ, suy ra từ dữ liệu API.
 * Thứ tự ưu tiên: đang trích xuất > thiếu chứng từ > kết quả đối soát của backend.
 */
export function getReconciliationStatus(batch) {
  if (!batch) return null;
  if (hasItems(batch.pending_extraction_doc_types)) return 'processing';
  if (hasItems(batch.missing_doc_types)) return 'missing_docs';

  switch (batch.reconciliation_status) {
    case 'matched':
      return 'matched';
    case 'minor_diff':
    case 'major_diff':
      return 'mismatch';
    default:
      // Đủ chứng từ nhưng backend chưa có kết quả: coi là đang xử lý thay vì đoán.
      return 'processing';
  }
}

/**
 * Trạng thái duyệt của một bộ; null nếu chưa có gì để duyệt
 * (thiếu chứng từ, đang xử lý, hoặc có chênh lệch nên kế toán viên chưa thể duyệt).
 */
export function getApprovalStatus(batch) {
  if (!batch) return null;

  switch (batch.status) {
    case 'rejected':
      return 'rejected';
    case 'final_approved':
      return 'approved';
    case 'approved':
      return 'pending_chief';
    case 'ready':
      return getReconciliationStatus(batch) === 'matched' ? 'pending_accountant' : null;
    default:
      return null;
  }
}

export function getBatchStatuses(batch) {
  return {
    reconciliation: getReconciliationStatus(batch),
    approval: getApprovalStatus(batch),
  };
}

/** Bộ cần người dùng hành động tiếp, theo vai trò: dùng cho danh sách "Cần xử lý". */
export function needsAction(batch, role) {
  const { reconciliation, approval } = getBatchStatuses(batch);
  if (role === 'chief_accountant') return approval === 'pending_chief';
  return approval === 'pending_accountant' || approval === 'rejected' || reconciliation === 'missing_docs';
}
