import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, focusRing } from './cn.js';

const VARIANTS = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-card',
  secondary: 'border border-line-input bg-surface text-fg hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger:
    'border border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg hover:bg-tone-danger-bg/70',
};

const SIZES = {
  sm: 'min-h-8 gap-1.5 px-3 text-sm',
  md: 'min-h-10 gap-2 px-4 text-sm',
};

const ICON_ONLY_SIZES = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
};

/**
 * Nút bấm. Nút chỉ có icon (`iconOnly`) bắt buộc có `aria-label`.
 * `loading` khóa nút và báo `aria-busy` cho trình đọc màn hình.
 */
const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconOnly = false,
    leadingIcon: LeadingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  if (import.meta.env?.DEV && iconOnly && !rest['aria-label']) {
    console.warn('Button iconOnly cần aria-label để trình đọc màn hình đọc được.');
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-control font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        focusRing,
        VARIANTS[variant],
        iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : (
        LeadingIcon && <LeadingIcon size={16} aria-hidden="true" />
      )}
      {children}
    </button>
  );
});

export default Button;
