import React, { useState } from 'react';
import { Bot, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { loginWithEmail } from '../api.js';

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

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-white">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_18%_18%,#f5e9d4_0,#f5e9d4_18%,transparent_34%),radial-gradient(circle_at_45%_8%,#f96bee_0,transparent_24%),radial-gradient(circle_at_70%_18%,#665efd_0,transparent_30%),radial-gradient(circle_at_88%_4%,#ea2261_0,transparent_22%)] opacity-30 blur-2xl" />
      <section className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-7 px-4 py-6 sm:gap-10 sm:px-6 sm:py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Bot size={22} />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-950">Docusyncai - AI Đối soát</p>
              <p className="text-sm text-slate-500">Hóa đơn & Chứng từ</p>
            </div>
          </div>

          <h1 className="max-w-lg text-[clamp(2rem,8vw,3rem)] font-light leading-tight tracking-[-0.8px] text-slate-950">
            Đăng nhập để xử lý đối soát theo đúng vai trò
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Kế toán viên và kế toán trưởng được tách luồng làm việc riêng, giúp thao tác nhanh hơn và kiểm soát phân quyền rõ ràng hơn.
          </p>

          <div className="mt-6 grid max-w-lg grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Kế toán viên</p>
              <p className="mt-2 text-sm text-slate-700">Đối soát, tải chứng từ, xem nhật ký cá nhân.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Kế toán trưởng</p>
              <p className="mt-2 text-sm text-slate-700">Tổng quan, phê duyệt, cấu hình ngưỡng.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(0,55,112,0.10)] sm:p-7">
          <div className="mb-7">
            <h2 className="text-2xl font-light tracking-[-0.2px] text-slate-950">Đăng nhập</h2>
            <p className="mt-2 text-sm text-slate-500">Sử dụng email nội bộ và mật khẩu được cấp.</p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
            <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowPassword((value) => !value)}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {error && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button className="btn-primary mt-7 w-full rounded-full" type="submit" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  );
}
