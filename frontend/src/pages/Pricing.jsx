import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Mail, Minus } from 'lucide-react';
import { getLegalInfo, getPublicPlans } from '../api.js';
import { formatNumber, formatVND } from '../lib/format.js';
import { ROUTES } from '../routes.js';
import BrandMark from '../components/BrandMark.jsx';
import { cn } from '../ui/index.js';

function storage(bytes) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${formatNumber(gb)} GB` : `${formatNumber(Math.round(bytes / 1024 ** 2))} MB`;
}

function retention(months) {
  return months >= 12 ? `${months / 12} năm` : `${months} tháng`;
}

// Các dòng so sánh: lấy từ GET /billing/plans, cùng nguồn với phần chặn hạn mức trong hệ thống.
const ROWS = [
  ['Người dùng (kể cả lời mời đang chờ)', (plan) => (plan.users === null ? 'Không giới hạn' : formatNumber(plan.users))],
  ['Bộ đối soát mỗi tháng', (plan) => formatNumber(plan.batches_per_month)],
  ['File PDF/ảnh đọc bằng AI mỗi tháng', (plan) => formatNumber(plan.ai_files_per_month)],
  ['Lượt trợ lý AI mỗi tháng', (plan) => formatNumber(plan.agent_calls_per_month)],
  ['Hóa đơn XML', () => 'Không tính lượt AI'],
  ['Dung lượng lưu trữ', (plan) => storage(plan.storage_bytes)],
  ['Giữ hồ sơ', (plan) => retention(plan.retention_months)],
  ['Duyệt hai cấp, khóa hồ sơ, nhật ký', () => true],
  ['Xác thực hai lớp, mã hóa CCCD', () => true],
  ['Hỗ trợ', (plan) => plan.support],
];

const FAQ = [
  ['Thanh toán thế nào?', 'Chuyển khoản ngân hàng qua mã QR trong trang Gói & thanh toán. Gói tự kích hoạt khi tiền về, có email xác nhận. Không cần thẻ.'],
  ['Hết hạn gói thì sao?', 'Công ty tự về gói Free, dữ liệu giữ nguyên; thao tác vượt hạn mức Free bị chặn cho tới khi gia hạn.'],
  ['Dùng thử có giới hạn gì?', 'Công ty mới được dùng gói Pro miễn phí 14 ngày, không cần thanh toán trước.'],
  ['Giá đã gồm VAT chưa?', 'Chưa. Giá trên chưa gồm thuế giá trị gia tăng.'],
];

export default function Pricing({ backTo = '/' }) {
  const [plans, setPlans] = useState([]);
  const [yearly, setYearly] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    getPublicPlans().then(setPlans).catch(() => setPlans([]));
    getLegalInfo().then((info) => setEmail(info.contact_email || '')).catch(() => setEmail(''));
    const previousTitle = document.title;
    document.title = 'Bảng giá - DocuSync AI';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const contact = email ? `mailto:${email}?subject=${encodeURIComponent('Tư vấn gói DocuSync AI')}` : ROUTES.signup;

  return (
    <div className="min-h-dvh bg-canvas bg-[linear-gradient(180deg,rgb(var(--c-accent-soft))_0%,rgb(var(--c-canvas))_28rem)] bg-no-repeat text-fg">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to={backTo} className="inline-flex items-center gap-2.5 font-bold">
          <BrandMark />
          DocuSync AI
        </Link>
        <nav aria-label="Trang" className="flex items-center gap-5 text-sm">
          <Link to={ROUTES.guide} className="hidden text-fg-muted hover:text-fg hover:underline sm:inline">Hướng dẫn</Link>
          <Link to={ROUTES.login} className="text-fg-muted hover:text-fg hover:underline">Đăng nhập</Link>
          <Link to={backTo} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
            <ArrowLeft size={15} aria-hidden="true" /> Quay lại
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6 pt-8">
          <div>
            <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight tracking-[-0.02em]">Bảng giá</h1>
            <p className="mt-2 max-w-xl leading-7 text-fg-muted">
              Bắt đầu miễn phí. Trả theo tháng hoặc trả trước 12 tháng chỉ tính tiền 10 tháng. Giá chưa gồm VAT.
            </p>
          </div>
          <div role="radiogroup" aria-label="Kỳ thanh toán" className="inline-flex rounded-control border border-line-input bg-surface p-0.5 text-sm">
            {[
              [false, 'Theo tháng'],
              [true, '12 tháng, tặng 2 tháng'],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={yearly === value}
                onClick={() => setYearly(value)}
                className={cn(
                  'rounded-[3px] px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  yearly === value ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Màn hẹp: mỗi gói một tờ, đủ giá, nút và hạn mức. Màn rộng: bảng so sánh. */}
        <div className="mt-8 space-y-4 md:hidden">
          {plans.map((plan) => {
            const price = yearly ? plan.yearly_price : plan.monthly_price;
            return (
              <section key={plan.code} aria-labelledby={`plan-${plan.code}`} className={cn('rounded-card border bg-surface shadow-card', plan.code === 'pro' ? 'border-primary' : 'border-line')}>
                <div className="border-b-2 border-primary px-4 py-4">
                  <h2 id={`plan-${plan.code}`} className="text-base font-semibold text-fg">{plan.name}</h2>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{price ? formatVND(price) : '0 đ'}</p>
                  <p className="text-xs text-fg-subtle">{price ? (yearly ? `cho 12 tháng · ${formatVND(Math.round(price / 12))}/tháng` : 'mỗi tháng') : 'không thời hạn'}</p>
                  {plan.code === 'free' ? (
                    <Link to={ROUTES.signup} className="mt-3 flex min-h-10 items-center justify-center whitespace-nowrap rounded-control border border-line-input bg-surface px-3 font-semibold text-fg hover:bg-surface-muted">
                      Đăng ký dùng thử
                    </Link>
                  ) : (
                    <a href={contact} className="mt-3 flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-primary px-3 font-semibold text-primary-fg hover:bg-primary-hover">
                      <Mail size={15} aria-hidden="true" /> Liên hệ tư vấn
                    </a>
                  )}
                </div>
                <dl className="divide-y divide-line text-sm">
                  {ROWS.map(([label, value]) => {
                    const cell = value(plan);
                    return (
                      <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <dt className="text-fg-muted">{label}</dt>
                        <dd className="shrink-0 text-right font-medium tabular-nums text-fg">
                          {cell === true ? <Check size={18} className="ml-auto text-tone-success-fg" aria-label="Có" /> : cell}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            );
          })}
        </div>

        <div className="mt-8 hidden overflow-x-auto rounded-card border border-line bg-surface shadow-card md:block">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">So sánh các gói DocuSync AI</caption>
            <thead className="border-b-2 border-primary align-bottom">
              <tr>
                <th scope="col" className="w-[30%] px-5 py-5 text-left text-xs font-semibold text-fg-muted">Gói</th>
                {plans.map((plan) => {
                  const price = yearly ? plan.yearly_price : plan.monthly_price;
                  return (
                    <th key={plan.code} scope="col" className={cn('px-5 py-5 text-right font-normal', plan.code === 'pro' && 'bg-accent-soft/60')}>
                      <span className="block text-base font-semibold text-fg">{plan.name}</span>
                      <span className="mt-1 block text-2xl font-bold tabular-nums text-fg">{price ? formatVND(price) : '0 đ'}</span>
                      <span className="block text-xs text-fg-subtle">
                        {price ? (yearly ? `cho 12 tháng · ${formatVND(Math.round(price / 12))}/tháng` : 'mỗi tháng') : 'không thời hạn'}
                      </span>
                      {plan.code === 'free' ? (
                        <Link to={ROUTES.signup} className="mt-3 inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-control border border-line-input bg-surface px-3 font-semibold text-fg hover:bg-surface-muted">
                          Đăng ký dùng thử
                        </Link>
                      ) : (
                        <a href={contact} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control bg-primary px-3 font-semibold text-primary-fg hover:bg-primary-hover">
                          <Mail size={15} aria-hidden="true" /> Liên hệ tư vấn
                        </a>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row" className="px-5 py-3 text-left font-medium text-fg">{label}</th>
                  {plans.map((plan) => {
                    const cell = value(plan);
                    return (
                      <td key={plan.code} className={cn('px-5 py-3 text-right tabular-nums text-fg-muted', plan.code === 'pro' && 'bg-accent-soft/60')}>
                        {cell === true ? <Check size={18} className="ml-auto text-tone-success-fg" aria-label="Có" /> : cell === false ? <Minus size={18} className="ml-auto" aria-label="Không" /> : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          Công ty mới được dùng gói Pro 14 ngày miễn phí. Nâng cấp, gia hạn bằng chuyển khoản trong trang Gói & thanh toán.
        </p>

        <section aria-labelledby="faq-title" className="mt-14 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <h2 id="faq-title" className="text-xl font-bold">Câu hỏi về thanh toán</h2>
          <dl className="divide-y divide-line rounded-card border border-line bg-surface">
            {FAQ.map(([question, answer]) => (
              <div key={question} className="px-5 py-4">
                <dt className="font-semibold text-fg">{question}</dt>
                <dd className="mt-1 leading-7 text-fg-muted">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-line px-4 py-6 text-sm text-fg-subtle sm:px-8">
        <span>© {new Date().getFullYear()} DocuSync AI</span>
        <span className="flex gap-5">
          <Link to={ROUTES.terms} className="hover:text-fg-muted hover:underline">Điều khoản sử dụng</Link>
          <Link to={ROUTES.privacyPolicy} className="hover:text-fg-muted hover:underline">Chính sách bảo vệ dữ liệu</Link>
        </span>
      </footer>
    </div>
  );
}
