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
  Settings,
  Upload,
} from 'lucide-react';
import { repairVietnameseText } from '../text.js';
import UserProfileModal from './UserProfileModal.jsx';

const navItemsAccountant = [
  { to: '/accountant', icon: FileCheck, label: 'Đối soát' },
  { to: '/upload', icon: Upload, label: 'Tải lên' },
  { to: '/audit-trail', icon: ClipboardList, label: 'Nhật ký' },
];

const navItemsManager = [
  { to: '/manager', icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/accountant', icon: FileCheck, label: 'Phê duyệt đối soát' },
  { to: '/audit-trail', icon: ClipboardList, label: 'Nhật ký' },
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

export default function Sidebar({ collapsed, onToggle, token, user, onLogout, onUserUpdate }) {
  const [showProfile, setShowProfile] = useState(false);
  const isManager = user.role === 'chief_accountant';
  const navItems = isManager ? navItemsManager : navItemsAccountant;
  const fullName = repairVietnameseText(user.full_name);
  const roleName = repairVietnameseText(user.role_name);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      <div className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Bot size={20} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-bold leading-snug text-slate-900">Docusyncai - AI Đối soát</h1>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Hóa đơn & Chứng từ</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Vai trò</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">{roleName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
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
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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

      <div className="border-t border-slate-200 p-4">
        {!collapsed && (
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="mb-3 flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-slate-50"
            title="Thông tin cá nhân"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {getInitials(fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-slate-900">{fullName}</p>
            </div>
          </button>
        )}
        <button
          onClick={onLogout}
          className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title="Đăng xuất"
        >
          <LogOut size={18} />
          {!collapsed && <span className="text-xs">Đăng xuất</span>}
        </button>
        <button
          onClick={onToggle}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 ${
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
