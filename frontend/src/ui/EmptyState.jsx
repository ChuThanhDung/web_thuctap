import React from 'react';
import { cn } from './cn.js';

/**
 * Trạng thái rỗng có giá trị: nói rõ vì sao trống và cho một hành động tiếp theo,
 * thay vì hiện biểu đồ hay bảng trống.
 */
export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
          <Icon size={24} aria-hidden="true" />
        </span>
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
