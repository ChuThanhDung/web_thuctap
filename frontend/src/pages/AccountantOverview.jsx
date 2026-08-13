import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  ShieldAlert,
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
import { repairTextDeep } from '../text.js';

const DOC_TYPES = ['po', 'invoice', 'grn'];
const COMPARE_FIELDS = ['supplier_name', 'supplier_tax_id', 'vat_rate_pct', 'total_amount'];

function isBatchReady(batch) {
  if (Array.isArray(batch?.missing_doc_types)) return batch.missing_doc_types.length === 0;
  if (batch?.status === 'ready') return true;

  const uploadedTypes = new Set((batch?.files || []).map((file) => file.doc_type).filter(Boolean));
  return DOC_TYPES.every((type) => uploadedTypes.has(type));
}

function formatDisplayNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function getExtraction(file) {
  return file?.ai_extraction?.extracted_data || {};
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim().toLowerCase();
}

function findItemByIdentity(items, sourceItem, index) {
  if (sourceItem?.sku) {
    const found = items.find((item) => item?.sku && item.sku === sourceItem.sku);
    if (found) return found;
  }
  return items[index] || {};
}

function compareValues(values) {
  const normalized = values.map(normalizeValue);
  const present = normalized.filter(Boolean);
  if (present.length < values.length) return 'missing';
  return present.every((value) => value === present[0]) ? 'matched' : 'mismatch';
}

function analyzeBatch(batch) {
  const docs = DOC_TYPES.reduce((acc, type) => {
    const file = (batch.files || []).find((item) => item.doc_type === type);
    acc[type] = file ? getExtraction(file) : null;
    return acc;
  }, {});

  let checked = 0;
  let matched = 0;
  let missing = 0;
  let mismatch = 0;

  COMPARE_FIELDS.forEach((field) => {
    checked += 1;
    const result = compareValues(DOC_TYPES.map((type) => docs[type]?.[field]));
    if (result === 'matched') matched += 1;
    if (result === 'missing') missing += 1;
    if (result === 'mismatch') mismatch += 1;
  });

  const poItems = docs.po?.line_items || [];
  const invoiceItems = docs.invoice?.line_items || [];
  const grnItems = docs.grn?.line_items || [];
  const maxLineCount = Math.max(poItems.length, invoiceItems.length, grnItems.length);

  Array.from({ length: maxLineCount }).forEach((_, index) => {
    const baseItem = poItems[index] || invoiceItems[index] || grnItems[index] || {};
    const poItem = findItemByIdentity(poItems, baseItem, index);
    const invoiceItem = findItemByIdentity(invoiceItems, baseItem, index);
    const grnItem = findItemByIdentity(grnItems, baseItem, index);

    [
      [poItem.qty, invoiceItem.qty, grnItem.qty],
      [poItem.price, invoiceItem.price, grnItem.price],
    ].forEach((values) => {
      checked += 1;
      const result = compareValues(values);
      if (result === 'matched') matched += 1;
      if (result === 'missing') missing += 1;
      if (result === 'mismatch') mismatch += 1;
    });
  });

  const matchRate = checked === 0 ? 0 : Math.round((matched / checked) * 100);

  return {
    id: batch.id,
    batchNumber: batch.batch_number,
    updatedAt: batch.updated_at || batch.created_at,
    checked,
    matched,
    missing,
    mismatch,
    matchRate,
    status: matchRate === 100 ? 'matched' : 'review',
  };
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,55,112,0.08)] transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_16px_36px_rgba(0,55,112,0.16)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800 dark:hover:shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
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
    </div>
  );
}

export default function AccountantOverview({ token }) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
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

  const summary = useMemo(() => {
    const readyBatches = batches.filter(isBatchReady).map(analyzeBatch);
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
      highRisk: 0,
      incomplete: batches.filter((batch) => !isBatchReady(batch)).length,
      readyBatches,
      avgMatchRate: readyBatches.length
        ? Math.round(readyBatches.reduce((sum, batch) => sum + batch.matchRate, 0) / readyBatches.length)
        : 0,
    };
  }, [batches]);

  const statusChartData = [
    { name: 'Đã khớp', value: summary.matched, color: '#14b8a6' },
    { name: 'Cần xem', value: summary.review, color: '#f59e0b' },
    { name: 'Rủi ro cao', value: summary.highRisk, color: '#fb7185' },
  ];

  const fieldChartData = [
    { name: 'Khớp hoàn toàn', value: summary.matched, fill: '#14b8a6' },
    { name: 'Thiếu dữ liệu', value: summary.missingData, fill: '#f59e0b' },
    { name: 'Lệch', value: summary.mismatch, fill: '#fb7185' },
  ];

  const recentReviewBatches = summary.readyBatches
    .filter((batch) => batch.status === 'review')
    .slice(0, 5);

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
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Tỉ lệ khớp trung bình: {summary.avgMatchRate}%
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard icon={ClipboardList} label="Tổng hồ sơ" value={formatDisplayNumber(summary.total)} detail="Tất cả batch đã đủ PO, Invoice và GRN" tone="brand" />
        <MetricCard icon={CheckCircle2} label="Đã khớp" value={formatDisplayNumber(summary.matched)} detail="Batch có tỉ lệ khớp 100%" tone="emerald" />
        <MetricCard icon={AlertTriangle} label="Cần xem" value={formatDisplayNumber(summary.review)} detail="Batch chưa khớp hoặc còn thiếu dữ liệu" tone="amber" />
        <MetricCard icon={ShieldAlert} label="Rủi ro cao" value={formatDisplayNumber(summary.highRisk)} detail="Sẽ cập nhật khi có luồng xử lý rủi ro" tone="rose" />
        <MetricCard icon={FileSearch} label="Batch chưa đủ hồ sơ" value={formatDisplayNumber(summary.incomplete)} detail="Batch còn thiếu PO, Invoice hoặc GRN" tone="brand" />
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
          <div className="grid grid-cols-3 gap-2">
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
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Hồ sơ cần xem</h2>
        </div>
        {recentReviewBatches.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentReviewBatches.map((batch) => (
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
      </section>
    </div>
  );
}
