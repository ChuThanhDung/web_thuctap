import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSearch,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDocumentBatches } from '../api.js';
import { calculateMatchSummary } from '../reconciliationCompare.js';
import { repairTextDeep } from '../text.js';

const DOC_TYPES = ['po', 'invoice', 'grn'];
const REVIEW_BATCHES_PER_PAGE = 3;
const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'last_7_days', label: '7 ngày gần nhất' },
  { value: 'last_30_days', label: '30 ngày gần nhất' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'custom', label: 'Tùy chọn khoảng ngày' },
];

function isBatchReady(batch) {
  if (Array.isArray(batch?.missing_doc_types)) return batch.missing_doc_types.length === 0;
  if (batch?.status === 'ready') return true;

  const uploadedTypes = new Set((batch?.files || []).map((file) => file.doc_type).filter(Boolean));
  return DOC_TYPES.every((type) => uploadedTypes.has(type));
}

function formatDisplayNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseBatchDate(value) {
  if (!value) return null;
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateInput(value, boundary) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return boundary === 'end' ? endOfDay(date) : startOfDay(date);
}

function getPresetDateRange(filter) {
  if (filter === 'all' || filter === 'custom') return { start: null, end: null };

  const today = new Date();
  const end = endOfDay(today);

  if (filter === 'today') {
    return { start: startOfDay(today), end };
  }

  if (filter === 'last_7_days') {
    const start = startOfDay(today);
    start.setDate(start.getDate() - 6);
    return { start, end };
  }

  if (filter === 'last_30_days') {
    const start = startOfDay(today);
    start.setDate(start.getDate() - 29);
    return { start, end };
  }

  if (filter === 'this_month') {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  }

  return { start: null, end: null };
}

function getBatchActivityDate(batch) {
  return parseBatchDate(batch?.updated_at || batch?.created_at);
}

function isWithinDateRange(batch, range) {
  if (!range.start && !range.end) return true;
  const date = getBatchActivityDate(batch);
  if (!date) return false;
  
  // So sánh theo ngày, bỏ qua giờ phút giây
  const batchDateOnly = startOfDay(date);
  const rangeStart = range.start ? startOfDay(range.start) : null;
  const rangeEnd = range.end ? startOfDay(range.end) : null;
  
  if (rangeStart && batchDateOnly < rangeStart) return false;
  if (rangeEnd && batchDateOnly > rangeEnd) return false;
  return true;
}

function formatRangeLabel(range) {
  if (!range.start && !range.end) return 'Tất cả thời gian';

  const formatter = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const startLabel = range.start ? formatter.format(range.start) : 'đầu dữ liệu';
  const endLabel = range.end ? formatter.format(range.end) : 'hiện tại';
  return `${startLabel} - ${endLabel}`;
}

function appendDateRangeParams(params, range) {
  if (range.start) params.set('from', toDateInputValue(range.start));
  if (range.end) params.set('to', toDateInputValue(range.end));
}

function getExtraction(file) {
  return file?.ai_extraction?.extracted_data || {};
}

function analyzeBatch(batch) {
  const docs = DOC_TYPES.reduce((acc, type) => {
    const file = (batch.files || []).find((item) => item.doc_type === type);
    acc[type] = file ? getExtraction(file) : null;
    return acc;
  }, {});
  const summary = calculateMatchSummary(docs);

  return {
    id: batch.id,
    batchNumber: batch.batch_number,
    updatedAt: batch.updated_at || batch.created_at,
    checked: summary.checkedFields,
    matched: summary.matchedFields,
    missing: summary.warningFields,
    mismatch: summary.mismatchFields,
    matchRate: summary.matchRate,
    status: summary.status === 'matched' ? 'matched' : 'review',
  };
}

function MetricCard({ icon: Icon, label, value, detail, tone, onClick }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_3px_rgba(0,55,112,0.08)] transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_16px_36px_rgba(0,55,112,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800 dark:hover:shadow-[0_16px_36px_rgba(0,0,0,0.28)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950 dark:text-slate-100">{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </Component>
  );
}

export default function AccountantOverview({ token }) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [reviewPage, setReviewPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function fetchOverview() {
      try {
        setLoading(true);
        setError('');
        const data = repairTextDeep(await getDocumentBatches(token));
        if (isMounted) setBatches(data.items || []);
      } catch (err) {
        if (isMounted) setError(err.message || 'Không thể tải dữ liệu tổng quan.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchOverview();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const activeDateRange = useMemo(() => {
    if (dateFilter === 'custom') {
      return {
        start: parseDateInput(customStartDate, 'start'),
        end: parseDateInput(customEndDate, 'end'),
      };
    }

    return getPresetDateRange(dateFilter);
  }, [customEndDate, customStartDate, dateFilter]);

  const filteredBatches = useMemo(() => (
    batches.filter((batch) => isWithinDateRange(batch, activeDateRange))
  ), [activeDateRange, batches]);

  const activeRangeLabel = useMemo(() => formatRangeLabel(activeDateRange), [activeDateRange]);

  const summary = useMemo(() => {
    const readyBatches = filteredBatches.filter(isBatchReady).map(analyzeBatch);
    const matched = readyBatches.filter((batch) => batch.status === 'matched').length;
    const review = readyBatches.filter((batch) => batch.status === 'review').length;
    const missingData = readyBatches.filter((batch) => batch.status === 'review' && batch.missing > 0).length;
    const mismatch = readyBatches.filter((batch) => batch.status === 'review' && batch.mismatch > 0).length;

    return {
      total: readyBatches.length,
      matched,
      review,
      missingData,
      mismatch,
      incomplete: filteredBatches.filter((batch) => !isBatchReady(batch)).length,
      readyBatches,
      avgMatchRate: readyBatches.length
        ? Math.round(readyBatches.reduce((sum, batch) => sum + batch.matchRate, 0) / readyBatches.length)
        : 0,
    };
  }, [filteredBatches]);

  const statusChartData = [
    { name: 'Đã khớp', value: summary.matched, color: '#14b8a6' },
    { name: 'Cần xem', value: summary.review, color: '#f59e0b' },
  ];

  const fieldChartData = [
    { name: 'Khớp hoàn toàn', value: summary.matched, fill: '#14b8a6' },
    { name: 'Thiếu dữ liệu', value: summary.missingData, fill: '#f59e0b' },
    { name: 'Lệch', value: summary.mismatch, fill: '#fb7185' },
  ];

  const reviewBatches = useMemo(() => (
    summary.readyBatches.filter((batch) => batch.status === 'review')
  ), [summary.readyBatches]);
  const totalReviewPages = Math.max(1, Math.ceil(reviewBatches.length / REVIEW_BATCHES_PER_PAGE));
  const safeReviewPage = Math.min(reviewPage, totalReviewPages);
  const reviewStartIndex = reviewBatches.length === 0
    ? 0
    : (safeReviewPage - 1) * REVIEW_BATCHES_PER_PAGE + 1;
  const reviewEndIndex = Math.min(safeReviewPage * REVIEW_BATCHES_PER_PAGE, reviewBatches.length);
  const paginatedReviewBatches = reviewBatches.slice(
    (safeReviewPage - 1) * REVIEW_BATCHES_PER_PAGE,
    safeReviewPage * REVIEW_BATCHES_PER_PAGE
  );

  useEffect(() => {
    setReviewPage(1);
  }, [activeDateRange]);

  useEffect(() => {
    if (reviewPage > totalReviewPages) {
      setReviewPage(totalReviewPages);
    }
  }, [reviewPage, totalReviewPages]);

  const navigateToBatchFilter = (overviewFilter) => {
    const params = new URLSearchParams({ overviewFilter });
    appendDateRangeParams(params, activeDateRange);
    navigate(`/audit-trail?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tổng Quan</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Theo dõi tình trạng xử lý chứng từ và các batch cần ưu tiên xem lại.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Tỉ lệ khớp trung bình: {summary.avgMatchRate}%
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
              <CalendarDays size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Khoảng thời gian</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Đang xem dữ liệu: {activeRangeLabel}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(190px,220px)_minmax(140px,1fr)_minmax(140px,1fr)] lg:w-auto">
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="input-field h-10 rounded-md text-sm"
            >
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={customStartDate}
              onChange={(event) => {
                setDateFilter('custom');
                setCustomStartDate(event.target.value);
              }}
              max={customEndDate || undefined}
              className="input-field h-10 rounded-md text-sm"
              aria-label="Từ ngày"
            />

            <input
              type="date"
              value={customEndDate}
              onChange={(event) => {
                setDateFilter('custom');
                setCustomEndDate(event.target.value);
              }}
              min={customStartDate || undefined}
              max={toDateInputValue(new Date())}
              className="input-field h-10 rounded-md text-sm"
              aria-label="Đến ngày"
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={ClipboardList} label="Tổng hồ sơ" value={formatDisplayNumber(summary.total)} detail="Batch đã đủ PO, Invoice và GRN trong khoảng lọc" tone="brand" onClick={() => navigateToBatchFilter('ready')} />
        <MetricCard icon={CheckCircle2} label="Đã khớp" value={formatDisplayNumber(summary.matched)} detail="Batch có tỉ lệ khớp 100%" tone="emerald" onClick={() => navigateToBatchFilter('matched')} />
        <MetricCard icon={AlertTriangle} label="Cần xem" value={formatDisplayNumber(summary.review)} detail="Batch chưa khớp hoặc còn thiếu dữ liệu" tone="amber" onClick={() => navigateToBatchFilter('review')} />
        <MetricCard icon={FileSearch} label="Batch chưa có hồ sơ" value={formatDisplayNumber(summary.incomplete)} detail="Batch còn thiếu PO, Invoice hoặc GRN trong khoảng lọc" tone="brand" onClick={() => navigate('/upload')} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Phân bổ trạng thái</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tỷ trọng hồ sơ đã khớp và cần xem.</p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusChartData} cx="50%" cy="50%" dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4}>
                  {statusChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [formatDisplayNumber(value), name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {statusChartData.map((item) => (
              <div key={item.name} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.name}</span>
                </div>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Thống kê theo batch</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Số lượng batch khớp hoàn toàn, thiếu dữ liệu hoặc có chênh lệch.</p>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fieldChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(value, name) => [formatDisplayNumber(value), name]} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Hồ sơ cần xem</h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {reviewBatches.length > 0
              ? `Hiển thị ${reviewStartIndex}-${reviewEndIndex} / ${reviewBatches.length} hồ sơ`
              : '0 hồ sơ'}
          </span>
        </div>
        {paginatedReviewBatches.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginatedReviewBatches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => navigate(`/audit-trail?batchId=${batch.id}`)}
                className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset dark:hover:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{batch.batchNumber}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Cập nhật: {batch.updatedAt}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {batch.matchRate}% khớp
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {batch.mismatch} lệch · {batch.missing} thiếu dữ liệu
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Chưa có hồ sơ nào cần xem.
          </div>
        )}
        {reviewBatches.length > REVIEW_BATCHES_PER_PAGE && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mỗi trang hiển thị {REVIEW_BATCHES_PER_PAGE} hồ sơ cần xem
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                disabled={safeReviewPage === 1}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Trước
              </button>
              <span className="min-w-[76px] text-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                Trang {safeReviewPage}/{totalReviewPages}
              </span>
              <button
                type="button"
                onClick={() => setReviewPage((page) => Math.min(totalReviewPages, page + 1))}
                disabled={safeReviewPage === totalReviewPages}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
