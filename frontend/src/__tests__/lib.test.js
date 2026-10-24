import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatPercent, formatVND, toDate } from '../lib/format.js';
import { getDisplayName, getInitials, getRoleLabel, getUserStatusLabel } from '../lib/people.js';
import {
  APPROVAL_STATUSES,
  RECONCILIATION_STATUSES,
  getApprovalMeta,
  getApprovalStatus,
  getBatchStatuses,
  getReconciliationMeta,
  getReconciliationStatus,
  needsAction,
} from '../lib/status.js';

describe('format', () => {
  it('formats date-time as dd/MM/yyyy HH:mm for every input shape the API produces', () => {
    expect(formatDateTime('2026-10-11 09:36:04')).toBe('11/10/2026 09:36');
    expect(formatDateTime('2026-10-11T09:36:04')).toBe('11/10/2026 09:36');
    expect(formatDateTime(new Date(2026, 9, 14, 9, 13))).toBe('14/10/2026 09:13');
  });

  it('pads single digits', () => {
    expect(formatDateTime(new Date(2026, 0, 2, 3, 4))).toBe('02/01/2026 03:04');
    expect(formatDate(new Date(2026, 0, 2))).toBe('02/01/2026');
  });

  it('treats a date-only string as that calendar day (no timezone shift)', () => {
    expect(formatDate('2026-06-12')).toBe('12/06/2026');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime('not a date')).toBe('');
    expect(toDate(undefined)).toBeNull();
  });

  it('formats numbers and VND the Vietnamese way', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatVND(119240000)).toMatch(/119\.240\.000/);
    expect(formatNumber('')).toBe('');
    expect(formatVND(null)).toBe('');
  });

  it('formats a confidence/percentage on either scale', () => {
    expect(formatPercent(0.934)).toBe('93%');
    expect(formatPercent(93.4)).toBe('93%');
    expect(formatPercent(null)).toBe('');
  });
});

describe('people', () => {
  it('removes a role suffix from the display name', () => {
    expect(getDisplayName('Chu Thanh Dũng (Kế toán viên)')).toBe('Chu Thanh Dũng');
    expect(getDisplayName('Trần Văn Minh')).toBe('Trần Văn Minh');
    expect(getDisplayName(null)).toBe('');
  });

  it('takes initials from the real name, never from the role', () => {
    // Trước đây "Chu Thanh Dũng (Kế toán viên)" ra "TV" (từ "Kế toán viên").
    expect(getInitials('Chu Thanh Dũng (Kế toán viên)')).toBe('CD');
    expect(getInitials('Nguyễn Thị Lan')).toBe('NL');
    expect(getInitials('Đặng Minh')).toBe('ĐM');
  });

  it('handles single-word and empty names', () => {
    expect(getInitials('Lan')).toBe('L');
    expect(getInitials('')).toBe('?');
  });

  it('maps internal role and status codes to Vietnamese labels', () => {
    expect(getRoleLabel('chief_accountant')).toBe('Kế toán trưởng');
    expect(getRoleLabel('accountant')).toBe('Kế toán viên');
    expect(getRoleLabel('unknown')).toBe('');
    expect(getUserStatusLabel('ACTIVE')).toBe('Đang hoạt động');
    expect(getUserStatusLabel('DEACTIVE')).toBe('Ngưng hoạt động');
  });
});

const batch = (overrides = {}) => ({
  status: 'ready',
  missing_doc_types: [],
  pending_extraction_doc_types: [],
  reconciliation_status: 'matched',
  ...overrides,
});

describe('reconciliation status (AI)', () => {
  it('uses the backend verdict instead of recomputing it', () => {
    expect(getReconciliationStatus(batch())).toBe('matched');
    expect(getReconciliationStatus(batch({ reconciliation_status: 'major_diff' }))).toBe('mismatch');
    expect(getReconciliationStatus(batch({ reconciliation_status: 'minor_diff' }))).toBe('mismatch');
  });

  it('reports missing documents and in-flight extraction before any verdict', () => {
    expect(getReconciliationStatus(batch({ missing_doc_types: ['grn'], reconciliation_status: null }))).toBe('missing_docs');
    expect(getReconciliationStatus(batch({ pending_extraction_doc_types: ['po'] }))).toBe('processing');
  });

  it('does not guess when a complete batch has no verdict yet', () => {
    expect(getReconciliationStatus(batch({ reconciliation_status: null }))).toBe('processing');
  });

  it('every batch gets a reconciliation status', () => {
    for (const status of ['incomplete', 'ready', 'approved', 'final_approved', 'rejected']) {
      expect(RECONCILIATION_STATUSES).toContain(getReconciliationStatus(batch({ status })));
    }
  });
});

describe('approval status (human)', () => {
  it('walks the two-level workflow', () => {
    expect(getApprovalStatus(batch({ status: 'ready' }))).toBe('pending_accountant');
    expect(getApprovalStatus(batch({ status: 'approved' }))).toBe('pending_chief');
    expect(getApprovalStatus(batch({ status: 'final_approved' }))).toBe('approved');
    expect(getApprovalStatus(batch({ status: 'rejected' }))).toBe('rejected');
  });

  it('shows nothing to approve while documents are missing or the batch has differences', () => {
    expect(getApprovalStatus(batch({ status: 'incomplete', missing_doc_types: ['po'] }))).toBeNull();
    expect(getApprovalStatus(batch({ status: 'ready', reconciliation_status: 'major_diff' }))).toBeNull();
  });

  it('returns only known approval statuses', () => {
    for (const status of ['ready', 'approved', 'final_approved', 'rejected']) {
      expect([...APPROVAL_STATUSES, null]).toContain(getApprovalStatus(batch({ status })));
    }
  });
});

describe('status metadata', () => {
  it('gives every status a label, tone and icon (never colour alone)', () => {
    for (const key of RECONCILIATION_STATUSES) {
      const meta = getReconciliationMeta(key);
      expect(meta.label).toBeTruthy();
      expect(meta.tone).toBeTruthy();
      expect(meta.icon).toBeTruthy();
    }
    for (const key of APPROVAL_STATUSES) {
      const meta = getApprovalMeta(key);
      expect(meta.label).toBeTruthy();
      expect(meta.icon).toBeTruthy();
    }
    expect(getReconciliationMeta('nope')).toBeNull();
  });

  it('uses the agreed Vietnamese labels', () => {
    expect(getReconciliationMeta('mismatch').label).toBe('Có chênh lệch');
    expect(getApprovalMeta('pending_chief').label).toBe('Chờ kế toán trưởng duyệt');
  });

  it('combines both groups for a batch', () => {
    expect(getBatchStatuses(batch({ status: 'approved' }))).toEqual({
      reconciliation: 'matched',
      approval: 'pending_chief',
    });
  });
});

describe('needsAction', () => {
  it('points the chief accountant at batches awaiting final approval only', () => {
    expect(needsAction(batch({ status: 'approved' }), 'chief_accountant')).toBe(true);
    expect(needsAction(batch({ status: 'ready' }), 'chief_accountant')).toBe(false);
  });

  it('points the accountant at approvable, rejected and incomplete batches', () => {
    expect(needsAction(batch({ status: 'ready' }), 'accountant')).toBe(true);
    expect(needsAction(batch({ status: 'rejected' }), 'accountant')).toBe(true);
    expect(needsAction(batch({ status: 'incomplete', missing_doc_types: ['grn'] }), 'accountant')).toBe(true);
    expect(needsAction(batch({ status: 'final_approved' }), 'accountant')).toBe(false);
  });
});
