import React from 'react';
import { getComparisonCellClass } from '../reconciliationCompare.js';
import { cn } from '../ui/cn.js';
import { describeOdd, findOddCopies } from './copyDiff.js';

const COPIES = [
  { key: 'po', label: 'PO', name: 'Đơn đặt hàng' },
  { key: 'invoice', label: 'HĐ', name: 'Hóa đơn' },
  { key: 'grn', label: 'GRN', name: 'Phiếu nhập kho' },
];

// Hổ phách chỉ cho lệch nhỏ (item.minor); "thiếu dữ liệu" cũng ở mức cảnh báo nhưng dùng chữ trung tính.
const RESULT_TONE = {
  ok: 'text-tone-success-fg',
  minor: 'text-tone-warning-fg',
  warning: 'text-fg-muted',
  danger: 'text-tone-danger-fg',
};
const resultTone = (item) => RESULT_TONE[item.minor ? 'minor' : item.severity];

// Trường chữ (tên nhà cung cấp...) căn trái và gọn tối đa 3 dòng; chỉ trường số (MST, VAT, tiền) căn phải.
const isNumericValue = (value) => /^[\d\s.,%đ+-]+$/i.test(String(value ?? '').trim());

// Tên công ty: bỏ loại hình ("CÔNG TY TNHH", "CÔNG TY CỔ PHẦN"...) để phần phân biệt không bị cắt; tên đủ ở title.
const LEGAL_FORM = /^\s*(công ty|cty)\s+(tnhh|cổ phần|cp|trách nhiệm hữu hạn)(\s+(một|hai) thành viên|\s+mtv)?\s+/i;
const shortName = (value) => String(value).replace(LEGAL_FORM, '').trim() || String(value);

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '' || value === '-';

/** Kết quả bằng lời; khớp nhưng một liên không ghi giá trị thì nói rõ, không ghi trơn "Khớp". */
function describeField(item) {
  const missing = COPIES.filter((copy) => isEmpty(item[copy.key])).map((copy) => copy.label);
  if (item.severity === 'ok' && missing.length) return `${item.result} · ${missing.join(', ')} không ghi`;
  if (item.severity === 'danger') {
    const odd = oddFor(item);
    if (odd.length) return describeOdd(odd, Object.fromEntries(COPIES.map((copy) => [copy.key, item[copy.key]])));
  }
  return item.result;
}

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function oddFor(item) {
  return item.severity === 'danger' ? findOddCopies(Object.fromEntries(COPIES.map((copy) => [copy.key, isEmpty(item[copy.key]) ? '' : normalize(item[copy.key])]))) : [];
}

/** Không mặc định liên nào đúng: tô liên khác các liên còn lại, hoặc tất cả khi không có cặp nào khớp. */
function cellClass(item, key, peers) {
  if (item.severity !== 'danger') return getComparisonCellClass(item.severity, item[key], peers);
  return oddFor(item).includes(key) ? 'bg-tone-danger-bg font-semibold text-tone-danger-fg' : 'text-fg-muted';
}

/** Bảng đối chiếu thông tin chung (nhà cung cấp, MST, VAT, tổng tiền) theo ba cột PO · HĐ · GRN cố định. */
export default function FieldComparisonTable({ items }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">Đối chiếu thông tin chung giữa đơn đặt hàng, hóa đơn và phiếu nhập kho</caption>
        <thead>
          <tr className="border-b-2 border-primary text-xs font-semibold text-fg-muted">
            <th scope="col" className="w-36 px-4 py-2.5 text-left">Trường</th>
            {COPIES.map((copy) => (
              <th key={copy.key} scope="col" className="px-4 py-2.5 text-left">
                <abbr title={copy.name} className="no-underline">{copy.label}</abbr>
              </th>
            ))}
            <th scope="col" className="min-w-[180px] px-4 py-2.5 text-left">Kết quả</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item, index) => {
            const peers = COPIES.map((copy) => item[copy.key]);
            const numeric = peers.every((value) => isEmpty(value) || isNumericValue(value));
            return (
              <tr key={`${item.field}-${index}`}>
                <th scope="row" className="whitespace-nowrap px-4 py-2.5 align-top text-left font-semibold text-fg">{item.field}</th>
                {COPIES.map((copy) => (
                  <td key={copy.key} className={cn('px-4 py-2.5 align-top', numeric ? 'text-right tabular-nums' : 'text-left')}>
                    <span
                      title={numeric || isEmpty(item[copy.key]) ? undefined : String(item[copy.key])}
                      className={cn('rounded-control px-1.5 py-0.5', numeric ? 'inline-block' : 'line-clamp-3 w-fit break-words py-0 leading-5', cellClass(item, copy.key, peers))}
                    >
                      {isEmpty(item[copy.key]) ? '—' : numeric ? item[copy.key] : shortName(item[copy.key])}
                    </span>
                  </td>
                ))}
                <td className={cn('px-4 py-2.5 align-top font-semibold', resultTone(item))}>{describeField(item)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
