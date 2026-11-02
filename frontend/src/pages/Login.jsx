import React, { useState } from 'react';
import { Files, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { loginWithEmail } from '../api.js';

// Các dòng trên một liên chứng từ: [độ dài tên hàng, độ dài số tiền]. Dòng 2 là dòng đang được đối chiếu.
const SHEET_ROWS = [[70, 34], [92, 40], [58, 28], [84, 44], [66, 30]];

function Sheet({ label, tabX, front = false }) {
  return (
    <>
      <rect width="230" height="270" rx="3" className={front ? 'fill-surface stroke-line-input' : 'fill-surface-muted stroke-line'} strokeWidth="1" />
      <rect x={tabX} y="-15" width="54" height="19" rx="3" className={front ? 'fill-primary' : 'fill-surface stroke-line'} strokeWidth="1" />
      <text x={tabX + 27} y="-1.5" textAnchor="middle" fontSize="11" fontWeight="700" className={front ? 'fill-primary-fg' : 'fill-primary'}>
        {label}
      </text>
      <rect x="20" y="24" width="96" height="8" rx="2" className="fill-fg" opacity={front ? 0.85 : 0.35} />
      <rect x="20" y="40" width="60" height="5" rx="2" className="fill-fg-subtle" opacity="0.6" />
      <line x1="20" x2="210" y1="62" y2="62" className="stroke-primary" strokeWidth="2" />
      {SHEET_ROWS.map(([name, amount], index) => {
        const y = 80 + index * 24;
        return (
          <g key={index}>
            {index === 2 ? <rect x="12" y={y - 9} width="206" height="22" rx="2" className={front ? 'fill-accent-soft' : 'fill-surface'} /> : null}
            <rect x="20" y={y} width={name} height="5" rx="2" className="fill-fg-subtle" opacity={index === 2 ? 0.9 : 0.5} />
            <rect x={210 - amount} y={y} width={amount} height="5" rx="2" className="fill-fg-subtle" opacity={index === 2 ? 0.9 : 0.5} />
          </g>
        );
      })}
      <line x1="20" x2="210" y1="210" y2="210" className="stroke-line" strokeWidth="1" />
      <rect x="146" y="220" width="64" height="7" rx="2" className="fill-fg" opacity={front ? 0.8 : 0.35} />
      {front ? (
        <path d="M24 250c8-14 14-14 16-2s8 8 14-6 10-8 12 2 8 4 18-6" fill="none" className="stroke-primary" strokeWidth="1.6" strokeLinecap="round" />
      ) : null}
    </>
  );
}

// Minh họa ba liên PO · HĐ · GRN đặt chồng lên nhau, đóng dấu "Đã đối soát": vẽ bằng SVG theo token để đổi màu cùng giao diện.
function CopiesIllustration() {
  return (
    <svg viewBox="74 0 318 322" className="mt-10 hidden h-[min(42vh,24rem)] w-auto lg:block" role="img" aria-label="Ba liên PO, Hóa đơn và Phiếu nhập kho đặt chồng lên nhau, đóng dấu đã đối soát">
      <g transform="translate(150 20) rotate(4)">
        <Sheet label="GRN" tabX={160} />
      </g>
      <g transform="translate(120 34) rotate(1.5)">
        <Sheet label="HĐ" tabX={90} />
      </g>
      <g transform="translate(86 50) rotate(-2.5)">
        <Sheet label="PO" tabX={20} front />
      </g>
      <g transform="translate(326 258) rotate(-14)" className="stroke-sidebar-accent" fill="none">
        <circle r="52" strokeWidth="2.5" className="fill-sidebar" />
        <circle r="44" strokeWidth="1" />
        <text y="-8" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="0.06em" className="fill-sidebar-accent" stroke="none">
          ĐÃ ĐỐI SOÁT
        </text>
        <path d="M-12 6l8 8 17-18" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <text y="30" textAnchor="middle" fontSize="8" fontWeight="600" letterSpacing="0.08em" className="fill-sidebar-accent" stroke="none">
          PO · HĐ · GRN
        </text>
      </g>
    </svg>
  );
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const auth = await loginWithEmail(email, password);
      onLogin(auth);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Một nền liền: navy ở góc trên trái, chuyển qua xanh mẫu biểu, nhạt dần về xanh giấy ở góc dưới phải. Vừa một màn hình, không cuộn.
  return (
    <main className="relative flex min-h-dvh items-center overflow-hidden bg-[linear-gradient(135deg,rgb(var(--c-sidebar))_0%,rgb(var(--c-sidebar-end))_60%,rgb(var(--c-accent-soft))_100%)] text-sidebar-fg">
      {/* Lưới kẻ ô như giấy sổ cái, chỉ hiện ở rìa (mờ dần vào giữa) để phần ngoài không trống. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,transparent_25%,black_85%)]"
      />
      {/* Vòng dấu lớn in chìm ở hai góc, lặp lại hình con dấu "Đã đối soát". */}
      <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] text-sidebar-fg opacity-[0.07]">
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="100" cy="100" r="82" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M68 102l22 22 44-48" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-32 -left-32 h-[26rem] w-[26rem] text-sidebar-fg opacity-[0.06]">
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="100" cy="100" r="82" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
      </svg>

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-5 py-8 sm:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:px-16">
        <section>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-control bg-sidebar-accent text-sidebar">
              <Files size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold">DocuSync AI</p>
              <p className="text-sm text-sidebar-muted">Phần mềm đối soát chứng từ</p>
            </div>
          </div>

          <h1 className="mt-8 max-w-xl text-[clamp(1.75rem,5vw,2.5rem)] font-bold leading-tight tracking-[-0.02em] text-balance lg:mt-12">
            Tự động đối chiếu đơn hàng, hóa đơn và phiếu nhập kho
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-sidebar-muted">
            Hệ thống so từng dòng hàng giữa ba chứng từ, chỉ rõ chỗ lệch và lý do. Kế toán viên duyệt trước, kế toán trưởng duyệt sau.
          </p>

          <CopiesIllustration />
        </section>

        <div className="flex justify-center lg:justify-end">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-modal bg-surface p-5 shadow-pop sm:p-8">
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-fg">Đăng nhập</h2>
            <p className="mt-2 text-sm text-fg-subtle">Sử dụng email nội bộ và mật khẩu được cấp.</p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-fg-muted">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" size={18} />
              <input
                className="input-field pl-10"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Nhập vào email"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-fg-muted">Mật khẩu</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" size={18} />
              <input
                className="input-field px-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg-muted"
                onClick={() => setShowPassword((value) => !value)}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {error && (
            <div className="mt-5 rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
              {error}
            </div>
          )}

          <button className="btn-primary mt-7 w-full" type="submit" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
        </div>
      </div>
    </main>
  );
}
