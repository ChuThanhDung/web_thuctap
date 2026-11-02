import React, { useState } from 'react';
import { getComparisonCellClass } from '../reconciliationCompare.js';
import { cn } from '../ui/cn.js';
import { findOddCopies } from './copyDiff.js';

// Thứ tự liên cố định trên mọi màn hình: PO, hóa đơn, phiếu nhập kho.
const COPIES = [
  { key: 'po', label: 'PO', name: 'Đơn đặt hàng' },
  { key: 'invoice', label: 'HĐ', name: 'Hóa đơn' },
  { key: 'grn', label: 'GRN', name: 'Phiếu nhập kho' },
];

const FIELDS = [
  { key: 'Qty', severity: 'qtySeverity', label: 'Số lượng' },
  { key: 'Price', severity: 'priceSeverity', label: 'Đơn giá' },
  { key: 'Amount', severity: 'amountSeverity', label: 'Thành tiền' },
];

function toNumber(value) {
  const text = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!text || text === '-' || text === '.') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const COPY_KEYS = ['po', 'invoice', 'grn'];
const formatVnd = (value) => new Intl.NumberFormat('vi-VN').format(Math.abs(value));

/** Lý do bằng lời cho một mặt hàng: trường nào lệch, liên nào khác, lệch bao nhiêu. */
export function describeLineItem(item) {
  if (item.severity === 'ok') return 'Khớp';
  if (item.minor) {
    const amounts = COPY_KEYS.map((copy) => toNumber(item[`${copy}Amount`])).filter((value) => value !== null);
    const spread = amounts.length ? Math.max(...amounts) - Math.min(...amounts) : 0;
    return `Thành tiền lệch ${formatVnd(spread)} đ · trong ngưỡng làm tròn`;
  }
  if (item.severity === 'warning') {
    // Nói đúng liên nào có, liên nào thiếu, thay vì một câu chung cho mọi trường hợp.
    const present = COPIES.filter((copy) => FIELDS.some((field) => toNumber(item[`${copy.key}${field.key}`]) !== null));
    if (present.length === 1) return `Chỉ có ở ${present[0].label}`;
    if (present.length === 2) return `Thiếu ở ${COPIES.find((copy) => !present.includes(copy)).label}`;
    return 'Thiếu dữ liệu ở một liên';
  }
  const reasons = FIELDS.filter((field) => item[field.severity] === 'danger').map((field) => {
    const po = toNumber(item[`po${field.key}`]);
    const invoice = toNumber(item[`invoice${field.key}`]);
    const unit = field.key === 'Qty' ? (item.unit && item.unit !== '-' ? ` ${item.unit}` : '') : ' đ';
    // So liên này với liên kia, không coi liên nào là đúng (DESIGN.md).
    const [more, less] = field.key === 'Qty' ? ['nhiều hơn', 'ít hơn'] : ['cao hơn', 'thấp hơn'];
    if (po !== null && invoice !== null && po !== invoice) {
      return `${field.label} HĐ ${invoice > po ? more : less} PO ${formatVnd(invoice - po)}${unit}`;
    }
    const grn = toNumber(item[`grn${field.key}`]);
    if (grn !== null && po !== null && grn !== po) {
      return `${field.label} GRN ${grn > po ? more : less} PO ${formatVnd(grn - po)}${unit}`;
    }
    return `${field.label} lệch giữa các liên`;
  });
  return reasons.length ? reasons.join('; ') : 'Có chênh lệch';
}

// Hổ phách chỉ cho lệch nhỏ (item.minor); "thiếu dữ liệu" cũng ở mức cảnh báo nhưng dùng chữ trung tính.
const RESULT_TONE = {
  ok: 'text-tone-success-fg',
  minor: 'text-tone-warning-fg',
  warning: 'text-fg-muted',
  danger: 'text-tone-danger-fg',
};
const resultTone = (item) => RESULT_TONE[item.minor ? 'minor' : item.severity];

/**
 * Bảng hàng hóa "ba liên": mỗi mặt hàng là một nhóm ba dòng PO / HĐ / GRN xếp chồng.
 * Ô lệch được tô và đẩy lệch khỏi cột để thấy ngay chỗ ba liên không trùng khít.
 */
const MIN_GROUP_SIZE = 3;

/**
 * Chia mặt hàng thành: lệch (luôn hiện đủ ba dòng), các nhóm cùng kết quả (gộp khi từ ba mặt hàng,
 * ví dụ "70 mặt hàng chỉ có ở GRN") và các mặt hàng khớp (gộp thành một dòng, bấm để mở).
 */
function groupItems(items) {
  const differing = [];
  const matched = [];
  const byReason = new Map();
  for (const item of items) {
    if (item.severity === 'ok') matched.push(item);
    else if (item.severity === 'danger' || item.minor) differing.push(item);
    else {
      const reason = describeLineItem(item);
      byReason.set(reason, [...(byReason.get(reason) || []), item]);
    }
  }
  const groups = [];
  for (const [reason, list] of byReason) {
    if (list.length >= MIN_GROUP_SIZE) groups.push({ key: `reason:${reason}`, label: `${list.length} mặt hàng ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`, items: list, tone: 'warning' });
    else differing.push(...list);
  }
  if (matched.length > 0) groups.push({ key: 'matched', label: `${matched.length} mặt hàng khớp cả ba liên`, items: matched, tone: 'ok' });
  return { differing, groups };
}

function ItemRows({ item }) {
  const peers = (field) => COPIES.map((copy) => item[`${copy.key}${field}`]);
  return COPIES.map((copy, copyIndex) => (
    <tr key={copy.key} className={copyIndex < COPIES.length - 1 ? 'border-b border-line/60' : undefined}>
      {copyIndex === 0 && (
        <th scope="rowgroup" rowSpan={COPIES.length} className="px-4 py-2 text-left align-top font-normal">
          <span className="block font-semibold leading-snug text-fg">{item.name || item.sku}</span>
          {item.name && item.sku && <span className="mt-0.5 block font-mono text-xs text-fg-subtle">{item.sku}</span>}
        </th>
      )}
      {copyIndex === 0 && (
        <td rowSpan={COPIES.length} className="px-3 py-2 align-top text-fg-muted">
          {item.unit}
        </td>
      )}
      <td className="px-3 py-1.5">
        <abbr
          title={copy.name}
          className="inline-flex min-w-[2.5rem] justify-center rounded-control bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-tone-brand-fg no-underline"
        >
          {copy.label}
        </abbr>
      </td>
      {FIELDS.map((field) => {
        const value = item[`${copy.key}${field.key}`];
        // Không mặc định liên nào đúng: chỉ tô liên khác các liên còn lại (hoặc tất cả nếu không có cặp nào khớp).
        const odd =
          item[field.severity] === 'danger'
            ? findOddCopies(Object.fromEntries(COPIES.map((c) => [c.key, toNumber(item[`${c.key}${field.key}`]) ?? ''])))
            : [];
        const off = odd.includes(copy.key);
        const cellClass = off
          ? 'bg-tone-danger-bg font-semibold text-tone-danger-fg'
          : getComparisonCellClass(item[field.severity] === 'danger' ? 'ok' : item[field.severity], value, peers(field.key));
        return (
          <td key={field.key} className="px-3 py-1.5 text-right tabular-nums">
            <span
              className={cn(
                'inline-block rounded-control px-1.5 py-0.5',
                cellClass,
                // Ô lệch bị đẩy khỏi cột như một liên in lệch.
                off && 'translate-x-2 ring-1 ring-tone-danger-line',
              )}
            >
              {value || '—'}
            </span>
          </td>
        );
      })}
      {copyIndex === 0 && (
        <td rowSpan={COPIES.length} className={cn('px-4 py-2 align-top text-sm font-semibold', resultTone(item))}>
          {describeLineItem(item)}
        </td>
      )}
    </tr>
  ));
}

/**
 * Bảng hàng hóa "ba liên": mỗi mặt hàng là một nhóm ba dòng PO / HĐ / GRN xếp chồng.
 * Ô lệch được tô và đẩy lệch khỏi cột để thấy ngay chỗ ba liên không trùng khít.
 * Mặt hàng lệch đứng đầu và luôn mở; mặt hàng khớp và các nhóm cùng kết quả được gộp, bấm để mở.
 */
export default function LineItemCopies({ items, emptyText }) {
  const [openGroups, setOpenGroups] = useState(() => new Set());
  if (!items?.length) {
    return <p className="px-4 py-10 text-center text-sm text-fg-subtle">{emptyText}</p>;
  }

  const { differing, groups } = groupItems(items);
  const toggle = (key) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <caption className="sr-only">
          Đối chiếu từng mặt hàng giữa đơn đặt hàng, hóa đơn và phiếu nhập kho
        </caption>
        <thead>
          <tr className="border-b-2 border-primary text-xs font-semibold text-fg-muted">
            <th scope="col" className="px-4 py-2.5 text-left">Mặt hàng</th>
            <th scope="col" className="px-3 py-2.5 text-left">ĐVT</th>
            <th scope="col" className="px-3 py-2.5 text-left">Liên</th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">Số lượng</th>
            <th scope="col" className="px-3 py-2.5 text-right">Đơn giá</th>
            <th scope="col" className="px-3 py-2.5 text-right">Thành tiền</th>
            <th scope="col" className="px-4 py-2.5 text-left">Kết quả</th>
          </tr>
        </thead>
        {differing.map((item, index) => (
          <tbody
            key={`${item.sku}-${index}`}
            className={cn('border-b-2 border-line', item.severity === 'danger' && 'bg-tone-danger-bg/30')}
          >
            <ItemRows item={item} />
          </tbody>
        ))}
        {groups.map((group) => {
          const open = openGroups.has(group.key);
          return (
            <React.Fragment key={group.key}>
              <tbody className="border-b-2 border-line">
                <tr>
                  <td colSpan={7} className="px-4 py-2.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(group.key)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-control px-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        group.tone === 'ok' ? 'text-tone-success-fg' : 'text-fg-muted',
                      )}
                    >
                      <span aria-hidden="true" className={cn('inline-block transition-transform', open && 'rotate-90')}>›</span>
                      {group.label}
                      <span className="font-normal text-fg-subtle">· {open ? 'Thu gọn' : 'Xem từng mặt hàng'}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
              {open && group.items.map((item, index) => (
                <tbody key={`${group.key}-${item.sku}-${index}`} className="border-b-2 border-line">
                  <ItemRows item={item} />
                </tbody>
              ))}
            </React.Fragment>
          );
        })}
      </table>
    </div>
  );
}
