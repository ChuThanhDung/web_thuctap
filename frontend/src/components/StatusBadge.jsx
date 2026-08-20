import React from 'react';

const STATUS_STYLES = {
  matched: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    label: 'Khớp hoàn toàn',
  },
  approved: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    label: 'Đã duyệt',
  },
  final_approved: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    label: 'Đã duyệt cuối',
  },
  rejected: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    label: 'Đã từ chối',
  },
  mismatch: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    label: 'Lệch',
  },
  missing: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    label: 'Thiếu dữ liệu',
  },
  unapproved: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    dot: 'bg-slate-500',
    label: 'Chưa duyệt',
  },
  minor_diff: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    label: 'Chênh lệch nhẹ',
  },
  major_diff: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    label: 'Cần xem xét',
  },
  low_confidence: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
    label: 'Confidence thấp',
  },
};

export default function StatusBadge({ status, size = 'default' }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.low_confidence;
  const sizeClasses =
    size === 'small'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function RiskBadge({ level }) {
  const styles = {
    high: 'bg-rose-100 text-rose-700 border-rose-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const labels = { high: 'Rủi ro cao', medium: 'Rủi ro TB', low: 'Rủi ro thấp' };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
        styles[level] || styles.low
      }`}
    >
      {labels[level] || level}
    </span>
  );
}
