import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { createCheckout, getBillingOverview, getCurrentUser, getPayment, getPayments } from '../api.js';
import { vi } from '../i18n/vi.js';
import { formatDate, formatNumber, formatVND } from '../lib/format.js';
import { Badge, Button, Card, CardHeader, Modal, PageHeader, Table, TBody, TD, TH, THead, TR, cn, useToast } from '../ui/index.js';

const POLL_MS = 5000;
const PAYMENT_STATUS = {
  pending: { label: 'Chờ chuyển khoản', tone: 'warning' },
  paid: { label: 'Đã thanh toán', tone: 'success' },
  expired: { label: 'Hết hạn', tone: 'neutral' },
};

function formatStorage(bytes) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${formatNumber(Math.round(gb * 10) / 10)} GB` : `${formatNumber(Math.round(bytes / 1024 ** 2))} MB`;
}

/** Thanh mức dùng: đổi sang màu cảnh báo từ 80%, màu lỗi khi hết. */
function UsageMeter({ label, used, limit, format = formatNumber }) {
  const unlimited = limit === null || limit === undefined;
  const ratio = unlimited ? 0 : Math.min(1, used / Math.max(limit, 1));
  const tone = ratio >= 1 ? 'bg-tone-danger-fg' : ratio >= 0.8 ? 'bg-tone-warning-fg' : 'bg-primary';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums text-fg">
          <strong>{format(used)}</strong>
          {unlimited ? ' · không giới hạn' : ` / ${format(limit)}`}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={unlimited ? undefined : limit}
        aria-valuenow={used}
      >
        <div className={cn('h-full rounded-full transition-[width]', tone)} style={{ width: `${unlimited ? 0 : ratio * 100}%` }} />
      </div>
    </div>
  );
}

function planFeatures(plan) {
  return [
    plan.users === null ? 'Không giới hạn người dùng' : `${plan.users} người dùng`,
    `${formatNumber(plan.batches_per_month)} bộ đối soát / tháng`,
    `${formatNumber(plan.ai_files_per_month)} file PDF/ảnh đọc bằng AI / tháng`,
    ...(plan.agent_calls_per_month ? [`${formatNumber(plan.agent_calls_per_month)} lượt trợ lý AI / tháng`] : []),
    'XML đọc trực tiếp, không tính lượt AI',
    `Lưu trữ ${formatStorage(plan.storage_bytes)}`,
    `Giữ hồ sơ ${plan.retention_months >= 12 ? `${plan.retention_months / 12} năm` : `${plan.retention_months} tháng`}`,
    plan.support,
  ];
}

function CopyRow({ label, value, display }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`Đã chép ${label.toLowerCase()}.`);
    } catch {
      toast.warning('Trình duyệt chặn sao chép, hãy chép thủ công.');
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <strong className="text-right text-sm tabular-nums text-fg">{display ?? value}</strong>
        <Button iconOnly size="sm" variant="ghost" aria-label={`Chép ${label.toLowerCase()}`} onClick={copy}>
          <Copy size={14} aria-hidden="true" />
        </Button>
      </span>
    </div>
  );
}

function PaymentModal({ token, payment, onClose, onPaid }) {
  const [current, setCurrent] = useState(payment);

  useEffect(() => setCurrent(payment), [payment]);

  // Hỏi lại trạng thái vài giây một lần cho tới khi SePay báo tiền về.
  useEffect(() => {
    if (!payment || current?.status !== 'pending') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await getPayment(token, payment.id);
        setCurrent((previous) => ({ ...next, transfer: next.transfer ?? previous?.transfer }));
        if (next.status === 'paid') onPaid(next);
      } catch {
        // Mạng chập chờn: lần sau hỏi lại.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [token, payment, current?.status, onPaid]);

  if (!payment) return null;
  const transfer = current?.transfer;
  const paid = current?.status === 'paid';

  return (
    <Modal
      open
      onClose={onClose}
      title={paid ? 'Đã nhận thanh toán' : `Thanh toán gói ${vi.plans[payment.plan]}`}
      description={paid ? undefined : `${payment.months === 12 ? '12 tháng' : '1 tháng'} · ${formatVND(payment.amount)}`}
      footer={<Button variant={paid ? 'primary' : 'secondary'} onClick={onClose}>{vi.actions.close}</Button>}
    >
      {paid ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={40} className="text-tone-success-fg" aria-hidden="true" />
          <p className="text-sm text-fg">
            Gói <strong>{vi.plans[payment.plan]}</strong> đã được kích hoạt đến hết ngày{' '}
            <strong>{formatDate(current.period_end)}</strong>. Email xác nhận đã gửi tới kế toán trưởng.
          </p>
        </div>
      ) : transfer ? (
        <div className="grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-start">
          <img
            src={transfer.qr_url}
            alt={`Mã QR chuyển ${formatVND(transfer.amount)} với nội dung ${transfer.content}`}
            className="mx-auto w-52 rounded-card border border-line bg-white p-2"
          />
          <div>
            <p className="mb-2 text-sm text-fg-muted">
              Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản theo thông tin dưới đây. Giữ đúng <strong>nội dung</strong>{' '}
              để hệ thống tự kích hoạt gói.
            </p>
            <CopyRow label="Ngân hàng" value={transfer.bank_code} />
            <CopyRow label="Số tài khoản" value={transfer.account_number} />
            {transfer.account_name && <CopyRow label="Chủ tài khoản" value={transfer.account_name} />}
            <CopyRow label="Số tiền" value={transfer.amount} display={formatVND(transfer.amount)} />
            <CopyRow label="Nội dung" value={transfer.content} />
            <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted" role="status">
              <span className="h-2 w-2 animate-pulse rounded-full bg-tone-warning-fg" aria-hidden="true" />
              Đang chờ tiền về. Thường mất dưới 1 phút sau khi chuyển; có thể đóng cửa sổ này, gói vẫn tự kích hoạt.
            </p>
            <p className="mt-1 text-xs text-fg-subtle">Đơn giữ đến {formatDate(current.expires_at)}.</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Đơn này không còn chờ thanh toán.</p>
      )}
    </Modal>
  );
}

export default function Billing({ token, onUserUpdate }) {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [months, setMonths] = useState(12);
  const [busyPlan, setBusyPlan] = useState('');
  const [activePayment, setActivePayment] = useState(null);

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextPayments] = await Promise.all([getBillingOverview(token), getPayments(token)]);
      setOverview(nextOverview);
      setPayments(nextPayments);
    } catch (err) {
      toast.error(err.message);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheckout(plan) {
    setBusyPlan(plan);
    try {
      setActivePayment(await createCheckout(token, plan, months));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyPlan('');
    }
  }

  const handlePaid = useCallback(async () => {
    await load();
    try {
      onUserUpdate?.(await getCurrentUser(token));
    } catch {
      // Thông tin gói trên thanh bên cập nhật ở lần mở app sau.
    }
  }, [load, onUserUpdate, token]);

  async function openPending(payment) {
    try {
      setActivePayment(await getPayment(token, payment.id));
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!overview) {
    return <p className="text-sm text-fg-muted">{vi.common.loading}</p>;
  }

  const { organization, limits, usage, plans, billing_enabled: billingEnabled } = overview;
  const current = organization.effective_plan;
  const paidUntil = organization.plan_expires_at;
  const inTrial = organization.trial_ends_at && new Date(organization.trial_ends_at) > new Date() && organization.plan !== current;

  return (
    <div className="space-y-5">
      <PageHeader title="Gói & thanh toán" description="Gói đang dùng, mức dùng tháng này và nâng cấp gói bằng chuyển khoản." />

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Gói {vi.plans[current]}
              {inTrial && <Badge tone="info" size="sm">Dùng thử đến {formatDate(organization.trial_ends_at)}</Badge>}
              {!inTrial && paidUntil && <Badge tone="neutral" size="sm">Hiệu lực đến {formatDate(paidUntil)}</Badge>}
            </span>
          }
          description={`Mức dùng tháng ${usage.period.slice(5)}/${usage.period.slice(0, 4)}. Hết hạn gói thì chuyển về Free, dữ liệu vẫn giữ nguyên.`}
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <UsageMeter label="Người dùng (kể cả lời mời đang chờ)" used={usage.users} limit={limits.users} />
          <UsageMeter label="Bộ đối soát tạo trong tháng" used={usage.batches} limit={limits.batches_per_month} />
          <UsageMeter label="File PDF/ảnh đọc bằng AI trong tháng" used={usage.ai_files} limit={limits.ai_files_per_month} />
          {limits.agent_calls_per_month ? (
            <UsageMeter label="Lượt trợ lý AI trong tháng" used={usage.agent_calls || 0} limit={limits.agent_calls_per_month} />
          ) : null}
          <UsageMeter label="Dung lượng lưu trữ" used={usage.storage_bytes} limit={limits.storage_bytes} format={formatStorage} />
        </div>
      </Card>

      <section aria-labelledby="plans-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-heading" className="text-base font-semibold text-fg">Các gói</h2>
          <div role="radiogroup" aria-label="Kỳ hạn thanh toán" className="inline-flex rounded-control border border-line-input bg-surface p-0.5">
            {[
              [1, 'Theo tháng'],
              [12, '12 tháng (tặng 2 tháng)'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={months === value}
                onClick={() => setMonths(value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  months === value ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.code === current;
            const price = months === 12 ? plan.yearly_price : plan.monthly_price;
            const renew = isCurrent && plan.code === organization.plan && paidUntil;
            return (
              <Card key={plan.code} className={cn('flex flex-col p-5', isCurrent && 'border-primary ring-1 ring-primary')}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-fg">{plan.name}</h3>
                  {isCurrent && <Badge tone="brand" size="sm">Đang dùng</Badge>}
                </div>
                <p className="mt-2">
                  <span className="text-2xl font-semibold tabular-nums text-fg">{plan.monthly_price ? formatVND(price) : '0 đ'}</span>
                  {plan.monthly_price > 0 && <span className="text-sm text-fg-muted"> / {months === 12 ? '12 tháng' : 'tháng'}</span>}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-fg-muted">
                  {planFeatures(plan).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-tone-success-fg" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.monthly_price > 0 && (
                  <Button
                    className="mt-5 w-full"
                    variant={isCurrent ? 'secondary' : 'primary'}
                    loading={busyPlan === plan.code}
                    disabled={!billingEnabled || (isCurrent && !renew && !inTrial)}
                    onClick={() => handleCheckout(plan.code)}
                  >
                    {renew ? 'Gia hạn' : inTrial && isCurrent ? `Mua gói ${plan.name}` : isCurrent ? 'Đang dùng' : `Chuyển sang ${plan.name}`}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
        {!billingEnabled && (
          <p className="text-sm text-fg-muted">Thanh toán trực tuyến chưa bật. Liên hệ bộ phận hỗ trợ để nâng cấp gói.</p>
        )}
        <p className="text-xs text-fg-subtle">
          Giá chưa gồm VAT. Đổi sang gói khác thì gói mới tính từ ngày thanh toán; gia hạn cùng gói thì cộng nối tiếp ngày hết hạn.
        </p>
      </section>

      <Card>
        <CardHeader title="Lịch sử thanh toán" />
        {payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-muted">Chưa có giao dịch nào.</p>
        ) : (
          <Table caption="Lịch sử thanh toán">
            <THead>
              <tr>
                <TH>Ngày tạo</TH>
                <TH>Mã đơn</TH>
                <TH>Gói</TH>
                <TH numeric>Số tiền</TH>
                <TH>Trạng thái</TH>
                <TH>Hiệu lực đến</TH>
              </tr>
            </THead>
            <TBody>
              {payments.map((payment) => (
                <TR key={payment.id}>
                  <TD className="whitespace-nowrap">{formatDate(payment.created_at)}</TD>
                  <TD className="font-mono text-xs">{payment.code}</TD>
                  <TD>{vi.plans[payment.plan]} · {payment.months === 12 ? '12 tháng' : '1 tháng'}</TD>
                  <TD numeric>{formatVND(payment.amount)}</TD>
                  <TD>
                    {payment.status === 'pending' ? (
                      <button type="button" onClick={() => openPending(payment)} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
                        Chờ chuyển khoản · xem mã QR
                      </button>
                    ) : (
                      <Badge tone={PAYMENT_STATUS[payment.status]?.tone} size="sm">{PAYMENT_STATUS[payment.status]?.label}</Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">{payment.period_end ? formatDate(payment.period_end) : ''}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <PaymentModal token={token} payment={activePayment} onClose={() => { setActivePayment(null); load(); }} onPaid={handlePaid} />
    </div>
  );
}
