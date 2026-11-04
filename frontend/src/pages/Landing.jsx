import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileCode2, FileImage, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getLegalInfo, getPublicPlans } from '../api.js';
import { formatVND } from '../lib/format.js';
import { ROUTES } from '../routes.js';
import BrandMark from '../components/BrandMark.jsx';
import { cn } from '../ui/index.js';

// Sáu trạm một bộ chứng từ đi qua; mỗi trạm là một đoạn của trang, cột trái sáng theo đoạn đang đọc.
const STATIONS = [
  { id: 'tai-ba-lien', label: 'Tải ba liên' },
  { id: 'doc-chung-tu', label: 'Đọc chứng từ' },
  { id: 'so-tung-dong', label: 'So từng dòng hàng' },
  { id: 'duyet-cap-1', label: 'Kế toán viên duyệt' },
  { id: 'duyet-cuoi', label: 'Kế toán trưởng duyệt cuối' },
  { id: 'khoa-ho-so', label: 'Khóa thành hồ sơ' },
];

// Dữ liệu minh họa (không phải khách hàng thật), đúng cách ứng dụng hiển thị.
const ITEMS = [
  { name: 'Giấy A4 Double A 80gsm', unit: 'ram', po: [50, 125000], hd: [50, 128000], grn: [50, 125000], result: 'Đơn giá HĐ cao hơn PO 3.000 đ', tone: 'danger', odd: { hd: 'price' } },
  { name: 'Mực in HP 76A', unit: 'hộp', po: [20, 2150000], hd: [20, 2150000], grn: [18, 2150000], result: 'GRN nhận thiếu 2 hộp', tone: 'danger', odd: { grn: 'qty' } },
  { name: 'Bìa còng 7cm', unit: 'cái', po: [30, 42000], hd: [30, 42000], grn: [30, 42000], result: 'Ba liên khớp', tone: 'success', odd: {} },
];
const COPIES = [
  ['po', 'PO', 'Đơn đặt hàng'],
  ['hd', 'HĐ', 'Hóa đơn'],
  ['grn', 'GRN', 'Phiếu nhập kho'],
];
const number = (value) => new Intl.NumberFormat('vi-VN').format(value);

function useContactEmail() {
  const [email, setEmail] = useState('');
  useEffect(() => {
    getLegalInfo()
      .then((info) => setEmail(info.contact_email || ''))
      .catch(() => setEmail(''));
  }, []);
  return email;
}

function contactHref(email) {
  const subject = encodeURIComponent('Tư vấn DocuSync AI');
  return email ? `mailto:${email}?subject=${subject}` : ROUTES.signup;
}

function CopyChip({ code, title }) {
  return (
    <abbr title={title} className="inline-flex w-10 justify-center rounded-control bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-primary no-underline">
      {code}
    </abbr>
  );
}

const ODD_MARK = 'rounded-control bg-tone-danger-bg px-1 font-semibold text-tone-danger-fg ring-1 ring-tone-danger-line';
// Lệch như bản than khi xấp giấy chưa xếp; thẳng hàng khi đã xếp (settled).
const LOOSE = ['md:-rotate-[2.5deg] md:translate-y-6', 'md:rotate-[1.5deg] md:-translate-y-1', 'md:rotate-[3deg] md:translate-y-3'];
const PLACE = ['md:z-0 md:pr-7 md:translate-y-4', 'md:z-20 md:-mx-3 md:border-line-input', 'md:z-10 md:pl-7 md:translate-y-2'];

/** Ba liên của một giao dịch xếp thành xấp bản than, HĐ nằm trên. Xếp xong thì ô khác hai liên còn lại bật lệch 8px. */
function StackedCopies({ settled }) {
  return (
    <div
      role="img"
      aria-label="Ba liên PO, hóa đơn và phiếu nhập kho của cùng một giao dịch; đơn giá giấy A4 trên hóa đơn và số mực trên phiếu nhập kho khác hai liên còn lại (dữ liệu minh họa)"
      className="grid gap-3 md:grid-cols-3 md:gap-0 md:px-3"
    >
      {COPIES.map(([key, code, title], index) => (
        <div
          key={key}
          className={cn(
            'relative rounded-card border border-line bg-surface p-4 shadow-card transition-transform duration-700 ease-out motion-reduce:transition-none',
            PLACE[index],
            !settled && LOOSE[index],
          )}
        >
          <div className="mb-2 flex items-center justify-between border-b-2 border-primary pb-2">
            <CopyChip code={code} title={title} />
            <span className="text-xs text-fg-subtle">{title}</span>
          </div>
          <dl className="text-sm">
            {ITEMS.map((item) => {
              const [qty, price] = item[key];
              const odd = item.odd[key];
              const nudge = cn(ODD_MARK, 'inline-block transition-transform delay-500 duration-500 ease-out motion-reduce:transition-none', settled && 'translate-x-2');
              return (
                <div key={item.name} className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
                  <dt className="min-w-0 truncate text-fg-muted">{item.name}</dt>
                  <dd className="shrink-0 whitespace-nowrap pr-2 text-right tabular-nums text-fg">
                    <span className={cn(odd === 'qty' && nudge)}>{qty}</span>
                    <span className={cn('pr-1 text-fg-subtle', odd === 'qty' ? 'pl-3' : 'pl-1')}>×</span>
                    <span className={cn(odd === 'price' && nudge)}>{number(price)}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

function Station({ id, index, title, children, className, as: Heading = 'h2' }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-6 border-t border-line py-16 first:border-t-0 lg:py-20', className)}>
      <Heading id={`${id}-title`} className="flex max-w-4xl items-start gap-4 text-balance text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight tracking-[-0.015em] text-fg">
        {/* Số trạm khớp vòng số ở cột hành trình bên trái. */}
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary text-base text-primary tabular-nums" aria-hidden="true">
          {index}
        </span>
        <span>{title}</span>
      </Heading>
      <div className="mt-6">{children}</div>
    </section>
  );
}

const ACTION_TONES = {
  // Trên giấy: nền xanh mẫu biểu. Trên nền navy (cột hành trình, khối liên hệ): giấy trắng chữ navy.
  solid: 'bg-primary text-primary-fg hover:bg-primary-hover focus-visible:ring-primary focus-visible:ring-offset-canvas',
  inverse: 'bg-sidebar-fg text-sidebar hover:bg-sidebar-fg/90 focus-visible:ring-sidebar-accent focus-visible:ring-offset-sidebar',
};

function PrimaryAction({ href, tone = 'solid', className, children = 'Liên hệ tư vấn' }) {
  return (
    <a href={href} className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 font-semibold shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2', ACTION_TONES[tone], className)}>
      <Mail size={17} aria-hidden="true" />
      {children}
    </a>
  );
}

export default function Landing() {
  const contactEmail = useContactEmail();
  const contact = contactHref(contactEmail);
  const [active, setActive] = useState(STATIONS[0].id);
  const [settled, setSettled] = useState(false);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    getPublicPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  // Khoảnh khắc đặc trưng: xấp ba liên mở ra lệch nhau, rồi tự xếp thẳng hàng và chỉ ra ô lệch.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setSettled(true), reduce ? 0 : 900);
    return () => window.clearTimeout(timer);
  }, []);

  // Cột hành trình sáng theo trạm đang đọc.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    STATIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) spy.observe(element);
    });
    return () => spy.disconnect();
  }, []);

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      {/* Cột hành trình: trên màn rộng cố định bên trái; màn hẹp thành thanh trên cùng. */}
      <aside className="sticky top-0 z-20 bg-[linear-gradient(180deg,rgb(var(--c-sidebar))_0%,rgb(var(--c-sidebar-end))_100%)] text-sidebar-fg lg:fixed lg:inset-y-0 lg:left-0 lg:w-[300px]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-7 lg:py-7">
          <Link to="/" className="flex items-center gap-2.5 font-bold">
            <BrandMark />
            DocuSync AI
          </Link>
          <PrimaryAction href={contact} tone="inverse" className="min-h-10 !px-3 text-sm lg:hidden">
            Liên hệ
          </PrimaryAction>
        </div>
        <nav aria-label="Hành trình một bộ chứng từ" className="hidden px-4 lg:block">
          <ol className="mt-6 space-y-1">
            {STATIONS.map((station, index) => {
              const on = active === station.id;
              return (
                <li key={station.id}>
                  <a
                    href={`#${station.id}`}
                    aria-current={on ? 'step' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent',
                      on ? 'bg-sidebar-fg/15 font-semibold text-sidebar-fg ring-1 ring-inset ring-sidebar-fg/25' : 'text-sidebar-muted hover:bg-sidebar-fg/10 hover:text-sidebar-fg',
                    )}
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums', on ? 'border-sidebar-accent bg-sidebar-accent text-sidebar' : 'border-sidebar-muted')}>
                      {index + 1}
                    </span>
                    {station.label}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="absolute inset-x-7 bottom-7 hidden space-y-3 lg:block">
          <PrimaryAction href={contact} tone="inverse" className="w-full" />
          {contactEmail && <p className="truncate text-center text-xs text-sidebar-muted">{contactEmail}</p>}
        </div>
      </aside>

      <div className="lg:ml-[300px]">
        <header className="flex items-center justify-end gap-x-4 px-4 pt-4 text-sm sm:gap-x-6 sm:px-10 sm:pt-5 lg:px-16">
          <Link to={ROUTES.pricing} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">Bảng giá</Link>
          <Link to={ROUTES.guide} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">Hướng dẫn</Link>
          <Link to={ROUTES.login} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">Đăng nhập</Link>
          <Link to={ROUTES.signup} className="whitespace-nowrap font-semibold text-primary underline-offset-4 hover:underline sm:rounded-control sm:border sm:border-line-input sm:bg-surface sm:px-3 sm:py-1.5 sm:text-fg sm:no-underline sm:hover:bg-surface-muted">
            Dùng thử<span className="hidden sm:inline"> 14 ngày</span>
          </Link>
        </header>

        <main className="px-4 sm:px-10 lg:px-16">
          <Station id="tai-ba-lien" index={1} as="h1" title="Một bộ chứng từ đi từ bàn kế toán viên tới hồ sơ lưu trữ, không dòng hàng nào bị bỏ sót" className="pt-8 lg:pt-10">
            <div className="grid gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,40rem)_1fr] xl:items-end">
              <p className="max-w-2xl text-pretty text-base leading-7 text-fg-muted">
                Kéo đơn đặt hàng, hóa đơn và phiếu nhập kho vào một bộ. DocuSync so ba liên theo từng dòng hàng, nói rõ chỗ lệch bằng
                chữ, rồi chuyển bộ qua hai cấp duyệt. Bộ đã duyệt cuối được khóa, không ai sửa hay xóa được.
              </p>
              <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                <PrimaryAction href={contact} />
                <Link to={ROUTES.signup} className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 font-semibold text-primary underline-offset-4 hover:underline">
                  Dùng thử miễn phí 14 ngày <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="mt-10">
              <StackedCopies settled={settled} />
              <p className="mt-5 flex flex-wrap items-baseline gap-x-2 text-sm text-tone-danger-fg">
                <strong>2 chỗ lệch:</strong>
                <span>đơn giá giấy A4 trên HĐ cao hơn PO 3.000 đ · GRN nhận thiếu 2 hộp mực.</span>
                <span className="text-xs text-fg-subtle">Dữ liệu minh họa</span>
              </p>
            </div>
          </Station>

          <Station id="doc-chung-tu" index={2} title="Hóa đơn XML đọc ngay trên máy chủ. Chỉ PDF và ảnh chụp mới cần AI.">
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <table className="w-full border-collapse text-sm">
                <thead className="border-b-2 border-primary">
                  <tr className="text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-2.5 text-left font-semibold">Loại file</th>
                    <th scope="col" className="hidden px-4 py-2.5 text-left font-semibold sm:table-cell">Đọc bằng</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-semibold">Khi số liệu không khớp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  <tr>
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-fg">
                      <span className="flex items-center gap-2"><FileCode2 size={17} className="shrink-0 text-primary" aria-hidden="true" />XML</span>
                      <span className="mt-1 block text-xs font-normal text-fg-subtle">Tổng cục Thuế, UBL, DonDatHang, PhieuNhapKho</span>
                      <span className="mt-1 block font-normal text-fg-muted sm:hidden">Đọc trên máy chủ, không gửi ra ngoài, không tính lượt AI.</span>
                    </th>
                    <td className="hidden px-4 py-3 text-fg-muted sm:table-cell">Bộ phân tích trên máy chủ. Không gửi ra ngoài, không tính lượt AI.</td>
                    <td className="px-4 py-3 text-fg-muted">Đọc đúng từng đồng như trên file; chỗ lệch là lệch thật giữa các chứng từ.</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-fg">
                      <span className="flex items-center gap-2"><FileImage size={17} className="shrink-0 text-primary" aria-hidden="true" />PDF, ảnh chụp</span>
                      <span className="mt-1 block text-xs font-normal text-fg-subtle">JPG, PNG, bản scan</span>
                      <span className="mt-1 block font-normal text-fg-muted sm:hidden">Đọc bằng dịch vụ AI; kế toán trưởng tắt được.</span>
                    </th>
                    <td className="hidden px-4 py-3 text-fg-muted sm:table-cell">Dịch vụ AI. Kế toán trưởng tắt được để công ty chỉ nhận XML.</td>
                    <td className="px-4 py-3 text-fg-muted">Tổng các dòng khác tổng chứng từ thì đọc lại; vẫn khác thì gắn cờ "chất lượng thấp" cho người duyệt kiểm tra.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Station>

          <Station id="so-tung-dong" index={3} title="Mỗi chỗ lệch kèm lý do và quy tắc đã sinh ra nó">
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
                <h3 className="font-semibold text-fg">Chi tiết hàng hóa · BATCH_04_11_2026_01</h3>
                <span className="text-xs text-fg-subtle">Dữ liệu minh họa</span>
              </div>
              <ul className="divide-y-2 divide-line sm:hidden">
                {ITEMS.map((item) => (
                  <li key={item.name} className={cn('px-4 py-3', item.tone === 'danger' && 'bg-tone-danger-bg/40')}>
                    <p className="font-medium text-fg">{item.name} <span className="text-xs font-normal text-fg-subtle">({item.unit})</span></p>
                    <dl className="mt-1 text-sm tabular-nums">
                      {COPIES.map(([key, code, title]) => {
                        const [qty, price] = item[key];
                        const odd = item.odd[key];
                        return (
                          <div key={key} className="flex items-center justify-between gap-3 py-1">
                            <dt><CopyChip code={code} title={title} /></dt>
                            <dd className="pr-2 text-right text-fg">
                              <span className={cn(odd === 'qty' && cn(ODD_MARK, 'relative left-2'))}>{qty}</span>
                              <span className={cn('pr-1 text-fg-subtle', odd === 'qty' ? 'pl-3' : 'pl-1')}>×</span>
                              <span className={cn(odd === 'price' && cn(ODD_MARK, 'relative left-2'))}>{number(price)}</span>
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                    <p className={cn('mt-1 text-sm font-semibold', item.tone === 'danger' ? 'text-tone-danger-fg' : 'text-tone-success-fg')}>{item.result}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block">
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead className="border-b-2 border-primary">
                    <tr className="text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-2.5 text-left font-semibold">Mặt hàng</th>
                      <th scope="col" className="px-2 py-2.5 text-left font-semibold"><span className="sr-only">Liên</span></th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Số lượng</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Đơn giá</th>
                      <th scope="col" className="px-4 py-2.5 text-left font-semibold">Kết quả</th>
                    </tr>
                  </thead>
                  {ITEMS.map((item) => (
                    <tbody key={item.name} className={cn('border-b-2 border-line last:border-b-0', item.tone === 'danger' && 'bg-tone-danger-bg/40')}>
                      {COPIES.map(([key, code, title], index) => {
                        const [qty, price] = item[key];
                        const odd = item.odd[key];
                        const oddClass = cn(ODD_MARK, 'relative left-2 inline-block');
                        return (
                          <tr key={key} className="border-t border-line first:border-t-0">
                            {index === 0 && (
                              <th scope="rowgroup" rowSpan={3} className="px-4 py-2 text-left align-top font-medium text-fg">
                                {item.name}
                                <span className="block text-xs font-normal text-fg-subtle">{item.unit}</span>
                              </th>
                            )}
                            <td className="px-2 py-2"><CopyChip code={code} title={title} /></td>
                            <td className="px-4 py-2 text-right">
                              <span className={cn(odd === 'qty' && oddClass)}>{qty}</span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className={cn(odd === 'price' && oddClass)}>{number(price)}</span>
                            </td>
                            {index === 0 && (
                              <td rowSpan={3} className={cn('px-4 py-2 align-top font-semibold', item.tone === 'danger' ? 'text-tone-danger-fg' : 'text-tone-success-fg')}>
                                {item.result}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
            <ul className="mt-6 grid gap-x-8 gap-y-2 text-sm leading-6 text-fg-muted md:grid-cols-2">
              <li><strong className="text-fg">Khớp tuyệt đối:</strong> mã số thuế, thuế suất VAT, đơn giá, số lượng.</li>
              <li><strong className="text-fg">Lệch tối đa 1.000 đ (mặc định):</strong> thành tiền, tiền thuế, tổng thanh toán (làm tròn), báo là lệch nhỏ.</li>
              <li><strong className="text-fg">Ghép dòng hàng:</strong> theo mã hàng, rồi tên trùng khớp, rồi tên gần nhất.</li>
              <li><strong className="text-fg">Không đoán liên nào đúng:</strong> chỉ chỉ ra liên nào khác hai liên còn lại.</li>
            </ul>
          </Station>

          <Station id="duyet-cap-1" index={4} title="Kế toán viên duyệt bộ khớp, bộ lệch lớn bị giữ lại">
            <p className="max-w-[68ch] leading-7 text-fg-muted">
              Chỉ bộ có đủ ba liên và kết quả Khớp hoặc Lệch nhỏ mới duyệt được. Bộ lệch lớn cần chứng từ đúng thay thế, nên sai sót không
              lọt qua chỉ vì một cú bấm. Kế toán trưởng nhận thông báo ngay khi có bộ chờ duyệt cuối.
            </p>
            <div className="mt-6 max-w-3xl divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-sm">
              {[
                ['BATCH_04_11_2026_01', 'Lệch lớn', 'Đơn giá HĐ cao hơn PO 3.000 đ', 'danger', 'Cần chứng từ đúng'],
                ['BATCH_04_11_2026_02', 'Lệch nhỏ', 'Tổng tiền lệch 400 đ, trong ngưỡng làm tròn', 'warning', 'Duyệt'],
                ['BATCH_04_11_2026_03', 'Khớp', 'Ba liên khớp ở mọi quy tắc', 'success', 'Duyệt'],
              ].map(([code, result, reason, tone, action]) => (
                <div key={code} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="font-semibold text-fg tabular-nums">{code}</span>
                  <span
                    className={cn(
                      'rounded-control border px-2 py-0.5 text-xs font-semibold',
                      tone === 'danger' && 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg',
                      tone === 'warning' && 'border-tone-warning-line bg-tone-warning-bg text-tone-warning-fg',
                      tone === 'success' && 'border-tone-success-line bg-tone-success-bg text-tone-success-fg',
                    )}
                  >
                    {result}
                  </span>
                  <span className="order-last w-full text-fg-muted sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">{reason}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      // Nút minh họa: ẩn trên màn hẹp để mỗi dòng giữ cùng bố cục (mã bộ, kết quả, rồi lý do).
                      'hidden whitespace-nowrap rounded-control px-3 py-1 text-xs font-semibold sm:inline-block',
                      tone === 'danger' ? 'border border-line-input text-fg-subtle' : 'bg-primary text-primary-fg',
                    )}
                  >
                    {action}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">Danh sách bộ chờ duyệt, dữ liệu minh họa.</p>
          </Station>

          <Station id="duyet-cuoi" index={5} title="Kế toán trưởng duyệt cuối, hoặc từ chối kèm lý do gửi qua email">
            <div className="grid max-w-3xl grid-cols-3 overflow-hidden rounded-card border border-line bg-surface text-sm">
              {[
                ['Người lập', 'Nguyễn Thị Lan', '04/11 09:12'],
                ['Duyệt cấp 1', 'Nguyễn Thị Lan', '04/11 09:20'],
                ['Duyệt cuối', 'Trần Văn Minh', '04/11 10:05'],
              ].map(([role, name, when]) => (
                <div key={role} className="border-l border-line px-4 py-3 first:border-l-0">
                  <p className="text-xs font-semibold text-fg-muted">{role}</p>
                  <p className="mt-1 font-semibold text-primary">{name}</p>
                  <p className="text-xs text-fg-subtle tabular-nums">{when}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">Dải chữ ký của một bộ, dữ liệu minh họa.</p>
          </Station>

          <Station id="khoa-ho-so" index={6} title="Bộ đã duyệt cuối thành hồ sơ: không sửa, không xóa, kể cả từ cơ sở dữ liệu">
            <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
              <div className="mx-auto flex h-36 w-36 rotate-[-12deg] flex-col items-center justify-center rounded-full border-[3px] border-sidebar-accent bg-sidebar text-center text-sidebar-accent" aria-hidden="true">
                <span className="text-xs font-extrabold">ĐÃ ĐỐI SOÁT</span>
                <Lock size={22} className="my-1" />
                <span className="text-[0.625rem] font-semibold">PO · HĐ · GRN</span>
              </div>
              <ul className="grid gap-3 text-sm leading-6 text-fg-muted sm:grid-cols-2">
                <li className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />Mỗi công ty tách riêng ở tầng cơ sở dữ liệu, không thấy dữ liệu của nhau.</li>
                <li className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />Kế toán trưởng đăng nhập bằng mật khẩu và mã xác thực hai lớp.</li>
                <li className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />Số CCCD và địa chỉ nhân viên được mã hóa khi lưu.</li>
                <li className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />Tải toàn bộ dữ liệu về bất cứ lúc nào; nhật ký ghi lại mọi thao tác.</li>
              </ul>
            </div>
          </Station>

          <section aria-labelledby="gia-title" className="border-t border-line py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="gia-title" className="text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight tracking-[-0.015em]">Bắt đầu miễn phí, trả theo tháng khi cần nhiều hơn</h2>
              <Link to={ROUTES.pricing} className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
                So sánh đầy đủ các gói <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-6 grid overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-3">
              {(plans.length ? plans : []).map((plan) => (
                <div key={plan.code} className="border-t border-line p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
                  <p className="font-semibold text-fg">{plan.name}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{plan.monthly_price ? formatVND(plan.monthly_price) : '0 đ'}<span className="text-sm font-normal text-fg-muted">{plan.monthly_price ? ' / tháng' : ''}</span></p>
                  <p className="mt-2 text-sm text-fg-muted">
                    {plan.users === null ? 'Không giới hạn người dùng' : `${plan.users} người dùng`} · {number(plan.batches_per_month)} bộ / tháng
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="lien-he-title" className="mb-16 rounded-card bg-sidebar px-6 py-10 text-sidebar-fg sm:px-10">
            <h2 id="lien-he-title" className="max-w-2xl text-balance text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight">Gửi thử một bộ chứng từ của công ty, chúng tôi đối soát cùng bạn</h2>
            <p className="mt-3 max-w-2xl leading-7 text-sidebar-muted">Trao đổi qua email về quy trình hiện tại, loại chứng từ và số bộ mỗi tháng để chọn gói phù hợp.</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <PrimaryAction href={contact} tone="inverse" />
              <Link to={ROUTES.signup} className="font-semibold text-sidebar-fg underline underline-offset-4">Hoặc tự dùng thử 14 ngày</Link>
            </div>
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-6 text-sm text-fg-subtle sm:px-10 lg:px-16">
          <span>© {new Date().getFullYear()} DocuSync AI</span>
          <nav aria-label="Liên kết cuối trang" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link to={ROUTES.terms} className="hover:text-fg-muted hover:underline">Điều khoản sử dụng</Link>
            <Link to={ROUTES.privacyPolicy} className="hover:text-fg-muted hover:underline">Chính sách bảo vệ dữ liệu</Link>
            <Link to={ROUTES.guide} className="hover:text-fg-muted hover:underline">Hướng dẫn</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
