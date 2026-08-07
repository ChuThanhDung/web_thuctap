import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Eye,
  Bot,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import StatusBadge from '../components/StatusBadge.jsx';
import { getDashboardStats, getReconciliations } from '../services/reconciliations.js';
import { formatVND, formatDate, formatNumber } from '../text.js';

// Demo trend data since API does not provide time-series
const automationTrend = [
  { month: 'T10', autoRate: 45, overrideRate: 55 },
  { month: 'T11', autoRate: 58, overrideRate: 42 },
  { month: 'T12', autoRate: 65, overrideRate: 35 },
  { month: 'T1', autoRate: 72, overrideRate: 28 },
  { month: 'T2', autoRate: 81, overrideRate: 19 },
  { month: 'T3', autoRate: 86, overrideRate: 14 },
];

export default function Dashboard({ token }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [escalatedCases, setEscalatedCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const [statsData, escalatedData] = await Promise.all([
          getDashboardStats(token),
          getReconciliations(token, { status: 'major_diff', page_size: 5 })
        ]);
        setStats(statsData);
        setEscalatedCases(escalatedData.items || []);
      } catch (err) {
        setError(err.message || 'Lỗi khi tải dữ liệu Dashboard');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 text-center text-rose-600 bg-rose-50 rounded-md border border-rose-200">
        {error || 'Không thể tải dữ liệu'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tổng quan đối soát</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Dashboard dành cho Kế toán trưởng · Tháng hiện tại
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={CheckCircle2}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          label="Khớp hoàn toàn"
          value={formatNumber(stats.total_matched)}
          subtext="Tự động xử lý"
        />
        <KPICard
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-100"
          label="Tồn đọng"
          value={formatNumber(stats.total_pending)}
          subtext={formatVND(stats.pending_value)}
          highlight
        />
        <KPICard
          icon={AlertTriangle}
          iconColor="text-rose-600"
          iconBg="bg-rose-100"
          label="Cần chú ý (Lệch/Escalate)"
          value={stats.total_escalated.toString()}
          subtext="Case rủi ro / giá trị lớn"
          highlight
        />
        <KPICard
          icon={Bot}
          iconColor="text-brand-600"
          iconBg="bg-brand-100"
          label="Tỷ lệ khớp"
          value={`${stats.match_rate}%`}
          subtext={`Tổng hồ sơ: ${stats.total_cases}`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Automation Trend */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Tỷ lệ tự động hóa theo thời gian
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={automationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                    fontSize: '13px',
                  }}
                  formatter={(value) => [`${value}%`]}
                />
                <Area
                  type="monotone"
                  dataKey="autoRate"
                  name="Tự động hóa"
                  stroke="#6366f1"
                  fill="#eef2ff"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Override Rate */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Sự can thiệp của con người
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={automationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                    fontSize: '13px',
                  }}
                  formatter={(value) => [`${value}%`]}
                />
                <Bar
                  dataKey="overrideRate"
                  name="Cần can thiệp"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Escalated Cases */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Case rủi ro cao / Lệch lớn
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Những hồ sơ có độ lệch cao (Major Diff) cần duyệt
            </p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
            {escalatedCases.length}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {escalatedCases.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => navigate(`/case/${c.case_number}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">
                    {c.invoice_number || c.case_number}
                  </span>
                  <StatusBadge status={c.status} size="small" />
                  <span className="text-xs text-slate-400">
                    {c.partner_name}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                  {c.ai_note || 'Cần kiểm tra kỹ chênh lệch'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Phân tích lúc {formatDate(c.case_date)}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-900">
                  {formatVND(c.total_amount)}
                </p>
                <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  Xem chi tiết <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
          {escalatedCases.length === 0 && (
             <div className="px-5 py-8 text-center text-sm text-slate-500">
               Không có hồ sơ nào cần duyệt.
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, iconColor, iconBg, label, value, subtext, highlight }) {
  return (
    <div className={`card p-5 ${highlight ? 'ring-1 ring-amber-200' : ''}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
      {subtext && <p className="text-[11px] text-slate-400 mt-1">{subtext}</p>}
    </div>
  );
}
