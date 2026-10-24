import React from 'react';
import { cn } from './cn.js';

const TONES = {
  success: 'border-tone-success-line bg-tone-success-bg text-tone-success-fg',
  warning: 'border-tone-warning-line bg-tone-warning-bg text-tone-warning-fg',
  danger: 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg',
  info: 'border-tone-info-line bg-tone-info-bg text-tone-info-fg',
  neutral: 'border-tone-neutral-line bg-tone-neutral-bg text-tone-neutral-fg',
  brand: 'border-tone-brand-line bg-tone-brand-bg text-tone-brand-fg',
};

const SIZES = {
  sm: 'gap-1 px-2 py-0.5 text-xs',
  md: 'gap-1.5 px-2.5 py-1 text-xs',
};

/** Badge ngữ nghĩa. Luôn có chữ; icon đi kèm để không phụ thuộc vào màu. */
export default function Badge({ tone = 'neutral', icon: Icon, size = 'md', spin = false, className, children, ...rest }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-semibold leading-none',
        TONES[tone],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 14} className={spin ? 'animate-spin' : undefined} aria-hidden="true" />}
      {children}
    </span>
  );
}
