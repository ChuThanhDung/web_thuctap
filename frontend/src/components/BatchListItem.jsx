import React from 'react';
import { AlertTriangle, Clock3, Lock } from 'lucide-react';
import { Badge } from '../ui/index.js';
import { cn } from '../ui/cn.js';

// Hàng của danh sách Bộ đối soát, dùng chung cho kế toán viên và kế toán trưởng.
// Đầu vào là bộ đã chuẩn hóa ở trang (batchNumber, supplierName, rawStatus, comparisons, lineItems...).

export const BATCH_RESULT_TEXT = { success: 'text-tone-success-fg', warning: 'text-tone-warning-fg', danger: 'text-tone-danger-fg', neutral: 'text-fg' };

/** Kết quả đối soát kèm lý do ngắn: hổ phách cho lệch nhỏ (làm tròn), đỏ cho lệch lớn. */
export function getBatchResult(batch) {
  if (batch.foreignCopy) return { tone: 'danger', label: `Gắn nhầm liên ${batch.foreignCopy.label}` };
  if (batch.completion !== undefined && batch.completion < 3) {
    return { tone: 'neutral', label: `Thiếu ${3 - batch.completion} chứng từ` };
  }
  const firstDiff = batch.comparisons?.find((item) => item.severity === 'danger')?.field
    || (batch.lineItems?.some((item) => item.priceSeverity === 'danger') && 'đơn giá')
    || (batch.lineItems?.some((item) => item.qtySeverity === 'danger') && 'số lượng')
    || (batch.lineItems?.some((item) => item.amountSeverity === 'danger') && 'thành tiền');
  const reason = firstDiff ? ` · ${String(firstDiff).toLowerCase()}` : '';
  // Thiếu tổng tiền trên hóa đơn/PO: backend chặn duyệt bằng major_diff, nhưng không có trường nào lệch thật.
  if (batch.reconciliationStatus === 'major_diff' && batch.status === 'missing') return { tone: 'neutral', label: 'Thiếu dữ liệu · cần kiểm tra' };
  if (batch.reconciliationStatus === 'major_diff') return { tone: 'danger', label: `Lệch lớn${reason}` };
  if (batch.reconciliationStatus === 'minor_diff') return { tone: 'warning', label: `Lệch nhỏ${reason}` };
  if (batch.reconciliationStatus === 'matched') return { tone: 'success', label: 'Ba liên khớp' };
  if (!batch.reconciliationStatus && !batch.mismatchFields) {
    return batch.minorFields > 0 ? { tone: 'warning', label: 'Lệch nhỏ · làm tròn' } : { tone: 'success', label: 'Ba liên khớp' };
  }
  // Bộ cũ chưa có kết quả từ hệ thống: biết là lệch nhưng không biết mức, nên không tô màu mức lệch.
  return { tone: 'neutral', label: `Lệch ${batch.mismatchFields} trường${reason} · chưa phân loại` };
}

export function formatBatchTotal(batch) {
  const row = batch.comparisons?.find((item) => item.field === 'Tổng tiền');
  const value = row?.invoice || row?.po || row?.grn;
  return value && value !== '-' ? `${value} đ` : '—';
}

/** Nhãn duyệt: chờ ai làm gì, hoặc đã khóa. Cùng một bước duyệt, mỗi vai trò đọc theo góc của mình. */
export function getBatchApprovalChip(batch, role) {
  if (batch.rawStatus === 'final_approved') return { tone: 'success', icon: Lock, label: 'Đã lưu trữ' };
  if (batch.rawStatus === 'rejected') return { tone: 'danger', icon: AlertTriangle, label: role === 'chief_accountant' ? 'Đã từ chối' : 'Bị trả lại' };
  if (batch.rawStatus === 'approved') return { tone: 'brand', icon: Clock3, label: 'Chờ duyệt cuối' };
  if (role === 'chief_accountant') return { tone: 'neutral', icon: Clock3, label: 'Chờ cấp 1' };
  // Kế toán viên: bộ lệch lớn hoặc thiếu dữ liệu chưa duyệt được. Nhãn này nói về bước duyệt nên giữ trung tính;
  // mức lệch (đỏ "Lệch lớn") đã nằm ở dòng kết quả ngay bên dưới, không lặp lại bằng một nhãn xám mơ hồ.
  if (['mismatch', 'missing'].includes(batch.status)) return { tone: 'neutral', icon: AlertTriangle, label: 'Chưa duyệt được' };
  return { tone: 'neutral', icon: Clock3, label: 'Chờ bạn duyệt' };
}

function getComparisonValue(batch, field) {
  const row = batch.comparisons?.find((item) => item.field === field);
  const value = row?.po || row?.invoice || row?.grn;
  return value && value !== '-' ? value : '';
}

/** Dòng meta dưới mã bộ ở khung chi tiết: nhà cung cấp · MST · VAT · kết quả bằng lời. */
export function BatchMetaLine({ batch, className }) {
  const result = getBatchResult(batch);
  const taxId = getComparisonValue(batch, 'Mã số thuế');
  const vat = getComparisonValue(batch, 'Thuế suất VAT');
  const parts = [batch.supplierName, taxId && `MST ${taxId}`, vat && `VAT ${vat.replace(/%?$/, '%')}`].filter(Boolean);
  return (
    <p className={cn('mt-1 text-sm text-fg-muted', className)}>
      {parts.join(' · ')}
      {parts.length > 0 && ' · '}
      <span className={cn('font-semibold', BATCH_RESULT_TEXT[result.tone])}>{result.label}</span>
    </p>
  );
}

/** Kết luận đặt trên cùng khung chi tiết khi một liên thuộc giao dịch khác: nói một lần, nói việc cần làm. */
export function ForeignCopyNotice({ foreignCopy }) {
  if (!foreignCopy) return null;
  const supplier = foreignCopy.supplierName ? ` (nhà cung cấp ${foreignCopy.supplierName})` : '';
  return (
    <div role="status" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-4 py-3 text-sm text-tone-danger-fg">
      <p className="font-semibold">Liên {foreignCopy.label} có vẻ thuộc giao dịch khác{supplier}.</p>
      <p className="mt-1">
        Nhà cung cấp và mặt hàng gần như không trùng với hai liên còn lại, nên đây không phải chênh lệch cần nhà cung cấp sửa.
        Thay liên {foreignCopy.label} bằng chứng từ đúng của giao dịch này.
      </p>
    </div>
  );
}

export default function BatchListItem({ batch, role, selected, onSelect }) {
  const approval = getBatchApprovalChip(batch, role);
  const result = getBatchResult(batch);
  return (
    <button
      type="button"
      data-batch-row
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'block w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
        selected ? 'bg-surface ring-1 ring-inset ring-primary' : 'hover:bg-surface',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className={cn('block truncate text-sm text-fg', selected ? 'font-bold' : 'font-semibold')}>{batch.batchNumber}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{batch.supplierName || 'Chưa rõ nhà cung cấp'}</span>
        </span>
        <Badge tone={approval.tone} icon={approval.icon} size="sm">{approval.label}</Badge>
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-3 text-xs">
        <span className={cn('min-w-0 truncate font-semibold', BATCH_RESULT_TEXT[result.tone])}>{result.label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-fg">{formatBatchTotal(batch)}</span>
      </span>
      {batch.rejectionNote && (
        <span className="mt-1 block truncate text-xs font-medium text-tone-danger-fg" title={batch.rejectionNote}>
          Lý do từ chối: {batch.rejectionNote}
        </span>
      )}
    </button>
  );
}
