import React from 'react';
import { Lock } from 'lucide-react';
import { batchMatchStatus, matchStatusLabel } from '../reconciliationCompare.js';

/**
 * Nội dung hộp xác nhận duyệt: tóm tắt bộ chứng từ và, với duyệt cuối, cảnh báo lưu trữ vĩnh viễn.
 * `final`: kế toán trưởng duyệt cuối (bộ trở thành hồ sơ không sửa, không xóa được).
 */
export default function ApprovalConfirmBody({ batch, final = false }) {
  if (!batch) return null;
  const skipsLevelOne = final && batch.rawStatus !== 'approved';
  const isMinor = batchMatchStatus(batch) === 'minor';
  const rows = [
    ['Mã bộ', batch.batchNumber],
    ['Nhà cung cấp', batch.supplierName || '—'],
    ['Kết quả đối chiếu', matchStatusLabel(batchMatchStatus(batch))],
    ['Trường chênh lệch', String(batch.mismatchFields ?? 0)],
    ['Kế toán viên duyệt', batch.approvedBy || 'Chưa có'],
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-fg-muted">{label}</dt>
            <dd className="min-w-0 break-words font-medium tabular-nums text-fg">{value}</dd>
          </React.Fragment>
        ))}
      </dl>

      {isMinor && (
        <p className="rounded-control border border-tone-warning-line bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
          Bộ có chênh lệch số tiền trong ngưỡng làm tròn 1.000 đ. Duyệt nghĩa là chấp nhận chênh lệch này; thao tác được ghi vào nhật ký.
        </p>
      )}

      {skipsLevelOne && (
        <p className="rounded-control border border-tone-warning-line bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
          Bộ này chưa qua kế toán viên duyệt. Bạn đang duyệt trực tiếp ở cấp cuối.
        </p>
      )}

      {final && (
        <p className="flex items-start gap-2 rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg">
          <Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            Sau khi duyệt cuối, hồ sơ được lưu trữ vĩnh viễn: không thể sửa, thêm hay xóa chứng từ, và không hoàn tác được.
          </span>
        </p>
      )}
    </div>
  );
}
