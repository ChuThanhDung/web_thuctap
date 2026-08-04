import React, { useState } from 'react';
import {
  ClipboardList,
  Search,
  ChevronDown,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  AlertTriangle,
  Settings,
  Bot,
  X,
} from 'lucide-react';
import { auditTrailData } from '../mockData';

const ACTION_STYLES = {
  'Duyệt': { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'Duyệt hàng loạt': { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'Từ chối': { icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
  'Escalate': { icon: ArrowUpRight, color: 'text-amber-600', bg: 'bg-amber-50' },
  'Cảnh báo': { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  'Auto-match': { icon: Bot, color: 'text-brand-600', bg: 'bg-brand-50' },
  'Cấu hình': { icon: Settings, color: 'text-slate-600', bg: 'bg-slate-100' },
};

export default function AuditTrail() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const actions = [...new Set(auditTrailData.map((a) => a.action))];

  const filtered = auditTrailData.filter((item) => {
    if (actionFilter && item.action !== actionFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.user.toLowerCase().includes(q) ||
        item.target.toLowerCase().includes(q) ||
        item.detail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nhật ký hoạt động</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Audit trail — ai duyệt gì, khi nào
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Tìm theo người dùng, hóa đơn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="input-field appearance-none pr-9 min-w-[160px]"
            >
              <option value="">Tất cả hành động</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">
                  Thời gian
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Người thực hiện
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Hành động
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Đối tượng
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Chi tiết
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  IP
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const actionStyle = ACTION_STYLES[item.action] || ACTION_STYLES['Cấu hình'];
                const ActionIcon = actionStyle.icon;
                return (
                  <tr key={item.id} className="table-row-hover">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {new Date(item.timestamp).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{item.user}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${actionStyle.bg} ${actionStyle.color}`}
                      >
                        <ActionIcon size={13} />
                        {item.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                      {item.target}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[280px]">
                      <p className="truncate">{item.detail}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {item.ipAddress}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-slate-500">Không tìm thấy hoạt động nào.</p>
          </div>
        )}
      </div>
    </div>
  );
}
