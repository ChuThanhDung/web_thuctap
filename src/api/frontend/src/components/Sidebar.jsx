import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileCheck,
  Upload,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bot,
  LogOut,
} from 'lucide-react';

const navItemsAccountant = [
  { to: '/', icon: FileCheck, label: 'Đối soát' },
  { to: '/upload', icon: Upload, label: 'Tải lên' },
  { to: '/audit-trail', icon: ClipboardList, label: 'Nhật ký' },
  { to: '/settings', icon: Settings, label: 'Cấu hình' },
];

const navItemsManager = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/', icon: FileCheck, label: 'Đối soát' },
  { to: '/audit-trail', icon: ClipboardList, label: 'Nhật ký' },
  { to: '/settings', icon: Settings, label: 'Cấu hình' },
];

export default function Sidebar({ collapsed, onToggle, role, onRoleChange }) {
  const location = useLocation();
  const navItems = role === 'manager' ? navItemsManager : navItemsAccountant;

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Bot size={20} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-900">AI Đối soát</h1>
            <p className="truncate text-[11px] text-slate-500">Hóa đơn & Chứng từ</p>
          </div>
        )}
      </div>

      {/* Role switcher (demo only) */}
      {!collapsed && (
        <div className="border-b border-slate-200 px-3 py-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Vai trò (demo)
          </p>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              onClick={() => onRoleChange('accountant')}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                role === 'accountant'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Kế toán viên
            </button>
            <button
              onClick={() => onRoleChange('manager')}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                role === 'manager'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              KT Trưởng
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-1">
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
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User info */}
      <div className="border-t border-slate-200 p-3">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {role === 'manager' ? 'TM' : 'NL'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {role === 'manager' ? 'Trần Văn Minh' : 'Nguyễn Thị Lan'}
              </p>
              <p className="truncate text-xs text-slate-500">
                {role === 'manager' ? 'Kế toán trưởng' : 'Kế toán viên'}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="text-xs">Thu gọn</span>}
        </button>
      </div>
    </aside>
  );
}
