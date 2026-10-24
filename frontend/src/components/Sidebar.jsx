import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Dialog, DialogPanel } from '@headlessui/react';
import {
  Bot,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { getAvatarViewUrl } from '../api.js';
import { vi } from '../i18n/vi.js';
import { getNavItems } from '../lib/nav.js';
import { getDisplayName, getRoleLabel } from '../lib/people.js';
import { Avatar, Tooltip, cn } from '../ui/index.js';
import NotificationBell from './NotificationBell.jsx';
import UserProfileModal from './UserProfileModal.jsx';

const NAV_ICONS = {
  overview: LayoutDashboard,
  upload: Upload,
  batches: ClipboardList,
  users: Users,
  settings: SlidersHorizontal,
};

// Thanh bên luôn tối (cả giao diện sáng) nên có bộ màu và ring focus riêng, tương phản trên nền navy.
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar';
const itemBase = 'flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors';
const itemIdle = 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg';
const itemActive =
  'relative bg-sidebar-active text-sidebar-fg before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-accent';

/** Nhãn hiện khi thanh bên mở rộng; khi thu gọn, tên nằm trong tooltip và aria-label của nút. */
function withTooltip(compact, label, element) {
  return compact ? (
    <Tooltip content={label} side="right">
      {element}
    </Tooltip>
  ) : (
    element
  );
}

function ThemeToggle({ theme, onToggle, compact }) {
  const isDark = theme === 'dark';

  if (compact) {
    const label = isDark ? vi.shell.switchToLight : vi.shell.switchToDark;
    return withTooltip(
      true,
      label,
      <button type="button" onClick={onToggle} aria-label={label} className={cn(itemBase, itemIdle, 'justify-center px-0', focusRing)}>
        {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>,
    );
  }

  return (
    <div role="group" aria-label={vi.shell.theme} className="px-3 py-1">
      <span className="inline-flex rounded-control bg-sidebar-hover p-0.5">
        {[
          ['light', vi.shell.themeLight, Sun],
          ['dark', vi.shell.themeDark, Moon],
        ].map(([value, label, Icon]) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => !active && onToggle()}
              className={cn(
                'inline-flex h-8 w-10 items-center justify-center rounded-md transition-colors',
                active ? 'bg-sidebar-active text-sidebar-fg' : 'text-sidebar-muted hover:text-sidebar-fg',
                focusRing,
              )}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          );
        })}
      </span>
    </div>
  );
}

function SidebarContent({
  compact,
  drawer,
  onNavigate,
  onClose,
  canToggle,
  onToggleCompact,
  token,
  user,
  onOpenProfile,
  onLogout,
  theme,
  onToggleTheme,
}) {
  const items = getNavItems(user.role);
  const displayName = getDisplayName(user.full_name);
  const roleLabel = getRoleLabel(user.role);
  const avatarSrc = getAvatarViewUrl(user);

  const profileButton = (
    <button
      type="button"
      onClick={onOpenProfile}
      aria-label={compact ? `${vi.shell.profile}: ${displayName}` : vi.shell.profile}
      className={cn('flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-sidebar-hover', compact && 'justify-center px-0', focusRing)}
    >
      <Avatar name={user.full_name} src={avatarSrc} />
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-fg">{displayName}</span>
          <span className="block truncate text-xs text-sidebar-muted">{roleLabel}</span>
        </span>
      )}
    </button>
  );

  const logoutButton = (
    <button
      type="button"
      onClick={onLogout}
      aria-label={compact ? vi.shell.logout : undefined}
      className={cn(itemBase, itemIdle, compact && 'justify-center px-0', focusRing)}
    >
      <LogOut size={18} aria-hidden="true" className="shrink-0" />
      {!compact && vi.shell.logout}
    </button>
  );

  return (
    <>
      <div className={cn('flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-line px-4', compact && 'justify-center px-0')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-sidebar-accent text-sidebar">
          <Bot size={20} aria-hidden="true" />
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-sidebar-fg">{vi.brand.name}</span>
            <span className="block truncate text-xs text-sidebar-muted">{vi.brand.tagline}</span>
          </span>
        )}
        {!drawer && !compact && <NotificationBell token={token} variant="sidebar" />}
        {drawer && (
          <button
            type="button"
            onClick={onClose}
            aria-label={vi.shell.closeMenu}
            className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-sidebar-muted hover:bg-sidebar-hover', focusRing)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {!drawer && compact && (
        <div className="flex shrink-0 justify-center border-b border-sidebar-line py-2">
          <NotificationBell token={token} variant="sidebar" />
        </div>
      )}

      <nav aria-label={vi.shell.mainNavigation} className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            return (
              <li key={item.to}>
                {withTooltip(
                  compact,
                  item.label,
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    aria-label={compact ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(itemBase, isActive ? itemActive : itemIdle, compact && 'justify-center px-0', focusRing)
                    }
                  >
                    <Icon size={20} aria-hidden="true" className="shrink-0" />
                    {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  </NavLink>,
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-sidebar-line p-3">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact={compact} />
        {withTooltip(compact, `${vi.shell.profile}: ${displayName}`, profileButton)}
        {withTooltip(compact, vi.shell.logout, logoutButton)}
        {canToggle &&
          withTooltip(
            compact,
            vi.shell.expandSidebar,
            <button
              type="button"
              onClick={onToggleCompact}
              aria-label={compact ? vi.shell.expandSidebar : vi.shell.collapseSidebar}
              className={cn(itemBase, itemIdle, compact && 'justify-center px-0', focusRing)}
            >
              {compact ? <ChevronsRight size={18} aria-hidden="true" /> : <ChevronsLeft size={18} aria-hidden="true" />}
              {!compact && vi.shell.collapseSidebar}
            </button>,
          )}
      </div>
    </>
  );
}

/**
 * Thanh bên điều hướng. Ba chế độ do App quyết định theo kích thước màn hình:
 * - drawer (< 768px): menu trượt ra từ trái, có khóa focus và Esc để đóng;
 * - compact (768–1023px, hoặc người dùng thu gọn): chỉ icon, tên hiện trong tooltip;
 * - mở rộng (≥ 1024px): đủ nhãn.
 * Vai trò hiện ngay dưới tên người dùng, không còn thẻ "Vai trò" riêng.
 */
export default function Sidebar({
  drawer = false,
  open = false,
  onClose,
  compact = false,
  canToggle = false,
  onToggleCompact,
  token,
  user,
  onLogout,
  onUserUpdate,
  theme = 'light',
  onToggleTheme,
}) {
  const [showProfile, setShowProfile] = useState(false);

  const content = (
    <SidebarContent
      compact={compact && !drawer}
      drawer={drawer}
      onNavigate={drawer ? onClose : undefined}
      onClose={onClose}
      canToggle={canToggle}
      onToggleCompact={onToggleCompact}
      token={token}
      user={user}
      onOpenProfile={() => {
        setShowProfile(true);
        if (drawer) onClose?.();
      }}
      onLogout={onLogout}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );

  return (
    <>
      {drawer ? (
        <Dialog open={open} onClose={onClose} className="relative z-50">
          <div aria-hidden="true" className="fixed inset-0 bg-fg/40" />
          <DialogPanel className="fixed inset-y-0 left-0 flex w-[min(86vw,288px)] flex-col border-r border-sidebar-line bg-sidebar shadow-pop">
            {content}
          </DialogPanel>
        </Dialog>
      ) : (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-line bg-sidebar transition-[width] duration-200',
            compact ? 'w-[68px]' : 'w-[260px]',
          )}
        >
          {content}
        </aside>
      )}

      {showProfile && (
        <UserProfileModal token={token} user={user} onClose={() => setShowProfile(false)} onUserUpdate={onUserUpdate} />
      )}
    </>
  );
}
