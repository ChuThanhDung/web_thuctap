import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Eye,
  ChevronDown,
  X,
  Filter,
} from 'lucide-react';
import StatusBadge, { RiskBadge } from '../components/StatusBadge';
import FloatingActionBar from '../components/FloatingActionBar';
import BulkApprovalModal from './BulkApprovalModal';
import { reconciliationCases, formatVND, formatDate } from '../mockData';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'matched', label: 'Khớp hoàn toàn' },
  { value: 'minor_diff', label: 'Chênh lệch nhẹ' },
  { value: 'major_diff', label: 'Cần xem xét' },
  { value: 'low_confidence', label: 'Confidence thấp' },
];

export default function ReconciliationList() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Sort: rủi ro cao trước, nhưng vẫn dễ lọc
  const RISK_ORDER = { high: 0, medium: 1, low: 2 };
  const STATUS_ORDER = { major_diff: 0, low_confidence: 1, minor_diff: 2, matched: 3 };

  const filteredCases = useMemo(() => {
    let cases = [...reconciliationCases];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      cases = cases.filter(
        (c) =>
          c.invoiceNumber.toLowerCase().includes(q) ||
          c.partner.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter) {
      cases = cases.filter((c) => c.status === statusFilter);
    }

    // Sort by risk then status
    cases.sort((a, b) => {
      const riskDiff = (RISK_ORDER[a.riskLevel] ?? 3) - (RISK_ORDER[b.riskLevel] ?? 3);
      if (riskDiff !== 0) return riskDiff;
      return (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
    });

    return cases;
  }, [searchQuery, statusFilter]);

  const pendingCases = filteredCases.filter((c) => !c.processedBy);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingCases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingCases.map((c) => c.id)));
    }
  };

  const selectedCases = filteredCases.filter((c) => selectedIds.has(c.id));
  const totalSelectedValue = selectedCases.reduce((sum, c) => sum + c.totalAmount, 0);

  const handleBulkApprove = () => {
    setShowBulkModal(true);
  };

  const handleConfirmBulk = () => {
    // In production: call API
    alert(`Đã duyệt ${selectedIds.size} hóa đơn thành công!`);
    setSelectedIds(new Set());
    setShowBulkModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Danh sách đối soát</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filteredCases.length} hóa đơn · {pendingCases.length} chờ xử lý
          </p>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[260px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Tìm theo số hóa đơn, đối tác..."
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

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field appearance-none pr-9 min-w-[180px]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>

          {/* Quick filters */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('matched')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                statusFilter === 'matched'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              ✅ Khớp ({reconciliationCases.filter((c) => c.status === 'matched').length})
            </button>
            <button
              onClick={() => setStatusFilter('major_diff')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                statusFilter === 'major_diff'
                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              🔴 Cần xem ({reconciliationCases.filter((c) => c.status === 'major_diff').length})
            </button>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter('')}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                <X size={12} className="inline mr-1" />
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      pendingCases.length > 0 &&
                      selectedIds.size === pendingCases.length
                    }
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Số hóa đơn
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Đối tác
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Ngày
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  Tổng tiền
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Rủi ro
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCases.map((c) => {
                const isSelected = selectedIds.has(c.id);
                const isPending = !c.processedBy;
                return (
                  <tr
                    key={c.id}
                    className={`table-row-hover cursor-pointer ${
                      isSelected ? 'bg-brand-50/50' : ''
                    } ${!isPending ? 'opacity-60' : ''}`}
                    onClick={() => navigate(`/case/${c.id}`)}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPending) toggleSelect(c.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        disabled={!isPending}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.invoiceNumber}</div>
                      <div className="text-xs text-slate-400">{c.id}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="truncate text-slate-700">{c.partner}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDate(c.date)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      {formatVND(c.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} size="small" />
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge level={c.riskLevel} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="Xem chi tiết"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredCases.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-slate-500">Không tìm thấy hóa đơn nào.</p>
          </div>
        )}
      </div>

      {/* Floating action bar for batch */}
      <FloatingActionBar
        selectedCount={selectedIds.size}
        totalValue={totalSelectedValue}
        onApprove={handleBulkApprove}
        onClear={() => setSelectedIds(new Set())}
        formatValue={formatVND}
      />

      {/* Bulk approval modal */}
      {showBulkModal && (
        <BulkApprovalModal
          cases={selectedCases}
          onConfirm={handleConfirmBulk}
          onCancel={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}
