import React from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { vi } from '../i18n/vi.js';
import { cn, focusRing } from './cn.js';

/**
 * Select tùy biến (thay <select> mặc định). Điều khiển được bằng bàn phím: Space hoặc mũi tên để mở
 * (Enter không mở, do Headless UI để Enter không gửi nhầm form), mũi tên chọn, Enter chốt, Esc đóng, gõ chữ để nhảy tới mục.
 *
 * options: [{ value, label, icon?: Component, disabled?: boolean }]
 * Dùng `aria-label` khi không có <label>; hoặc đặt trong <Field> để tự nối nhãn.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = vi.common.selectPlaceholder,
  invalid = false,
  disabled = false,
  className,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}) {
  const selected = options.find((option) => option.value === value);
  const SelectedIcon = selected?.icon;

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled} name={name}>
      <ListboxButton
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex min-h-10 w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 py-2 text-left text-sm shadow-card',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
          invalid ? 'border-tone-danger-fg' : 'border-line-input',
          selected ? 'text-fg' : 'text-fg-subtle',
          focusRing,
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {SelectedIcon && <SelectedIcon size={16} aria-hidden="true" className="shrink-0" />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />
      </ListboxButton>

      <ListboxOptions
        anchor={{ to: 'bottom start', gap: 4 }}
        className="z-50 max-h-64 w-[var(--button-width)] overflow-auto rounded-control border border-line bg-surface p-1 shadow-pop focus:outline-none"
      >
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <ListboxOption
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-fg data-[focus]:bg-surface-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {Icon && <Icon size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <Check size={16} aria-hidden="true" className="invisible shrink-0 text-accent group-data-[selected]:visible" />
            </ListboxOption>
          );
        })}
      </ListboxOptions>
    </Listbox>
  );
}
