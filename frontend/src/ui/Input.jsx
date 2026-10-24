import React, { cloneElement, forwardRef, useId } from 'react';
import { cn, focusRing } from './cn.js';

const CONTROL =
  'block w-full rounded-control border bg-surface px-3 text-sm text-fg shadow-card placeholder:text-fg-subtle ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70';

function controlClasses(invalid, className) {
  return cn(CONTROL, invalid ? 'border-tone-danger-fg' : 'border-line-input', focusRing, className);
}

export const Input = forwardRef(function Input({ invalid = false, className, type = 'text', ...rest }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('min-h-10 py-2', className))}
      {...rest}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ invalid = false, className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('py-2', className))}
      {...rest}
    />
  );
});

/**
 * Nhãn + ô nhập + gợi ý + lỗi, nối sẵn id/aria-describedby/aria-invalid cho control con.
 * Con phải là một phần tử duy nhất (Input, Textarea, Select...).
 */
export function Field({ label, hint, error, required = false, className, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-tone-danger-fg" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {cloneElement(children, {
        id,
        required: required || undefined,
        invalid: Boolean(error),
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-tone-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
