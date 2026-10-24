import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi as vitest } from 'vitest';
import { getPresetRange, isWithinRange, parseDateInput, toDateInputValue } from '../lib/dateRange.js';
import {
  buildActivity,
  buildTimeline,
  filterByRange,
  formatWaiting,
  getAttention,
  getPendingQueue,
  groupByAccountant,
  summarize,
} from '../lib/overview.js';

const NOW = new Date(2026, 9, 14, 12, 0, 0); // 14/10/2026 12:00

function batch(overrides = {}) {
  return {
    id: 1,
    batch_number: 'BATCH_01',
    status: 'ready',
    missing_doc_types: [],
    pending_extraction_doc_types: [],
    reconciliation_status: 'matched',
    reconciliation_diff_amount: null,
    created_by_name: 'Nguyễn Thị Lan',
    created_at: '2026-10-13 09:00:00',
    updated_at: '2026-10-13 09:00:00',
    history: [],
    ...overrides,
  };
}

describe('dateRange', () => {
  it('builds presets around today and compares by calendar day', () => {
    const week = getPresetRange('last_7_days', NOW);
    expect(toDateInputValue(week.start)).toBe('2026-10-08');
    expect(toDateInputValue(week.end)).toBe('2026-10-14');
    expect(isWithinRange('2026-10-14 23:59:00', week)).toBe(true);
    expect(isWithinRange('2026-10-07 23:59:00', week)).toBe(false);
    expect(getPresetRange('all', NOW)).toEqual({ start: null, end: null });
    expect(isWithinRange('anything', { start: null, end: null })).toBe(true);
  });

  it('parses date inputs to the start or end of the day', () => {
    expect(parseDateInput('2026-10-14', 'end').getHours()).toBe(23);
    expect(parseDateInput('', 'start')).toBeNull();
  });
});

describe('summarize', () => {
  it('uses the backend verdict and counts approval stages', () => {
    const result = summarize([
      batch({ id: 1, status: 'approved' }),
      batch({ id: 2, status: 'final_approved' }),
      batch({ id: 3, status: 'rejected', reconciliation_status: 'major_diff' }),
      batch({ id: 4, status: 'incomplete', missing_doc_types: ['grn'], reconciliation_status: null }),
    ]);
    expect(result).toMatchObject({ pending: 1, approved: 1, rejected: 1, judged: 3, matchRate: 67 });
    expect(result.verdicts).toEqual({ matched: 2, mismatch: 1, missing_docs: 1, processing: 0 });
  });

  it('does not call an already-decided batch without a verdict "processing"', () => {
    const result = summarize([batch({ status: 'final_approved', reconciliation_status: null }), batch({ id: 2, status: 'ready', reconciliation_status: null })]);
    expect(result.verdicts.processing).toBe(1);
  });

  it('has no match rate until something has a verdict', () => {
    expect(summarize([]).matchRate).toBeNull();
    expect(summarize([batch({ status: 'incomplete', missing_doc_types: ['po'], reconciliation_status: null })]).matchRate).toBeNull();
  });
});

describe('pending queue and attention', () => {
  const batches = [
    batch({ id: 1, batch_number: 'NEW', status: 'approved', updated_at: '2026-10-14 08:00:00' }),
    batch({ id: 2, batch_number: 'OLD', status: 'approved', updated_at: '2026-10-10 08:00:00', reconciliation_diff_amount: '4200000' }),
    batch({ id: 3, batch_number: 'DONE', status: 'final_approved', reconciliation_diff_amount: '9000000' }),
    batch({ id: 4, status: 'rejected' }),
  ];

  it('lists the longest-waiting batch first and flags overdue ones', () => {
    const queue = getPendingQueue(batches, NOW);
    expect(queue.items.map((item) => item.batch.batch_number)).toEqual(['OLD', 'NEW']);
    expect(queue.items.map((item) => item.overdue)).toEqual([true, false]);
    expect(queue.total).toBe(2);
    expect(getPendingQueue(batches, NOW, 1).items).toHaveLength(1);
  });

  it('formats waiting time in the largest sensible unit', () => {
    expect(formatWaiting(10 * 60 * 1000)).toBe('dưới 1 giờ');
    expect(formatWaiting(5 * 3600 * 1000)).toBe('5 giờ');
    expect(formatWaiting(3 * 24 * 3600 * 1000)).toBe('3 ngày');
  });

  it('reports the largest open difference (ignoring already-approved batches), overdue and rejected counts', () => {
    const attention = getAttention(batches, NOW);
    expect(attention.largestDiff.batch.batch_number).toBe('OLD');
    expect(attention.largestDiff.amount).toBe(4200000);
    expect(attention.overdueCount).toBe(1);
    expect(attention.rejectedCount).toBe(1);
  });
});

describe('timeline, activity and accountants', () => {
  it('buckets batches by day over the requested window', () => {
    const buckets = buildTimeline(
      [
        batch({ id: 1, updated_at: '2026-10-14 09:00:00' }),
        batch({ id: 2, updated_at: '2026-10-14 10:00:00', reconciliation_status: 'minor_diff' }),
        batch({ id: 3, updated_at: '2026-10-13 10:00:00', status: 'rejected' }),
        batch({ id: 4, updated_at: '2026-09-01 10:00:00' }), // ngoài cửa sổ
      ],
      { days: 3, endDate: NOW },
    );
    expect(buckets).toHaveLength(3);
    expect(buckets.map((b) => [b.matched, b.mismatch, b.rejected])).toEqual([[0, 0, 0], [0, 0, 1], [1, 1, 0]]);
  });

  it('builds a newest-first feed from current state and saved rejections', () => {
    const events = buildActivity([
      batch({ id: 1, batch_number: 'A', status: 'final_approved', chief_approved_by_name: 'Trần Văn Minh', updated_at: '2026-10-14 10:00:00' }),
      batch({
        id: 2,
        batch_number: 'B',
        status: 'approved',
        approved_by_name: 'Nguyễn Thị Lan',
        updated_at: '2026-10-12 10:00:00',
        history: [{ rejected_at: '2026-10-11 09:00:00', rejected_by_name: 'Trần Văn Minh' }],
      }),
    ]);
    expect(events.map((event) => [event.batchNumber, event.kind])).toEqual([
      ['A', 'final_approved'],
      ['B', 'approved'],
      ['B', 'rejected'],
    ]);
    expect(buildActivity([batch(), batch({ id: 2 }), batch({ id: 3 })], 2)).toHaveLength(2);
  });

  it('groups by creator with a match rate over judged batches only', () => {
    const rows = groupByAccountant([
      batch({ id: 1 }),
      batch({ id: 2, reconciliation_status: 'major_diff' }),
      batch({ id: 3, created_by_name: 'Lê Văn B', status: 'incomplete', missing_doc_types: ['po'], reconciliation_status: null }),
    ]);
    expect(rows[0]).toMatchObject({ name: 'Nguyễn Thị Lan', total: 2, matchRate: 50 });
    expect(rows[1]).toMatchObject({ name: 'Lê Văn B', total: 1, matchRate: null });
  });

  it('filters by range using the last update', () => {
    const range = getPresetRange('today', NOW);
    expect(filterByRange([batch({ updated_at: '2026-10-14 08:00:00' }), batch({ updated_at: '2026-10-13 08:00:00' })], range)).toHaveLength(1);
  });
});

const useBatches = vitest.hoisted(() => vitest.fn());
vitest.mock('../lib/useBatches.js', () => ({ default: useBatches }));
const navigate = vitest.hoisted(() => vitest.fn());
vitest.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigate }));

import ChiefOverview from '../pages/ChiefOverview.jsx';

describe('ChiefOverview', () => {
  const recent = new Date();
  const stamp = (offsetDays) => {
    const date = new Date(recent);
    date.setDate(date.getDate() - offsetDays);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  };

  beforeEach(() => {
    navigate.mockClear();
    useBatches.mockReturnValue({
      loading: false,
      error: '',
      reload: vitest.fn(),
      batches: [
        batch({ id: 7, batch_number: 'BATCH_OLD', status: 'approved', updated_at: stamp(5), approved_by_name: 'Nguyễn Thị Lan', reconciliation_diff_amount: '4200000' }),
        batch({ id: 8, batch_number: 'BATCH_DONE', status: 'final_approved', updated_at: stamp(1), chief_approved_by_name: 'Trần Văn Minh' }),
      ],
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ChiefOverview token="t" />
      </MemoryRouter>,
    );
  }

  it('shows one H1, the four KPIs and the work queue with an overdue flag', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chờ bạn duyệt/ })).toHaveTextContent('1');
    expect(screen.getByText('Tỷ lệ khớp')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cần xử lý ngay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem BATCH_OLD' })).toBeInTheDocument();
    expect(screen.getByText(/Quá hạn, chờ 5 ngày/)).toBeInTheDocument();
  });

  it('opens the batch from the queue and the filtered list from a KPI card', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Xem BATCH_OLD' }));
    expect(navigate).toHaveBeenCalledWith('/audit-trail?batchId=7');
    await userEvent.click(screen.getByRole('button', { name: /Từ chối/ }));
    expect(navigate).toHaveBeenCalledWith('/audit-trail?status=rejected');
  });

  it('lists the largest difference and who did what recently', () => {
    renderPage();
    expect(screen.getByText('Chênh lệch lớn nhất')).toBeInTheDocument();
    expect(screen.getByText(/Trần Văn Minh đã duyệt cuối BATCH_DONE/)).toBeInTheDocument();
  });

  it('has a loading state, an error state with retry, and an empty state', async () => {
    useBatches.mockReturnValue({ loading: true, error: '', batches: [], reload: vitest.fn() });
    const { unmount } = renderPage();
    expect(screen.getByRole('status', { name: 'Đang tải…' })).toBeInTheDocument();
    unmount();

    const reload = vitest.fn();
    useBatches.mockReturnValue({ loading: false, error: 'Không thể tải dữ liệu tổng quan.', batches: [], reload });
    const second = renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
    second.unmount();

    useBatches.mockReturnValue({ loading: false, error: '', batches: [], reload });
    renderPage();
    expect(screen.getByText('Chưa có bộ đối soát nào')).toBeInTheDocument();
  });
});
