import React from 'react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastProvider } from '../ui/index.js';
import Billing from '../pages/Billing.jsx';

const GB = 1024 ** 3;
const plan = (code, name, monthly, users, batches, ai, storage) => ({
  code,
  name,
  monthly_price: monthly,
  yearly_price: monthly * 10,
  users,
  batches_per_month: batches,
  ai_files_per_month: ai,
  storage_bytes: storage,
  retention_months: 60,
  support: 'Email',
});

const OVERVIEW = {
  organization: { id: 'o1', name: 'Công ty A', plan: 'free', effective_plan: 'free', trial_ends_at: null, plan_expires_at: null, status: 'active' },
  limits: plan('free', 'Free', 0, 2, 15, 10, 0.2 * GB),
  usage: { period: '2026-11', users: 2, batches: 12, ai_files: 10, storage_bytes: 50 * 1024 ** 2 },
  plans: [plan('free', 'Free', 0, 2, 15, 10, 0.2 * GB), plan('pro', 'Pro', 490000, 10, 300, 600, 10 * GB), plan('ultra', 'Ultra', 1490000, null, 2000, 5000, 50 * GB)],
  billing_enabled: true,
};

function mockFetch(routes) {
  vitest.stubGlobal(
    'fetch',
    vitest.fn(async (url) => {
      const key = Object.keys(routes).find((path) => String(url).includes(path));
      return { ok: true, status: 200, json: async () => routes[key] };
    }),
  );
}

afterEach(() => vitest.unstubAllGlobals());

describe('Billing page', () => {
  it('shows usage against limits and prices for the chosen period', async () => {
    mockFetch({ '/billing/overview': OVERVIEW, '/billing/payments': [] });
    render(
      <ToastProvider>
        <Billing token="t" />
      </ToastProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Gói & thanh toán' })).toBeInTheDocument();
    const aiMeter = screen.getByRole('meter', { name: 'File PDF/ảnh đọc bằng AI trong tháng' });
    expect(aiMeter).toHaveAttribute('aria-valuenow', '10');
    expect(aiMeter).toHaveAttribute('aria-valuemax', '10');
    // Mặc định trả 12 tháng: giá Pro là 10 tháng.
    expect(screen.getByText('4.900.000 đ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chuyển sang Pro' })).toBeEnabled();
    expect(screen.getByText('Không giới hạn người dùng')).toBeInTheDocument();
    expect(screen.getByText('Chưa có giao dịch nào.')).toBeInTheDocument();
  });

  it('disables checkout when online payment is off', async () => {
    mockFetch({ '/billing/overview': { ...OVERVIEW, billing_enabled: false }, '/billing/payments': [] });
    render(
      <ToastProvider>
        <Billing token="t" />
      </ToastProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Chuyển sang Pro' })).toBeDisabled();
    expect(screen.getByText(/Thanh toán trực tuyến chưa bật/)).toBeInTheDocument();
  });
});
