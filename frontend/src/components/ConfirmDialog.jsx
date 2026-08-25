import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

const TONE_META = {
  success: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    button: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500',
  },
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    button: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500',
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    button: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500',
  },
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'success',
  loading = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  const meta = TONE_META[tone] || TONE_META.success;
  const Icon = meta.icon;

  const handleBackdropClick = () => {
    if (!loading) onCancel?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] isolate flex items-start justify-center bg-slate-950/45 px-4 pb-4 pt-[22vh] backdrop-blur-sm sm:pt-[24vh]"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.iconWrap}`}>
            <Icon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-950 dark:text-slate-100">{title}</h2>
            {description && (
              <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Đóng"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${meta.button}`}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
