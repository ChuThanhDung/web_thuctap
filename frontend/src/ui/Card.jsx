import React from 'react';
import { cn, focusRing } from './cn.js';

const TONE_ICON = {
  neutral: 'bg-tone-neutral-bg text-tone-neutral-fg',
  brand: 'bg-tone-brand-bg text-tone-brand-fg',
  success: 'bg-tone-success-bg text-tone-success-fg',
  warning: 'bg-tone-warning-bg text-tone-warning-fg',
  danger: 'bg-tone-danger-bg text-tone-danger-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
};

export function Card({ className, ...rest }) {
  return <div className={cn('rounded-card border border-line bg-surface shadow-card', className)} {...rest} />;
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Thẻ chỉ số (KPI). Có `onClick` thì là nút lọc nhanh: dùng `active` để báo bộ lọc đang bật (aria-pressed).
 * Số căn đều bằng tabular-nums để các thẻ cạnh nhau thẳng hàng.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', onClick, active = false, className }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg-muted">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-fg">{value}</p>
        </div>
        {Icon && (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', TONE_ICON[tone])}>
            <Icon size={20} aria-hidden="true" />
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-sm text-fg-muted">{hint}</p>}
    </>
  );

  const base = cn('block w-full rounded-card border bg-surface p-4 text-left shadow-card', className);

  if (!onClick) {
    return <div className={cn(base, 'border-line')}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        base,
        'transition-colors hover:bg-surface-muted',
        active ? 'border-primary ring-1 ring-primary' : 'border-line',
        focusRing,
      )}
    >
      {body}
    </button>
  );
}
