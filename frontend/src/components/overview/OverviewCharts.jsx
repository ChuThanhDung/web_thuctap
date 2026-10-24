import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { vi } from '../../i18n/vi.js';
import { formatDate } from '../../lib/format.js';
import useChartColors from '../../lib/useChartColors.js';

const pad = (value) => String(value).padStart(2, '0');
const dayLabel = (date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;

function ChartTooltip({ active, payload, label, colors }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-control border px-3 py-2 text-xs shadow-pop"
      style={{ background: colors.surface, borderColor: colors.grid, color: colors.text }}
    >
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: item.color || item.payload?.color }} />
          {item.name}: <span className="font-semibold tabular-nums">{item.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Cột chồng theo ngày: khớp / có chênh lệch / từ chối. Có bảng ẩn cho trình đọc màn hình. */
export function TimelineChart({ buckets }) {
  const colors = useChartColors();
  const data = buckets.map((bucket) => ({
    label: dayLabel(bucket.date),
    fullDate: formatDate(bucket.date),
    matched: bucket.matched,
    mismatch: bucket.mismatch,
    rejected: bucket.rejected,
  }));
  const hasData = data.some((row) => row.matched + row.mismatch + row.rejected > 0);

  if (!hasData) {
    return <p className="px-5 py-12 text-center text-sm text-fg-muted">{vi.overview.timeline.empty}</p>;
  }

  return (
    <div className="p-4">
      <div role="img" aria-label={vi.overview.timeline.ariaLabel} className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: colors.grid }} tick={{ fill: colors.axis, fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: colors.axis, fontSize: 12 }} />
            <Tooltip content={<ChartTooltip colors={colors} />} cursor={{ fill: colors.grid, opacity: 0.4 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: colors.axis }} />
            <Bar dataKey="matched" name={vi.overview.timeline.matched} stackId="day" fill={colors.success} />
            <Bar dataKey="mismatch" name={vi.overview.timeline.mismatch} stackId="day" fill={colors.danger} />
            <Bar dataKey="rejected" name={vi.overview.timeline.rejected} stackId="day" fill={colors.neutral} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{vi.overview.timeline.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{vi.overview.timeline.date}</th>
            <th scope="col">{vi.overview.timeline.matched}</th>
            <th scope="col">{vi.overview.timeline.mismatch}</th>
            <th scope="col">{vi.overview.timeline.rejected}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.fullDate}>
              <th scope="row">{row.fullDate}</th>
              <td>{row.matched}</td>
              <td>{row.mismatch}</td>
              <td>{row.rejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SEGMENTS = [
  ['matched', 'success'],
  ['mismatch', 'danger'],
  ['missing_docs', 'warning'],
  ['processing', 'neutral'],
];

/** Vòng tròn kết quả đối soát, số % khớp ở giữa, chú thích kèm số lượng (không chỉ dựa vào màu). */
export function ResultDonut({ verdicts, matchRate }) {
  const colors = useChartColors();
  const segments = SEGMENTS.map(([key, tone]) => ({
    key,
    name: vi.reconciliation[key].label,
    value: verdicts[key],
    color: colors[tone],
  }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className="px-5 py-12 text-center text-sm text-fg-muted">{vi.overview.result.empty}</p>;
  }

  const summary = segments.map((segment) => `${segment.name}: ${segment.value}`).join(', ');

  return (
    <div className="flex flex-col items-center gap-5 p-5">
      <div role="img" aria-label={`${vi.overview.result.ariaLabel}. ${summary}`} className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={segments.filter((segment) => segment.value > 0)} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
              {segments
                .filter((segment) => segment.value > 0)
                .map((segment) => (
                  <Cell key={segment.key} fill={segment.color} />
                ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-fg">{matchRate === null ? '—' : `${matchRate}%`}</span>
          <span className="text-xs text-fg-muted">{vi.overview.result.matchedShort}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-fg-muted">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
              {segment.name}
            </span>
            <span className="font-semibold tabular-nums text-fg">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
