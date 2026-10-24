import React from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, FileWarning, Hourglass, Loader2, XCircle } from 'lucide-react';
import { getApprovalMeta, getBatchStatuses, getReconciliationMeta } from '../lib/status.js';
import { cn } from './cn.js';
import Badge from './Badge.jsx';

const ICONS = { AlertTriangle, BadgeCheck, CheckCircle2, Clock, FileWarning, Hourglass, Loader2, XCircle };

function MetaBadge({ meta, size, className }) {
  if (!meta) return null;
  const Icon = ICONS[meta.icon];
  return (
    <Badge tone={meta.tone} icon={Icon} size={size} spin={meta.icon === 'Loader2'} className={className} title={meta.hint}>
      {meta.label}
    </Badge>
  );
}

/** Badge trạng thái đối soát (AI): Đang xử lý, Thiếu chứng từ, Khớp, Có chênh lệch. */
export function ReconciliationBadge({ status, size, className }) {
  return <MetaBadge meta={getReconciliationMeta(status)} size={size} className={className} />;
}

/** Badge trạng thái duyệt (con người): Chờ duyệt (hai cấp), Đã duyệt, Từ chối. */
export function ApprovalBadge({ status, size, className }) {
  return <MetaBadge meta={getApprovalMeta(status)} size={size} className={className} />;
}

/**
 * Cặp badge của một bộ đối soát. Luôn có badge đối soát; badge duyệt chỉ hiện khi đã có gì để duyệt.
 * Truyền thẳng object batch từ API.
 */
export function BatchStatusBadges({ batch, size, className }) {
  const { reconciliation, approval } = getBatchStatuses(batch);
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <ReconciliationBadge status={reconciliation} size={size} />
      <ApprovalBadge status={approval} size={size} />
    </span>
  );
}
