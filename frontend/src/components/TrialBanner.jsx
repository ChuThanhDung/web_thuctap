import React from 'react';
import { Clock3 } from 'lucide-react';
import { vi } from '../i18n/vi.js';
import { formatDate } from '../lib/format.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày dùng thử còn lại (làm tròn lên), hoặc 0 nếu không còn dùng thử. */
export function trialDaysLeft(organization, now = new Date()) {
  if (!organization?.trial_ends_at || organization.effective_plan === organization.plan) return 0;
  const left = new Date(organization.trial_ends_at) - now;
  return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

/** Dải thông báo đầu trang khi công ty đang dùng thử gói cao hơn gói đã trả. */
export default function TrialBanner({ organization }) {
  const days = trialDaysLeft(organization);
  if (!days) return null;
  const urgent = days <= 3;

  return (
    <p
      className={`mb-4 flex items-start gap-2 rounded-card border px-4 py-2.5 text-sm ${
        urgent
          ? 'border-tone-neutral-line bg-tone-neutral-bg text-fg'
          : 'border-tone-info-line bg-tone-info-bg text-tone-info-fg'
      }`}
    >
      <Clock3 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        Đang dùng thử gói {vi.plans[organization.effective_plan]}: còn <strong>{days} ngày</strong> (đến{' '}
        {formatDate(organization.trial_ends_at)}). Sau đó công ty chuyển về gói {vi.plans[organization.plan]}, dữ liệu
        vẫn giữ nguyên.
      </span>
    </p>
  );
}
