import React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../ui/cn.js';

/**
 * Khối chữ ký như cuối mọi phiếu kế toán: Người lập · Duyệt cấp 1 · Duyệt cuối.
 * Tên người đã ký in màu mực xanh; ô chưa ký ghi rõ đang chờ. Bộ đã duyệt cuối mang dấu "Đã lưu trữ".
 */
export default function SignatureStrip({ batch, className }) {
  const archived = batch.rawStatus === 'final_approved';
  const rejected = batch.rawStatus === 'rejected';
  const cells = [
    { label: 'Người lập', name: batch.owner },
    { label: 'Duyệt cấp 1', name: batch.approvedBy, waiting: 'Chờ kế toán viên' },
    {
      label: 'Duyệt cuối',
      name: batch.chiefApprovedBy,
      waiting: rejected ? 'Đã từ chối' : batch.rawStatus === 'approved' ? 'Chờ kế toán trưởng' : '—',
    },
  ];

  return (
    <dl className={cn('grid grid-cols-3 overflow-hidden rounded-control border border-line-input/60 bg-surface', className)}>
      {cells.map((cell, index) => (
        <div key={cell.label} className={cn('relative min-w-0 px-3 py-2', index > 0 && 'border-l border-line-input/60')}>
          <dt className="text-xs font-semibold text-fg-subtle">{cell.label}</dt>
          <dd className={cn('mt-0.5 break-words text-sm leading-snug', cell.name ? 'font-semibold text-primary' : 'text-fg-subtle')}>
            {cell.name || cell.waiting}
          </dd>
          {index === 2 && archived && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-control border border-tone-success-line bg-tone-success-bg px-1.5 py-0.5 text-xs font-semibold text-tone-success-fg">
              <Lock size={12} aria-hidden="true" />
              Đã lưu trữ
            </span>
          )}
        </div>
      ))}
    </dl>
  );
}
