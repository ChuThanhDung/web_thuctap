import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, Inbox, Percent, XCircle } from 'lucide-react';
import DateRangeFilter from '../components/overview/DateRangeFilter.jsx';
import { ResultDonut, TimelineChart } from '../components/overview/OverviewCharts.jsx';
import { vi } from '../i18n/vi.js';
import { batchDetail, batchesWithStatus } from '../routes.js';
import { getPresetRange, parseDateInput } from '../lib/dateRange.js';
import { formatDateTime, formatVND } from '../lib/format.js';
import {
  OVERDUE_DAYS,
  buildActivity,
  buildTimeline,
  filterByRange,
  formatWaiting,
  getAttention,
  getPendingQueue,
  groupByAccountant,
  summarize,
} from '../lib/overview.js';
import useBatches from '../lib/useBatches.js';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatCard } from '../ui/index.js';

const TIMELINE_DAYS = 14;

function Skeleton({ className }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-card bg-surface-muted motion-reduce:animate-none ${className}`} />;
}

function LoadingState() {
  return (
    <div role="status" aria-label={vi.common.loading} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function QueueCard({ queue, onOpen, onViewAll }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title={vi.overview.queue.title} description={vi.overview.queue.description} />
      {queue.items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={vi.overview.queue.empty} description={vi.overview.queue.emptyHint} />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {queue.items.map(({ batch, waitingMs, overdue }) => (
              <li key={batch.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{batch.batch_number}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {vi.overview.queue.by(batch.created_by_name || vi.common.system)} · {formatDateTime(batch.updated_at || batch.created_at)}
                  </p>
                </div>
                <Badge tone={overdue ? 'danger' : 'neutral'} icon={overdue ? AlertTriangle : Clock}>
                  {overdue ? vi.overview.queue.overdue(formatWaiting(waitingMs)) : vi.overview.queue.waiting(formatWaiting(waitingMs))}
                </Badge>
                <Button size="sm" variant="primary" onClick={() => onOpen(batch.id)} aria-label={vi.overview.queue.viewLabel(batch.batch_number)}>
                  {vi.overview.queue.view}
                </Button>
              </li>
            ))}
          </ul>
          {queue.total > queue.items.length && (
            <div className="border-t border-line px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onViewAll}>
                {vi.overview.queue.viewAll(queue.total)}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function AttentionRow({ icon: Icon, tone, label, value, detail, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <Badge tone={tone} icon={Icon} className="shrink-0">
          {label}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-right text-sm text-fg">
          <span className="font-semibold tabular-nums">{value}</span>
          {detail && <span className="block truncate text-xs text-fg-muted">{detail}</span>}
        </span>
      </button>
    </li>
  );
}

function AttentionCard({ attention, onOpen, onFilter }) {
  const { largestDiff, overdueCount, rejectedCount } = attention;
  const rows = [];
  if (largestDiff) {
    rows.push(
      <AttentionRow
        key="diff"
        icon={AlertTriangle}
        tone="warning"
        label={vi.overview.attention.largestDiff}
        value={formatVND(largestDiff.amount)}
        detail={largestDiff.batch.batch_number}
        onClick={() => onOpen(largestDiff.batch.id)}
      />,
    );
  }
  if (overdueCount > 0) {
    rows.push(
      <AttentionRow
        key="overdue"
        icon={Clock}
        tone="danger"
        label={vi.overview.attention.overdue(OVERDUE_DAYS)}
        value={vi.overview.attention.overdueCount(overdueCount)}
        onClick={() => onFilter('unapproved')}
      />,
    );
  }
  if (rejectedCount > 0) {
    rows.push(
      <AttentionRow
        key="rejected"
        icon={XCircle}
        tone="danger"
        label={vi.overview.attention.rejected}
        value={vi.overview.attention.rejectedCount(rejectedCount)}
        onClick={() => onFilter('rejected')}
      />,
    );
  }

  return (
    <Card>
      <CardHeader title={vi.overview.attention.title} description={vi.overview.attention.description} />
      {rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-fg-muted">{vi.overview.attention.none}</p> : <ul className="divide-y divide-line">{rows}</ul>}
    </Card>
  );
}

function ActivityCard({ events }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title={vi.overview.activity.title} description={vi.overview.activity.description} />
      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-fg-muted">{vi.overview.activity.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event, index) => (
            <li key={`${event.batchId}-${event.kind}-${index}`} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="min-w-0 truncate text-sm text-fg">
                {vi.overview.activity[event.kind](event.actor || (event.kind === 'rejected' ? null : vi.common.system), event.batchNumber)}
              </span>
              <time dateTime={event.date.toISOString()} className="shrink-0 text-xs text-fg-muted">
                {formatDateTime(event.date)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AccountantsCard({ rows }) {
  return (
    <Card>
      <CardHeader title={vi.overview.accountants.title} description={vi.overview.accountants.description} />
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-fg-muted">{vi.overview.accountants.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={row.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{row.name}</span>
              <span className="shrink-0 text-right text-xs text-fg-muted">
                <span className="block font-semibold tabular-nums text-fg">{vi.overview.accountants.sets(row.total)}</span>
                {vi.overview.accountants.rate(row.matchRate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Tổng quan của kế toán trưởng: việc cần duyệt, điểm cần chú ý, xu hướng và hoạt động gần đây. */
export default function ChiefOverview({ token }) {
  const navigate = useNavigate();
  const { batches, loading, error, reload } = useBatches(token);
  const [preset, setPreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = useMemo(
    () => (preset === 'custom' ? { start: parseDateInput(customStart, 'start'), end: parseDateInput(customEnd, 'end') } : getPresetRange(preset)),
    [preset, customStart, customEnd],
  );

  const view = useMemo(() => {
    const scoped = filterByRange(batches, range);
    const now = new Date();
    return {
      summary: summarize(scoped),
      queue: getPendingQueue(scoped, now),
      attention: getAttention(scoped, now),
      timeline: buildTimeline(scoped, { days: TIMELINE_DAYS, endDate: range.end || now }),
      activity: buildActivity(scoped),
      accountants: groupByAccountant(scoped),
    };
  }, [batches, range]);

  const openBatch = (id) => navigate(batchDetail(id));
  const openFilter = (status) => navigate(batchesWithStatus(status));
  const { summary } = view;

  const header = (
    <PageHeader
      title={vi.overview.title}
      description={vi.overview.chiefDescription}
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
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title={error}
            action={
              <Button variant="primary" onClick={reload}>
                {vi.overview.retry}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState icon={Inbox} title={vi.overview.empty.title} description={vi.overview.empty.description} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <section aria-label={vi.overview.title} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={vi.overview.kpi.pending}
          value={summary.pending}
          hint={vi.overview.kpi.pendingHint}
          icon={ClipboardList}
          tone="brand"
          onClick={() => openFilter('unapproved')}
          className="border-primary ring-1 ring-primary"
        />
        <StatCard
          label={vi.overview.kpi.approved}
          value={summary.approved}
          hint={vi.overview.kpi.approvedHint}
          icon={CheckCircle2}
          tone="success"
          onClick={() => openFilter('approved')}
        />
        <StatCard
          label={vi.overview.kpi.rejected}
          value={summary.rejected}
          hint={vi.overview.kpi.rejectedHint}
          icon={XCircle}
          tone="danger"
          onClick={() => openFilter('rejected')}
        />
        <StatCard
          label={vi.overview.kpi.matchRate}
          value={summary.matchRate === null ? '—' : `${summary.matchRate}%`}
          hint={summary.matchRate === null ? vi.overview.kpi.matchRateEmpty : vi.overview.kpi.matchRateHint(summary.judged)}
          icon={Percent}
          tone="info"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <QueueCard queue={view.queue} onOpen={openBatch} onViewAll={() => openFilter('unapproved')} />
        <AttentionCard attention={view.attention} onOpen={openBatch} onFilter={openFilter} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={vi.overview.timeline.title} description={vi.overview.timeline.description(TIMELINE_DAYS)} />
          <TimelineChart buckets={view.timeline} />
        </Card>
        <Card>
          <CardHeader title={vi.overview.result.title} description={vi.overview.result.description} />
          <ResultDonut verdicts={summary.verdicts} matchRate={summary.matchRate} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityCard events={view.activity} />
        <AccountantsCard rows={view.accountants} />
      </div>
    </div>
  );
}
