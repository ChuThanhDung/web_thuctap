import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  FileCheck2,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import StatusBadge, { RiskBadge } from '../components/StatusBadge.jsx';
import FloatingActionBar from '../components/FloatingActionBar.jsx';
import BulkApprovalModal from './BulkApprovalModal.jsx';
import { getReconciliations } from '../services/reconciliations.js';
import { formatVND, formatDate } from '../text.js';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'matched', label: 'Khớp hoàn toàn' },
  { value: 'minor_diff', label: 'Chênh lệch nhẹ' },
  { value: 'major_diff', label: 'Cần xem xét' },
  { value: 'low_confidence', label: 'Confidence thấp' },
];

function SummaryCard({ icon: Icon, label, value, detail, tone = 'slate', loading = false }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 ring-brand-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-100',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">{label}</p>
          {loading ? (
             <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
          ) : (
            <p className="mt-2 text-2xl font-light tracking-[-0.2px] text-slate-950">{value}</p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${tones[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
      {loading ? (
        <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-3 text-sm text-slate-500">{detail}</p>
      )}
    </div>
  );
}

export default function ReconciliationList({ token }) {
  const navigate = useNavigate();
  
  // States
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError('');
        // Ở thực tế nếu có API query search thì truyền vào params
        const response = await getReconciliations(token, {
          status: statusFilter,
          page_size: 100, // Demo load nhiều
        });
        setData(response);
      } catch (err) {
        setError(err.message || 'Lỗi khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, statusFilter]);

  const filteredCases = useMemo(() => {
    let cases = [...data.items];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      cases = cases.filter(
        (c) =>
          c.invoice_number?.toLowerCase().includes(q) ||
          c.partner_name?.toLowerCase().includes(q) ||
          c.case_number?.toLowerCase().includes(q)
      );
    }
    return cases;
  }, [data.items, searchQuery]);

  // Derived stats
  const pendingCases = filteredCases.filter((c) => !c.processed_by_name && !c.decision);
  const matchedCount = data.items.filter((c) => c.status === 'matched').length;
  const reviewCount = data.items.filter((c) => c.status === 'major_diff').length;
  const highRiskCount = data.items.filter((c) => c.risk_level === 'high').length;
  const pendingValue = pendingCases.reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0);

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
  const totalSelectedValue = selectedCases.reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0);

  const handleConfirmBulk = () => {
    alert(`Đã duyệt ${selectedIds.size} hóa đơn thành công!`);
    setSelectedIds(new Set());
    setShowBulkModal(false);
    // TODO: Tương lai có thể gọi API duyệt hàng loạt
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-brand-600">
            Không gian kế toán viên
          </p>
          <h1 className="mt-2 text-3xl font-light tracking-[-0.4px] text-slate-950">
            Danh sách đối soát
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ưu tiên hóa đơn rủi ro cao, lọc nhanh theo trạng thái và xử lý hàng loạt.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 shadow-[0_1px_3px_rgba(0,55,112,0.08)]">
          {data.total} hóa đơn · {pendingCases.length} chờ xử lý
        </div>
      </header>
      
      {error && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={FileCheck2}
          label="Tổng hồ sơ"
          value={data.total}
          detail={`${pendingCases.length} hồ sơ còn mở`}
          tone="brand"
          loading={loading}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Đã khớp"
          value={matchedCount}
          detail="Có thể duyệt nhanh"
          tone="emerald"
          loading={loading}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Cần xem"
          value={reviewCount}
          detail="Ưu tiên kiểm tra trước"
          tone="rose"
          loading={loading}
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Rủi ro cao"
          value={highRiskCount}
          detail={`Giá trị chờ: ${formatVND(pendingValue)}`}
          tone="amber"
          loading={loading}
        />
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Tìm theo số hóa đơn, đối tác, mã hồ sơ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field h-11 rounded-md pl-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field h-11 min-w-[190px] appearance-none rounded-md pr-10"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('matched')}
              className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all ${
                statusFilter === 'matched'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 size={16} />
              Khớp
            </button>
            <button
              onClick={() => setStatusFilter('major_diff')}
              className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all ${
                statusFilter === 'major_diff'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Clock3 size={16} />
              Cần xem
            </button>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter('')}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                <X size={15} />
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="w-12 px-5 py-4">
                  <input
                    type="checkbox"
                    checked={pendingCases.length > 0 && selectedIds.size === pendingCases.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Số hóa đơn
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Đối tác
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Ngày
                </th>
                <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Tổng tiền
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Trạng thái
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Rủi ro
                </th>
                <th className="w-12 px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && data.items.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 w-4 rounded bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-48 rounded bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="ml-auto h-4 w-24 rounded bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-20 rounded-full bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-16 rounded-full bg-slate-200" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-6 rounded-full bg-slate-200" /></td>
                  </tr>
                ))
              ) : filteredCases.length > 0 ? (
                filteredCases.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  const isPending = !c.processed_by_name && !c.decision;

                  return (
                    <tr
                      key={c.id}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        isSelected ? 'bg-brand-50/60' : ''
                      } ${!isPending ? 'opacity-60' : ''}`}
                      onClick={() => navigate(`/case/${c.case_number}`)}
                    >
                      <td
                        className="px-5 py-4"
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
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-950">{c.invoice_number}</div>
                        <div className="mt-1 text-xs font-medium text-slate-400">{c.case_number}</div>
                      </td>
                      <td className="max-w-[260px] px-5 py-4">
                        <div className="truncate text-slate-700">{c.partner_name}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(c.case_date)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-950 tabular-nums">
                        {formatVND(c.total_amount)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={c.status} size="small" />
                      </td>
                      <td className="px-5 py-4">
                        <RiskBadge level={c.risk_level} />
                      </td>
                      <td className="px-5 py-4">
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-500">
                    Không tìm thấy hóa đơn nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <FloatingActionBar
        selectedCount={selectedIds.size}
        totalValue={totalSelectedValue}
        onApprove={() => setShowBulkModal(true)}
        onClear={() => setSelectedIds(new Set())}
        formatValue={formatVND}
      />

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
