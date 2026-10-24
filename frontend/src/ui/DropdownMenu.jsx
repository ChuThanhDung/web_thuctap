import React from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { MoreHorizontal } from 'lucide-react';
import { vi } from '../i18n/vi.js';
import { cn, focusRing } from './cn.js';

/**
 * Menu thao tác ("…"). Thao tác nguy hiểm (tone: 'danger') luôn được đặt ở cuối và ngăn cách bằng đường kẻ;
 * kết hợp với ConfirmDialog để người dùng xác nhận trước khi xóa.
 *
 * items: [{ key, label, icon?: Component, onSelect: () => void, tone?: 'danger', disabled?: boolean }]
 */
export default function DropdownMenu({ items, label = vi.actions.moreActions, align = 'bottom end', className }) {
  const regular = items.filter((item) => item.tone !== 'danger');
  const danger = items.filter((item) => item.tone === 'danger');

  const renderItem = (item) => {
    const Icon = item.icon;
    return (
      <MenuItem key={item.key ?? item.label} disabled={item.disabled}>
        <button
          type="button"
          onClick={item.onSelect}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm data-[focus]:bg-surface-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
            item.tone === 'danger' ? 'text-tone-danger-fg' : 'text-fg',
          )}
        >
          {Icon && <Icon size={16} aria-hidden="true" className="shrink-0" />}
          {item.label}
        </button>
      </MenuItem>
    );
  };

  return (
    <Menu>
      <MenuButton
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg',
          focusRing,
          className,
        )}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </MenuButton>

      <MenuItems
        anchor={{ to: align, gap: 4 }}
        className="z-50 w-52 rounded-control border border-line bg-surface p-1 shadow-pop focus:outline-none"
      >
        {regular.map(renderItem)}
        {regular.length > 0 && danger.length > 0 && <div role="separator" className="my-1 h-px bg-line" />}
        {danger.map(renderItem)}
      </MenuItems>
    </Menu>
  );
}
