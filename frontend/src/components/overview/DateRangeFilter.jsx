import React from 'react';
import { DATE_PRESETS } from '../../lib/dateRange.js';
import { vi } from '../../i18n/vi.js';
import { Field, Input, Select } from '../../ui/index.js';

const OPTIONS = DATE_PRESETS.map((value) => ({ value, label: vi.overview.ranges[value] }));

/** Chọn khoảng thời gian: các mốc có sẵn, hoặc "Tùy chọn khoảng ngày" để nhập từ ngày - đến ngày. */
export default function DateRangeFilter({ preset, onPresetChange, start, end, onStartChange, onEndChange }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label={vi.overview.period} className="sm:w-56">
        <Select value={preset} onChange={onPresetChange} options={OPTIONS} />
      </Field>
      {preset === 'custom' && (
        <>
          <Field label={vi.overview.from}>
            <Input type="date" value={start} max={end || undefined} onChange={(event) => onStartChange(event.target.value)} />
          </Field>
          <Field label={vi.overview.to}>
            <Input type="date" value={end} min={start || undefined} onChange={(event) => onEndChange(event.target.value)} />
          </Field>
        </>
      )}
    </div>
  );
}
