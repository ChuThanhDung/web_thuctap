import React from 'react';
import { Bot, Menu } from 'lucide-react';
import { vi } from '../i18n/vi.js';
import { cn, focusRing } from '../ui/index.js';
import NotificationBell from './NotificationBell.jsx';

/**
 * Thanh trên cùng, chỉ dùng ở màn hình hẹp (< 768px) khi thanh bên là menu trượt: nút mở menu, tên sản phẩm
 * và chuông thông báo. Từ 768px trở lên chuông nằm ngay trong thanh bên nên không cần thanh này.
 */
export default function AppHeader({ token, menuOpen, onOpenMenu }) {
  return (
    <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={vi.shell.openMenu}
          aria-expanded={menuOpen}
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted', focusRing)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-fg">
            <Bot size={18} aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-semibold text-fg">{vi.brand.name}</span>
        </span>
      </div>
      <NotificationBell token={token} />
    </div>
  );
}
