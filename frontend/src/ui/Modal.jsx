import React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import { X } from 'lucide-react';
import { vi } from '../i18n/vi.js';
import { cn, focusRing } from './cn.js';
import Button from './Button.jsx';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

/**
 * Hộp thoại. Headless UI lo phần khó: nhốt focus trong hộp, Esc để đóng, trả focus về nút đã mở,
 * khóa cuộn nền và gắn aria-modal / aria-labelledby.
 */
export default function Modal({ open, onClose, title, description, children, footer, size = 'md', className }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-fg/40 backdrop-blur-[1px] transition-opacity data-[closed]:opacity-0" />

      <div className="fixed inset-0 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
        <DialogPanel
          className={cn(
            'flex max-h-[92vh] w-full flex-col rounded-t-modal bg-surface text-fg shadow-pop sm:rounded-modal',
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-fg">{title}</DialogTitle>
              {description && <Description className="mt-1 text-sm text-fg-muted">{description}</Description>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={vi.actions.close}
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg',
                focusRing,
              )}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {children != null && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>}

          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

/** Hộp xác nhận cho thao tác không hoàn tác được (xóa, từ chối). Thay window.confirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = vi.actions.confirm,
  cancelLabel = vi.actions.cancel,
  tone = 'primary',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
