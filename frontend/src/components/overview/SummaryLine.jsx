import React from 'react';
import { cn, focusRing } from '../../ui/cn.js';

/**
 * Dải số liệu một dòng thay cho lưới thẻ KPI: các con số đứng cạnh nhau, ngăn bằng vạch mảnh,
 * mục dẫn đầu (việc cần làm) đậm màu chính. Mục có onClick là liên kết tới danh sách đã lọc.
 */
export default function SummaryLine({ items, label }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 border-y border-line sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
      {items.map((item, index) => {
        const body = (
          <>
            <dt className={cn('text-sm', item.lead ? 'font-semibold text-primary' : 'text-fg-muted')}>{item.label}</dt>
            <dd className={cn('mt-1 font-bold tabular-nums leading-none', item.lead ? 'text-4xl text-primary' : 'text-2xl text-fg')}>
              {item.value}
            </dd>
            {item.hint && <dd className="mt-1.5 max-w-[16rem] text-xs text-fg-subtle">{item.hint}</dd>}
          </>
        );
        const cellClass = cn(
          // Nút bấm mặc định căn giữa nội dung theo chiều dọc: ép mọi ô căn lên trên để các nhãn thẳng hàng.
          'flex min-w-0 flex-col items-start justify-start px-4 py-4 text-left sm:px-6',
          index > 0 && 'sm:border-l sm:border-line',
          item.lead && 'col-span-2 sm:col-span-1 sm:pl-0',
        );
        return item.onClick ? (
          <button key={item.label} type="button" onClick={item.onClick} className={cn(cellClass, 'transition-colors hover:bg-surface-muted', focusRing)}>
            {body}
          </button>
        ) : (
          <div key={item.label} className={cellClass}>
            {body}
          </div>
        );
      })}
    </dl>
  );
}
