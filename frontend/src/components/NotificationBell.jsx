import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck, CircleAlert, Inbox, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications,
  getNotificationWebSocketUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api.js';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

function formatNotificationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function NotificationIcon({ kind }) {
  const isRejected = kind === 'batch_rejected';
  const Icon = isRejected ? XCircle : Inbox;
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
      isRejected
        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
        : 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
    }`}>
      <Icon size={17} />
    </span>
  );
}

export default function NotificationBell({ token }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const ringTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const loadRequestRef = useRef(0);
  const socketRef = useRef(null);
  const mountedRef = useRef(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRinging, setIsRinging] = useState(false);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    if (!silent) setIsLoading(true);
    try {
      const data = await getNotifications(token);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setNotifications(data.items || []);
      setUnreadCount(data.unread_count || 0);
      setError('');
    } catch (err) {
      if (mountedRef.current && requestId === loadRequestRef.current) {
        setError(err.message || 'Không thể tải thông báo.');
      }
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    loadNotifications();

    function ringBell() {
      setIsRinging(false);
      window.requestAnimationFrame(() => setIsRinging(true));
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = window.setTimeout(() => setIsRinging(false), 1400);
    }

    function clearSocketTimers() {
      window.clearTimeout(reconnectTimerRef.current);
      window.clearInterval(pingTimerRef.current);
    }

    function connect() {
      if (cancelled || !mountedRef.current) return;
      clearSocketTimers();

      const socket = new WebSocket(getNotificationWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (cancelled || socketRef.current !== socket) {
          socket.close();
          return;
        }
        socket.send(JSON.stringify({ type: 'authenticate', token }));
      });

      socket.addEventListener('message', (event) => {
        if (cancelled || socketRef.current !== socket) return;
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.event === 'connected') {
          reconnectAttemptRef.current = 0;
          setUnreadCount(payload.unread_count || 0);
          loadNotifications({ silent: true });
          pingTimerRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        }

        if (payload.event === 'notification') {
          setUnreadCount((count) => count + 1);
          ringBell();
          loadNotifications({ silent: true });
        }
      });

      socket.addEventListener('close', (event) => {
        if (cancelled || socketRef.current !== socket) return;
        clearSocketTimers();
        if (!mountedRef.current) return;
        if (event.code === 4401) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
        const attempt = reconnectAttemptRef.current;
        const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      });
    }

    connect();
    const fallbackRefresh = window.setInterval(() => loadNotifications({ silent: true }), 60000);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadNotifications({ silent: true });
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearSocketTimers();
      window.clearTimeout(ringTimerRef.current);
      window.clearInterval(fallbackRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socketRef.current?.close();
    };
  }, [loadNotifications, token]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function handleNotificationClick(notification) {
    if (!notification.is_read) {
      try {
        await markNotificationRead(token, notification.id);
        setNotifications((items) => items.map((item) => (
          item.id === notification.id ? { ...item, is_read: true } : item
        )));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (err) {
        setError(err.message || 'Không thể cập nhật thông báo.');
      }
    }
    setIsOpen(false);
    if (notification.action_url) navigate(notification.action_url);
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(token);
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      setError('');
    } catch (err) {
      setError(err.message || 'Không thể cập nhật thông báo.');
    }
  }

  const BellIcon = isRinging ? BellRing : Bell;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border bg-white text-slate-600 shadow-[0_1px_3px_rgba(0,55,112,0.08)] transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:bg-brand-950/40 dark:hover:text-brand-300 ${
          unreadCount > 0 ? 'border-rose-200 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800'
        }`}
        aria-label={`Thông báo${unreadCount > 0 ? `, ${unreadCount} chưa đọc` : ''}`}
        aria-expanded={isOpen}
        title="Thông báo"
      >
        <BellIcon size={20} className={isRinging ? 'animate-bell-ring text-rose-600' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-slate-50 dark:ring-slate-950">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Thông báo</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{unreadCount} thông báo chưa đọc</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/50"
                title="Đánh dấu tất cả đã đọc"
                aria-label="Đánh dấu tất cả thông báo là đã đọc"
              >
                <CheckCheck size={18} />
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              <CircleAlert size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                Đang tải thông báo...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Bell size={24} className="mx-auto text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">Chưa có thông báo</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
                    notification.is_read ? 'bg-white dark:bg-slate-900' : 'bg-brand-50/60 dark:bg-brand-950/20'
                  }`}
                >
                  <NotificationIcon kind={notification.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm font-bold leading-5 text-slate-900 dark:text-slate-100">
                        {notification.title}
                      </span>
                      {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {notification.message}
                    </span>
                    <span className="mt-1 block text-[11px] font-medium text-slate-400">
                      {formatNotificationTime(notification.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
