import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FilePlus2, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { aggregateExtractedData, calculateMatchSummary, resolveMatchStatus } from '../reconciliationCompare.js';
import { fetchDocumentBatchesWithCache, getCachedBatches, subscribeBatchCache } from '../services/batchCache.js';
import SummaryLine from '../components/overview/SummaryLine.jsx';
import DateRangeFilter from '../components/overview/DateRangeFilter.jsx';
import useChartColors from '../lib/useChartColors.js';
import { getPresetRange, isWithinRange, parseDateInput, toDateInputValue } from '../lib/dateRange.js';
import { formatDateTime } from '../lib/format.js';
import { formatWaiting, getAccountantQueue } from '../lib/overview.js';
import { ROUTES, batchDetail } from '../routes.js';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '../ui/index.js';
import { vi } from '../i18n/vi.js';

const DOC_TYPES = ['po', 'invoice', 'grn'];
// Hổ phách chỉ cho lệch nhỏ (DESIGN.md); thiếu dữ liệu và thiếu chứng từ dùng tông trung tính.
const QUEUE_TONE = { matched: 'success', minor: 'warning', mismatch: 'danger', missing: 'neutral' };

function formatMoney(value) {
  return value === null || Number.isNaN(value) ? '' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
}

function formatDisplayNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function appendDateRangeParams(params, range) {
  if (range.start) params.set('from', toDateInputValue(range.start));
  if (range.end) params.set('to', toDateInputValue(range.end));
}

function getExtraction(file) {
  return file?.ai_extraction?.extracted_data || {};
}

function analyzeBatch(batch) {
  // Một bộ có thể có nhiều file cùng loại (ví dụ 2 phiếu nhập kho): gộp lại như trang Bộ đối soát để tỉ lệ khớp hai nơi trùng nhau.
  const docs = DOC_TYPES.reduce((acc, type) => {
    const files = (batch.files || []).filter((item) => item.doc_type === type);
    if (files.length === 0) acc[type] = null;
    else if (files.length === 1) acc[type] = getExtraction(files[0]);
    else acc[type] = aggregateExtractedData(files, type);
    return acc;
  }, {});
  const summary = calculateMatchSummary(docs);
  const comparisonStatus = summary.status === 'matched' ? 'matched' : summary.status;
  const status = ['approved', 'final_approved', 'rejected'].includes(batch.status)
    ? batch.status
    : comparisonStatus;

  const isReady = DOC_TYPES.every((type) => docs[type]);
  const supplierName = ['invoice', 'po', 'grn'].map((type) => docs[type]?.supplier_name).find(Boolean) || '';
  const total = ['invoice', 'po', 'grn'].map((type) => docs[type]?.total_amount).find((value) => value !== undefined && value !== null && value !== '');
  return {
    id: batch.id,
    isReady,
    supplierName,
    total: total === undefined ? null : Number(total),
    result: resolveMatchStatus(batch.reconciliation_status, summary.status),
    batchNumber: batch.batch_number,
    updatedAt: batch.updated_at || batch.created_at,
    checked: summary.checkedFields,
    matched: summary.matchedFields,
    missing: summary.warningFields,
    mismatch: summary.mismatchFields,
    matchRate: summary.matchRate,
    status,
  };
}

function queueReason(item) {
  const strings = vi.overview.accountantQueue;
  if (item.kind === 'supplement') {
    const missing = item.missing.map((type) => vi.docTypes[type]?.short || type).join(', ');
    return { text: strings.supplement(missing), tone: 'neutral', icon: FilePlus2 };
  }
  if (item.kind === 'rejected') return { text: strings.rejected, tone: 'danger', icon: XCircle };
  return {
    text: strings.review[item.result],
    tone: QUEUE_TONE[item.result],
    icon: item.result === 'matched' || item.result === 'minor' ? CheckCircle2 : AlertTriangle,
  };
}

/** Danh sách việc của kế toán viên: mỗi dòng nói vì sao bộ cần xử lý và dẫn thẳng tới chỗ làm. */
function AccountantQueue({ queue, infoOf, onOpen, onViewAll }) {
  const strings = vi.overview.accountantQueue;
  return (
    <Card>
      <CardHeader title={strings.title} description={strings.description} />
      {queue.items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={strings.empty} description={strings.emptyHint} />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {queue.items.map((item) => {
              const { batch } = item;
              const reason = queueReason(item);
              const action = item.kind === 'supplement' ? strings.supplementAction : strings.view;
              return (
                <li key={batch.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {batch.batch_number}
                      {infoOf(batch)?.supplierName && <span className="font-normal text-fg-muted"> · {infoOf(batch).supplierName}</span>}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {[
                        formatMoney(infoOf(batch)?.total ?? null),
                        item.kind === 'rejected' && batch.rejection_note
                          ? strings.reason(batch.rejection_note)
                          : strings.updated(formatDateTime(batch.updated_at || batch.created_at)),
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge tone={reason.tone} icon={reason.icon}>{reason.text}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-subtle">
                    <Clock size={14} aria-hidden="true" />
                    {strings.waiting(formatWaiting(item.waitingMs))}
                  </span>
                  <Button
                    size="sm"
                    variant={item.kind === 'review' && (item.result === 'matched' || item.result === 'minor') ? 'primary' : 'secondary'}
                    onClick={() => onOpen(item)}
                    aria-label={strings.actionLabel(action, batch.batch_number)}
                  >
                    {action}
                  </Button>
                </li>
              );
            })}
          </ul>
          {queue.total > queue.items.length && (
            <div className="border-t border-line px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onViewAll}>
                {strings.viewAll(queue.total)}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Tổng quan của kế toán viên: việc cần xử lý trước, số liệu sau, biểu đồ cuối trang. */
export default function AccountantOverview({ token }) {
  const navigate = useNavigate();
  const cached = getCachedBatches();
  const [batches, setBatches] = useState(() => cached?.items || []);
  const [preset, setPreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeBatchCache((data) => {
      if (data?.items) {
        setBatches(data.items);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchOverview() {
      try {
        if (!getCachedBatches()) {
          setLoading(true);
        }
        setError('');
        const data = await fetchDocumentBatchesWithCache(token);
        if (isMounted) setBatches(data.items || []);
      } catch (err) {
        if (isMounted && !getCachedBatches()) {
          setError(err.message || 'Không thể tải dữ liệu tổng quan.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchOverview();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const range = useMemo(
    () => (preset === 'custom' ? { start: parseDateInput(customStart, 'start'), end: parseDateInput(customEnd, 'end') } : getPresetRange(preset)),
    [preset, customStart, customEnd],
  );

  const view = useMemo(() => {
    const scoped = batches.filter((batch) => isWithinRange(batch.updated_at || batch.created_at, range));
    const analyzed = new Map(scoped.map((batch) => [batch.id, analyzeBatch(batch)]));
    const resultOf = (batch) => analyzed.get(batch.id)?.result || 'missing';
    const countStatus = (status) => scoped.filter((batch) => batch.status === status).length;
    const judged = [...analyzed.values()].filter((batch) => batch.isReady && batch.status !== 'rejected');
    const countResult = (result) => judged.filter((batch) => batch.result === result).length;
    return {
      queue: getAccountantQueue(scoped, resultOf),
      infoOf: (batch) => analyzed.get(batch.id),
      waitingChief: countStatus('approved'),
      archived: countStatus('final_approved'),
      rejected: countStatus('rejected'),
      chart: { matched: countResult('matched'), minor: countResult('minor'), mismatch: countResult('mismatch'), missing: countResult('missing') },
    };
  }, [batches, range]);

  const chartColors = useChartColors();
  const chartStrings = vi.overview.accountantChart;
  const resultChartData = [
    { name: chartStrings.matched, value: view.chart.matched, fill: chartColors.success },
    { name: chartStrings.minor, value: view.chart.minor, fill: chartColors.warning },
    { name: chartStrings.mismatch, value: view.chart.mismatch, fill: chartColors.danger },
    { name: chartStrings.missing, value: view.chart.missing, fill: chartColors.neutral },
    { name: chartStrings.rejected, value: view.rejected, fill: chartColors.axis },
  ];

  const navigateToBatchFilter = (overviewFilter) => {
    const params = new URLSearchParams({ overviewFilter });
    appendDateRangeParams(params, range);
    navigate(`${ROUTES.batches}?${params.toString()}`);
  };

  const openQueueItem = (item) => {
    if (item.kind === 'supplement') navigate(`${ROUTES.upload}?batchId=${item.batch.id}&mode=supplement`);
    else navigate(batchDetail(item.batch.id));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tone-brand-line border-t-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-tone-danger-line bg-tone-danger-bg px-5 py-4 text-sm font-medium text-tone-danger-fg">
        {error}
      </div>
    );
  }

  const kpi = vi.overview.accountantKpi;
  return (
    <div className="space-y-6">
      <PageHeader
        title={vi.overview.title}
        description={vi.overview.accountantDescription}
        actions={
          <DateRangeFilter
            preset={preset}
            onPresetChange={setPreset}
            start={customStart}
            end={customEnd}
            onStartChange={setCustomStart}
            onEndChange={setCustomEnd}
          />
        }
      />

      <SummaryLine
        label={kpi.label}
        items={[
          { label: kpi.todo, value: formatDisplayNumber(view.queue.total), hint: kpi.todoHint, lead: true },
          { label: kpi.incomplete, value: formatDisplayNumber(view.queue.supplement), hint: kpi.incompleteHint, onClick: () => navigate(ROUTES.upload) },
          { label: kpi.waitingChief, value: formatDisplayNumber(view.waitingChief), onClick: () => navigate(ROUTES.batches) },
          { label: kpi.archived, value: formatDisplayNumber(view.archived), onClick: () => navigateToBatchFilter('matched') },
        ]}
      />

      <AccountantQueue queue={view.queue} infoOf={view.infoOf} onOpen={openQueueItem} onViewAll={() => navigate(ROUTES.batches)} />

      <Card>
        <CardHeader title={chartStrings.title} description={chartStrings.description} />
        <div className="h-[220px] px-3 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={resultChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: chartColors.axis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: chartColors.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip formatter={(value, name) => [formatDisplayNumber(value), name]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
