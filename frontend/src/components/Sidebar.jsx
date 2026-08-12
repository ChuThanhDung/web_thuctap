import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  Upload,
} from 'lucide-react';
import { repairVietnameseText } from '../text.js';
import UserProfileModal from './UserProfileModal.jsx';

const navItemsAccountant = [
  { to: '/accountant', icon: FileCheck, label: 'Đối soát' },
  { to: '/upload', icon: Upload, label: 'Tải lên' },
  { to: '/audit-trail', icon: ClipboardList, label: 'Batch đối soát' },
];

const navItemsManager = [
  { to: '/manager', icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/accountant', icon: FileCheck, label: 'Phê duyệt đối soát' },
  { to: '/audit-trail', icon: ClipboardList, label: 'Batch đối soát' },
  { to: '/settings', icon: Settings, label: 'Cấu hình' },
];

function getInitials(fullName) {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Sidebar({ collapsed, onToggle, token, user, onLogout, onUserUpdate, theme = 'light', onToggleTheme }) {
  const [showProfile, setShowProfile] = useState(false);
  const isManager = user.role === 'chief_accountant';
  const navItems = isManager ? navItemsManager : navItemsAccountant;
  const fullName = repairVietnameseText(user.full_name);
  const roleName = repairVietnameseText(user.role_name);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      <div className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white dark:bg-brand-500">
          <Bot size={20} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-bold leading-snug text-slate-900 dark:text-slate-100">Docusyncai - AI Đối soát</h1>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Hóa đơn & Chứng từ</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Vai trò</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{roleName}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isManager ? 'Không gian kế toán trưởng' : 'Không gian kế toán viên'}
            </p>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="space-y-1.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                  } ${collapsed ? 'justify-center px-2' : ''}`
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={20} className="shrink-0" />
                {!collapsed && <span className="min-w-0 flex-1">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800 space-y-1">
        {/* Dark Mode Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title={theme === 'dark' ? 'Chuyển sang Chế độ Sáng' : 'Chuyển sang Chế độ Tối'}
        >
          {theme === 'dark' ? (
            <Sun size={18} className="text-amber-400" />
          ) : (
            <Moon size={18} className="text-slate-600" />
          )}
          {!collapsed && (
            <span className="text-xs font-medium">
              {theme === 'dark' ? 'Giao diện Tối' : 'Giao diện Sáng'}
            </span>
          )}
        </button>

        {!collapsed && (
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            title="Thông tin cá nhân"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
              {getInitials(fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-slate-900 dark:text-slate-100 truncate">{fullName}</p>
            </div>
          </button>
        )}

        <button
          onClick={onLogout}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title="Đăng xuất"
        >
          <LogOut size={18} />
          {!collapsed && <span className="text-xs">Đăng xuất</span>}
        </button>

        <button
          onClick={onToggle}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="text-xs">Thu gọn</span>}
        </button>
      </div>

      {showProfile && (
        <UserProfileModal
          token={token}
          user={user}
          onClose={() => setShowProfile(false)}
          onUserUpdate={onUserUpdate}
        />
      )}
    </aside>
  );
}

