import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Download, X } from 'lucide-react';
import { getInvitations, getUserAccounts } from '../api.js';
import { ROUTES } from '../routes.js';
import { Button, Card, cn } from '../ui/index.js';

// Bộ chứng từ mẫu (dữ liệu thử, cố ý lệch đơn giá) nằm trong frontend/public/bo-mau.
const SAMPLE_FILES = [
  ['/bo-mau/1-don-dat-hang.xml', 'Đơn đặt hàng'],
  ['/bo-mau/2-phieu-nhap-kho.xml', 'Phiếu nhập kho'],
  ['/bo-mau/3-hoa-don.xml', 'Hóa đơn'],
];
const DISMISS_KEY = 'docusync_onboarding_dismissed';

function readDismissed(organizationId) {
  try {
    return window.localStorage.getItem(`${DISMISS_KEY}:${organizationId}`) === '1';
  } catch {
    return false;
  }
}

function SampleLinks() {
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {SAMPLE_FILES.map(([href, label]) => (
        <a
          key={href}
          href={href}
          download
          className="inline-flex items-center gap-1.5 rounded-control border border-line-input bg-surface px-2.5 py-1 text-xs font-semibold text-fg hover:bg-surface-muted"
        >
          <Download size={13} aria-hidden="true" /> {label}
        </a>
      ))}
    </span>
  );
}

/**
 * Ba bốn việc đầu tiên cho công ty mới, tự đánh dấu xong theo dữ liệu thật (người dùng, bộ đối soát).
 * Ẩn khi đã xong hết hoặc người dùng bấm ẩn (nhớ theo công ty trên trình duyệt này).
 */
export default function OnboardingChecklist({ token, user, batches }) {
  const organizationId = user.organization?.id || 'none';
  const isChief = user.role === 'chief_accountant';
  const [dismissed, setDismissed] = useState(() => readDismissed(organizationId));
  const [teamReady, setTeamReady] = useState(null);

  useEffect(() => {
    if (!isChief || dismissed) return;
    Promise.all([getUserAccounts(token), getInvitations(token)])
      .then(([users, invitations]) => setTeamReady(users.items.length > 1 || invitations.length > 0))
      .catch(() => setTeamReady(null));
  }, [isChief, dismissed, token]);

  const hasBatch = batches.length > 0;
  const hasApproved = batches.some((batch) => ['approved', 'final_approved'].includes(batch.status));
  const hasFinal = batches.some((batch) => batch.status === 'final_approved');

  const steps = isChief
    ? [
        { done: Boolean(user.mfa_enabled), title: 'Bật xác thực hai lớp', body: 'Đã bật khi bạn đăng nhập lần đầu. Cất kỹ mã khôi phục.' },
        {
          done: teamReady === true,
          title: 'Mời kế toán viên',
          body: 'Người tải chứng từ và duyệt cấp 1.',
          action: <Link to={ROUTES.users} className="font-semibold text-primary underline-offset-2 hover:underline">Mời qua email</Link>,
        },
        {
          done: hasBatch,
          title: 'Thử một bộ mẫu',
          body: 'Gửi ba file mẫu cho kế toán viên tải lên để xem cách hệ thống chỉ ra chỗ lệch đơn giá.',
          extra: <SampleLinks />,
        },
        { done: hasFinal, title: 'Duyệt cuối bộ đầu tiên', body: 'Bộ đã duyệt cuối được khóa thành hồ sơ lưu trữ.' },
      ]
    : [
        {
          done: hasBatch,
          title: 'Tải một bộ mẫu',
          body: 'Tải ba file mẫu về, rồi kéo vào trang Tải chứng từ. Bộ mẫu cố ý lệch đơn giá.',
          extra: <SampleLinks />,
          action: <Link to={ROUTES.upload} className="font-semibold text-primary underline-offset-2 hover:underline">Mở trang Tải chứng từ</Link>,
        },
        { done: hasApproved, title: 'Duyệt bộ đầu tiên', body: 'Bộ khớp hoặc lệch nhỏ duyệt được; bộ lệch lớn cần chứng từ đúng thay thế.' },
      ];

  const remaining = steps.filter((step) => !step.done).length;
  if (dismissed || remaining === 0) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(`${DISMISS_KEY}:${organizationId}`, '1');
    } catch {
      // Trình duyệt chặn lưu trữ: chỉ ẩn trong lần mở này.
    }
    setDismissed(true);
  }

  return (
    <Card aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="onboarding-title" className="text-base font-semibold text-fg">Bắt đầu với DocuSync</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Còn {remaining} / {steps.length} việc. <Link to={ROUTES.guide} className="text-primary underline-offset-2 hover:underline">Xem hướng dẫn</Link>
          </p>
        </div>
        <Button iconOnly size="sm" variant="ghost" aria-label="Ẩn danh sách bắt đầu" onClick={dismiss}>
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-3 px-5 py-3">
            {step.done ? (
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-tone-success-fg" aria-label="Đã xong" />
            ) : (
              <Circle size={20} className="mt-0.5 shrink-0 text-fg-subtle" aria-label="Chưa xong" />
            )}
            <div className="min-w-0 text-sm">
              <p className={cn('font-semibold', step.done ? 'text-fg-muted line-through decoration-fg-subtle' : 'text-fg')}>{step.title}</p>
              {!step.done && (
                <>
                  <p className="text-fg-muted">{step.body}</p>
                  {step.extra}
                  {step.action && <p className="mt-1.5">{step.action}</p>}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
