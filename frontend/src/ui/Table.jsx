import React from 'react';
import { cn } from './cn.js';

/**
 * Bảng dữ liệu. Cuộn ngang trong khung khi hẹp (tablet), có `caption` ẩn cho trình đọc màn hình.
 * Cột số dùng `numeric`: căn phải và chữ số cùng độ rộng (tabular-nums) để dễ so sánh theo cột.
 */
export function Table({ caption, className, children, ...rest }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }) {
  return <thead className="border-b border-line bg-surface-muted">{children}</thead>;
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ interactive = false, className, ...rest }) {
  return <tr className={cn(interactive && 'cursor-pointer hover:bg-surface-muted', className)} {...rest} />;
}

export function TH({ numeric = false, className, children, ...rest }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fg-muted',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({ numeric = false, className, children, ...rest }) {
  return (
    <td className={cn('px-4 py-3 align-middle text-fg', numeric && 'text-right tabular-nums', className)} {...rest}>
      {children}
    </td>
  );
}
