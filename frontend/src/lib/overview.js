import { getReconciliationStatus } from './status.js';
import { startOfDay, isWithinRange } from './dateRange.js';
import { toDate } from './format.js';
import { vi } from '../i18n/vi.js';

// Tính số liệu cho trang Tổng quan từ danh sách bộ đối soát (DocumentBatchOut). Hàm thuần, không gọi API.
// Lưu ý: API chỉ có created_at/updated_at, không có mốc thời gian từng bước duyệt, nên các mốc "chờ bao lâu"
// và "hoạt động gần đây" dùng updated_at (lần đổi trạng thái gần nhất) làm xấp xỉ.

export const OVERDUE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getActivityDate(batch) {
  return toDate(batch?.updated_at || batch?.created_at);
}

export function filterByRange(batches, range) {
  return batches.filter((batch) => isWithinRange(batch?.updated_at || batch?.created_at, range));
}

/** Số liệu thẻ KPI và biểu đồ kết quả đối soát. matchRate là null khi chưa bộ nào có kết quả. */
export function summarize(batches) {
  const verdicts = { matched: 0, mismatch: 0, missing_docs: 0, processing: 0 };
  let pending = 0;
  let approved = 0;
  let rejected = 0;

  for (const batch of batches) {
    // Bộ đã qua duyệt nhưng không có kết quả đối soát (dữ liệu cũ) không phải "đang xử lý": không tính vào kết quả.
    const decided = ['approved', 'final_approved', 'rejected'].includes(batch.status);
    if (!(decided && !batch.reconciliation_status)) verdicts[getReconciliationStatus(batch)] += 1;
    if (batch.status === 'approved') pending += 1;
    else if (batch.status === 'final_approved') approved += 1;
    else if (batch.status === 'rejected') rejected += 1;
  }

  const judged = verdicts.matched + verdicts.mismatch;
  return {
    total: batches.length,
    pending,
    approved,
    rejected,
    verdicts,
    judged,
    matchRate: judged ? Math.round((verdicts.matched / judged) * 100) : null,
  };
}

function getWaitingMs(batch, now) {
  const since = getActivityDate(batch);
  return since ? Math.max(0, now - since) : 0;
}

/** Bộ chờ kế toán trưởng duyệt, chờ lâu nhất lên trước. */
export function getPendingQueue(batches, now = new Date(), limit = 5) {
  const waiting = batches
    .filter((batch) => batch.status === 'approved')
    .map((batch) => {
      const waitingMs = getWaitingMs(batch, now);
      return { batch, waitingMs, overdue: waitingMs > OVERDUE_DAYS * DAY_MS };
    })
    .sort((a, b) => b.waitingMs - a.waitingMs);
  return { items: waiting.slice(0, limit), total: waiting.length };
}

/** "vừa xong", "5 giờ", "3 ngày". */
export function formatWaiting(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'dưới 1 giờ';
  if (hours < 24) return `${hours} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}

/** Những thứ nên để mắt tới: chênh lệch tiền lớn nhất (bộ chưa duyệt cuối), số bộ chờ quá hạn, số bộ bị từ chối. */
export function getAttention(batches, now = new Date()) {
  let largestDiff = null;
  let overdueCount = 0;
  let rejectedCount = 0;

  for (const batch of batches) {
    if (batch.status === 'rejected') rejectedCount += 1;
    if (batch.status === 'approved' && getWaitingMs(batch, now) > OVERDUE_DAYS * DAY_MS) overdueCount += 1;

    const amount = Math.abs(Number(batch.reconciliation_diff_amount) || 0);
    if (amount > 0 && batch.status !== 'final_approved' && (!largestDiff || amount > largestDiff.amount)) {
      largestDiff = { batch, amount };
    }
  }

  return { largestDiff, overdueCount, rejectedCount };
}

/**
 * Đếm bộ theo ngày trong `days` ngày kết thúc ở `endDate`: khớp / có chênh lệch / bị từ chối.
 * Bộ bị từ chối tính vào cột "Từ chối" bất kể kết quả đối soát; các bộ chưa có kết quả không được tính.
 */
export function buildTimeline(batches, { days = 14, endDate = new Date() } = {}) {
  const end = startOfDay(endDate);
  const buckets = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setDate(end.getDate() - offset);
    buckets.push({ date: day, matched: 0, mismatch: 0, rejected: 0 });
  }
  const first = buckets[0].date.getTime();

  for (const batch of batches) {
    const at = getActivityDate(batch);
    if (!at) continue;
    const index = Math.round((startOfDay(at).getTime() - first) / DAY_MS);
    if (index < 0 || index >= buckets.length) continue;

    if (batch.status === 'rejected') buckets[index].rejected += 1;
    else {
      const verdict = getReconciliationStatus(batch);
      if (verdict === 'matched') buckets[index].matched += 1;
      else if (verdict === 'mismatch') buckets[index].mismatch += 1;
    }
  }
  return buckets;
}

/** Các sự kiện gần đây, mới nhất trước: trạng thái hiện tại của từng bộ cộng các lần từ chối đã lưu trong lịch sử. */
export function buildActivity(batches, limit = 8) {
  const events = [];

  for (const batch of batches) {
    const base = { batchId: batch.id, batchNumber: batch.batch_number };
    const updated = batch.updated_at || batch.created_at;

    if (batch.status === 'final_approved') {
      events.push({ ...base, kind: 'final_approved', actor: batch.chief_approved_by_name, at: updated });
    } else if (batch.status === 'approved') {
      events.push({ ...base, kind: 'approved', actor: batch.approved_by_name, at: updated });
    } else if (batch.status === 'rejected') {
      events.push({ ...base, kind: 'rejected', actor: null, at: updated });
    } else {
      events.push({ ...base, kind: 'created', actor: batch.created_by_name, at: batch.created_at });
    }

    for (const entry of batch.history || []) {
      if (entry.rejected_at) {
        events.push({ ...base, kind: 'rejected', actor: entry.rejected_by_name, at: entry.rejected_at });
      }
    }
  }

  return events
    .map((event) => ({ ...event, date: toDate(event.at) }))
    .filter((event) => event.date)
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
}

/** Mỗi kế toán viên đã tạo bao nhiêu bộ và bao nhiêu bộ khớp, nhiều bộ nhất lên trước. */
export function groupByAccountant(batches) {
  const byName = new Map();
  for (const batch of batches) {
    const name = batch.created_by_name || vi.common.system;
    const row = byName.get(name) || { name, total: 0, matched: 0, judged: 0 };
    row.total += 1;
    const verdict = getReconciliationStatus(batch);
    if (verdict === 'matched' || verdict === 'mismatch') row.judged += 1;
    if (verdict === 'matched') row.matched += 1;
    byName.set(name, row);
  }
  return [...byName.values()]
    .map((row) => ({ ...row, matchRate: row.judged ? Math.round((row.matched / row.judged) * 100) : null }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
}
