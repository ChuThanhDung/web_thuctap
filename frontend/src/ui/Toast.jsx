import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { vi } from '../i18n/vi.js';
import { cn, focusRing } from './cn.js';

const ToastContext = createContext(null);

const TONES = {
  success: { icon: CheckCircle2, classes: 'border-tone-success-line bg-tone-success-bg text-tone-success-fg' },
  error: { icon: XCircle, classes: 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg' },
  warning: { icon: AlertTriangle, classes: 'border-tone-warning-line bg-tone-warning-bg text-tone-warning-fg' },
  info: { icon: Info, classes: 'border-tone-info-line bg-tone-info-bg text-tone-info-fg' },
};

const MAX_TOASTS = 4;
const DURATIONS = { success: 4000, info: 5000, warning: 7000, error: 9000 };

function ToastItem({ toast, onDismiss }) {
  const { icon: Icon, classes } = TONES[toast.tone];
  const [paused, setPaused] = useState(false);

  // Tạm dừng đếm ngược khi người dùng rê chuột hoặc focus vào thông báo để kịp đọc.
  useEffect(() => {
    if (paused || !toast.duration) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.duration, toast.id, onDismiss]);

  return (
    <div
      // Lỗi cần được đọc ngay (assertive); các loại còn lại đọc khi rảnh (polite).
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border p-3 shadow-pop', classes)}
    >
      <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
        <p className={cn('text-sm', toast.title && 'mt-0.5')}>{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={vi.common.dismissNotification}
        className={cn('-m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control hover:bg-surface/50', focusRing)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Bọc ứng dụng một lần; dùng `useToast()` để hiện thông báo thay cho alert(). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((tone, message, options = {}) => {
    const id = ++nextId.current;
    const toast = { id, tone, message, title: options.title, duration: options.duration ?? DURATIONS[tone] };
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), toast]);
    return id;
  }, []);

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show('success', message, options),
      error: (message, options) => show('error', message, options),
      warning: (message, options) => show('warning', message, options),
      info: (message, options) => show('info', message, options),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label={vi.common.notifications}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast phải được dùng bên trong <ToastProvider>.');
  return context;
}
