import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { Bell, BellRing, CheckCheck, CircleAlert, Inbox, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications,
  getNotificationWebSocketUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api.js';
import { vi } from '../i18n/vi.js';
import { formatDateTime } from '../lib/format.js';
import { invalidateBatchCache } from '../services/batchCache.js';
import { cn, focusRing } from '../ui/index.js';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

function NotificationIcon({ kind }) {
  const isRejected = kind === 'batch_rejected';
  const Icon = isRejected ? XCircle : Inbox;
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        isRejected ? 'bg-tone-danger-bg text-tone-danger-fg' : 'bg-tone-brand-bg text-tone-brand-fg',
      )}
    >
      <Icon size={17} aria-hidden="true" />
    </span>
  );
}

export default function NotificationBell({ token, variant = 'default' }) {
  const onSidebar = variant === 'sidebar';
  const navigate = useNavigate();
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const ringTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const loadRequestRef = useRef(0);
  const socketRef = useRef(null);
  const mountedRef = useRef(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
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
        setError(err.message || vi.notifications.loadFailed);
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
          invalidateBatchCache();
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

  async function handleNotificationClick(notification, close) {
    if (!notification.is_read) {
      try {
        await markNotificationRead(token, notification.id);
        setNotifications((items) => items.map((item) => (
          item.id === notification.id ? { ...item, is_read: true } : item
        )));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (err) {
        setError(err.message || vi.notifications.updateFailed);
      }
    }
    close();
    invalidateBatchCache();
    if (notification.action_url) navigate(notification.action_url);
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(token);
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      setError('');
    } catch (err) {
      setError(err.message || vi.notifications.updateFailed);
    }
  }

  const BellIcon = isRinging ? BellRing : Bell;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Popover className="relative shrink-0">
      <PopoverButton
        aria-label={vi.notifications.ariaLabel(unreadCount)}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-full transition-colors',
          onSidebar
            ? 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent'
            : cn(
                'border bg-surface text-fg-muted shadow-card hover:bg-surface-muted hover:text-fg',
                unreadCount > 0 ? 'border-tone-danger-line' : 'border-line',
                focusRing,
              ),
        )}
      >
        <BellIcon size={20} aria-hidden="true" className={isRinging ? 'animate-bell-ring text-tone-danger-fg motion-reduce:animate-none' : ''} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tone-danger-fg px-1 text-[10px] font-bold leading-none text-canvas ring-2',
              onSidebar ? 'ring-sidebar' : 'ring-canvas',
            )}
          >
            {badgeLabel}
          </span>
        )}
      </PopoverButton>

      <PopoverPanel
        anchor={{ to: onSidebar ? 'right start' : 'bottom end', gap: 8 }}
        className="z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-surface shadow-pop focus:outline-none"
      >
        {({ close }) => (
          <>
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{vi.notifications.title}</p>
                <p className="mt-0.5 text-xs text-fg-muted" aria-live="polite">
                  {vi.notifications.unreadCount(unreadCount)}
                </p>
              </div>
              <button
                type="button"
                onClick={unreadCount > 0 ? handleMarkAllRead : undefined}
                aria-disabled={unreadCount === 0}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-soft aria-disabled:cursor-not-allowed aria-disabled:text-fg-subtle aria-disabled:hover:bg-transparent',
                  focusRing,
                )}
                title={vi.notifications.markAllRead}
                aria-label={vi.notifications.markAllRead}
              >
                <CheckCheck size={18} aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 border-b border-tone-danger-line bg-tone-danger-bg px-4 py-2.5 text-xs font-medium text-tone-danger-fg">
                <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="max-h-[min(420px,60vh)] overflow-y-auto">
              {isLoading ? (
                <div role="status" className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-fg-muted">
                  <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none" />
                  {vi.notifications.loading}
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Bell size={24} aria-hidden="true" className="mx-auto text-fg-subtle" />
                  <p className="mt-2 text-sm font-medium text-fg-muted">{vi.notifications.empty}</p>
                </div>
              ) : (
                <ul>
                  {notifications.map((notification) => (
                    <li key={notification.id} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification, close)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted',
                          notification.is_read ? 'bg-surface' : 'bg-accent-soft',
                          focusRing,
                        )}
                      >
                        <NotificationIcon kind={notification.kind} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-fg">{notification.title}</span>
                            {!notification.is_read && (
                              <>
                                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                <span className="sr-only">{vi.notifications.unread}</span>
                              </>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-fg-muted">{notification.message}</span>
                          <span className="mt-1 block text-xs text-fg-subtle">{formatDateTime(notification.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
