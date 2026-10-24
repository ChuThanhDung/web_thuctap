import React from 'react';
import { cn } from './cn.js';

/**
 * Đầu trang chuẩn cho mọi màn hình: H1, mô tả ngắn, và nút hành động chính ở bên phải
 * (xuống dòng dưới tiêu đề trên màn hình hẹp). Mỗi trang chỉ có đúng một PageHeader.
 */
export default function PageHeader({ title, description, actions, className }) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
