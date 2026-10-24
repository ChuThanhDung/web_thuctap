import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi as vitest } from 'vitest';

const api = vitest.hoisted(() => ({
  getNotifications: vitest.fn(),
  markAllNotificationsRead: vitest.fn(),
  markNotificationRead: vitest.fn(),
}));

vitest.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAvatarViewUrl: () => null,
  getNotificationWebSocketUrl: () => 'ws://localhost/ws',
  ...api,
}));

import NotificationBell from '../components/NotificationBell.jsx';
import Sidebar from '../components/Sidebar.jsx';
import useMediaQuery from '../lib/useMediaQuery.js';
import { PageHeader, Tooltip } from '../ui/index.js';

const accountant = { id: 1, role: 'accountant', full_name: 'Chu Thanh Dũng (Kế toán viên)' };
const chief = { id: 2, role: 'chief_accountant', full_name: 'Trần Văn Minh' };

function renderSidebar(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/accountant']}>
      <Sidebar token="t" user={accountant} onLogout={() => {}} onToggleTheme={() => {}} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vitest.stubGlobal('WebSocket', class { addEventListener() {} send() {} close() {} });
  api.getNotifications.mockResolvedValue({ items: [], unread_count: 0 });
});

afterEach(() => {
  vitest.unstubAllGlobals();
});

describe('Sidebar', () => {
  it('lists navigation for the accountant role', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Tổng quan',
      'Tải chứng từ',
      'Bộ đối soát',
    ]);
  });

  it('gives the chief accountant user management and the tolerance settings', () => {
    renderSidebar({ user: chief });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent);
    expect(labels).toContain('Quản lý tài khoản');
    expect(labels).toContain('Ngưỡng sai số');
    expect(within(nav).getByRole('link', { name: 'Ngưỡng sai số' })).toHaveAttribute('href', '/settings');
  });

  it('marks the current page and shows the real name with the role underneath (no separate role card)', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Chu Thanh Dũng')).toBeInTheDocument();
    expect(screen.getByText('Kế toán viên')).toBeInTheDocument();
    expect(screen.queryByText(/vai trò/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Không gian kế toán/)).not.toBeInTheDocument();
  });

  it('switches the theme with two icon buttons that still have accessible names', async () => {
    const onToggleTheme = vitest.fn();
    renderSidebar({ theme: 'light', onToggleTheme });
    expect(screen.getByRole('button', { name: 'Giao diện sáng' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Sáng')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Giao diện tối' }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('keeps the collapse control short and puts the bell in the sidebar (no empty top bar)', () => {
    renderSidebar({ canToggle: true });
    expect(screen.getByRole('button', { name: 'Thu gọn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Thông báo/ })).toBeInTheDocument();
  });

  it('collapsed: every control keeps an accessible name and shows a tooltip on keyboard focus', async () => {
    renderSidebar({ compact: true, canToggle: true });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getByRole('link', { name: 'Tải chứng từ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở rộng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thông tin cá nhân: Chu Thanh Dũng/ })).toBeInTheDocument();

    await userEvent.tab(); // chuông thông báo
    await userEvent.tab(); // liên kết "Tổng quan"
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Tổng quan');
  });

  it('drawer: opens as a dialog, closes with Escape and after choosing a page', async () => {
    const onClose = vitest.fn();
    renderSidebar({ drawer: true, open: true, onClose });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Bộ đối soát' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('link', { name: 'Bộ đối soát' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('PageHeader', () => {
  it('renders one H1, the description and the primary action', () => {
    render(<PageHeader title="Quản lý tài khoản" description="Mô tả ngắn." actions={<button type="button">Tạo tài khoản</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Quản lý tài khoản' })).toBeInTheDocument();
    expect(screen.getByText('Mô tả ngắn.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo tài khoản' })).toBeInTheDocument();
  });
});

describe('Tooltip (side=right)', () => {
  it('appears to the right of the trigger on focus and hides on Escape', async () => {
    render(
      <Tooltip content="Ngưỡng sai số" side="right">
        <button type="button" aria-label="Ngưỡng sai số" />
      </Tooltip>,
    );
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveClass('-translate-y-1/2');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('follows the media query as it changes', () => {
    let listener;
    const list = {
      matches: false,
      addEventListener: (_event, callback) => {
        listener = callback;
      },
      removeEventListener: () => {},
    };
    window.matchMedia = () => list;

    function Probe() {
      return <span>{useMediaQuery('(min-width: 768px)') ? 'wide' : 'narrow'}</span>;
    }
    render(<Probe />);
    expect(screen.getByText('narrow')).toBeInTheDocument();

    list.matches = true;
    act(() => listener());
    expect(screen.getByText('wide')).toBeInTheDocument();
  });
});

describe('NotificationBell', () => {
  const items = [
    { id: 1, kind: 'batch_rejected', title: 'Bộ bị từ chối', message: 'Cần bổ sung GRN.', is_read: false, created_at: '2026-10-11 09:36:04', action_url: '/audit-trail' },
    { id: 2, kind: 'batch_ready', title: 'Bộ mới', message: 'Chờ duyệt.', is_read: true, created_at: '2026-10-10 08:00:00' },
  ];

  beforeEach(() => {
    vitest.stubGlobal('WebSocket', class { addEventListener() {} send() {} close() {} });
    api.getNotifications.mockResolvedValue({ items, unread_count: 1 });
    api.markAllNotificationsRead.mockResolvedValue({});
    api.markNotificationRead.mockResolvedValue({});
  });

  afterEach(() => {
    vitest.unstubAllGlobals();
    vitest.clearAllMocks();
  });

  function renderBell() {
    return render(
      <MemoryRouter>
        <NotificationBell token="t" />
      </MemoryRouter>,
    );
  }

  it('announces the unread count in the button name and lists notifications with the standard date format', async () => {
    renderBell();
    const button = await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' });
    await userEvent.click(button);
    expect(await screen.findByText('Bộ bị từ chối')).toBeInTheDocument();
    expect(screen.getByText('11/10/2026 09:36')).toBeInTheDocument();
    expect(screen.getByText('Chưa đọc')).toBeInTheDocument();
  });

  it('marks all as read and closes with Escape', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /^Thông báo/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    expect(api.markAllNotificationsRead).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Thông báo' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Bộ bị từ chối')).not.toBeInTheDocument();
  });
});
