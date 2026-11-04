import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { loginWithEmail } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { ROUTES } from '../routes.js';

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
    <AuthLayout>
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-modal bg-surface p-5 shadow-pop sm:p-8">
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-fg">Đăng nhập</h2>
            <p className="mt-2 text-sm text-fg-subtle">Dùng email và mật khẩu công ty đã cấp cho bạn.</p>
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

          <p className="mt-5 text-center text-sm text-fg-muted">
            Công ty chưa có tài khoản?{' '}
            <Link to={ROUTES.signup} className="font-semibold text-primary underline-offset-2 hover:underline">
              Đăng ký dùng thử 14 ngày
            </Link>
          </p>
        </form>
    </AuthLayout>
  );
}
