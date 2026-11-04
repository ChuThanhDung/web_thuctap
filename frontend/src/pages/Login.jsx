import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { loginWithEmail, loginWithMfa } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { ROUTES } from '../routes.js';
import { Button, Field, Input } from '../ui/index.js';

/** Bước hai khi tài khoản đã bật 2FA: mã 6 số từ ứng dụng, hoặc một mã khôi phục. */
function MfaStep({ mfaToken, onLogin, onBack }) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function verify(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      onLogin(await loginWithMfa(mfaToken, code));
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={verify} className="w-full max-w-md space-y-4 rounded-modal bg-surface p-5 shadow-pop sm:p-8">
      <div>
        <h2 className="text-2xl font-bold text-fg">Xác thực hai lớp</h2>
        <p className="mt-2 text-sm text-fg-subtle">
          {useRecovery
            ? 'Nhập một mã khôi phục (dạng ABCD-EFGH). Mỗi mã chỉ dùng được một lần.'
            : 'Nhập mã 6 số đang hiện trong ứng dụng xác thực trên điện thoại.'}
        </p>
      </div>
      <Field label={useRecovery ? 'Mã khôi phục' : 'Mã 6 số'} required>
        <Input
          value={code}
          onChange={(event) =>
            setCode(useRecovery ? event.target.value.toUpperCase().slice(0, 9) : event.target.value.replace(/\D/g, '').slice(0, 6))
          }
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoFocus
          className="text-center text-lg font-semibold tracking-[0.3em] tabular-nums"
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={submitting} disabled={code.length < (useRecovery ? 8 : 6)}>
        Xác nhận
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
          <ArrowLeft size={15} aria-hidden="true" /> Đăng nhập lại
        </button>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((value) => !value);
            setCode('');
            setError('');
          }}
          className="font-semibold text-primary"
        >
          {useRecovery ? 'Dùng mã 6 số' : 'Mất điện thoại? Dùng mã khôi phục'}
        </button>
      </div>
    </form>
  );
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const auth = await loginWithEmail(email, password);
      if (auth.mfa_required) {
        setMfaToken(auth.mfa_token);
        setPassword('');
      } else {
        onLogin(auth);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (mfaToken) {
    return (
      <AuthLayout>
        <MfaStep mfaToken={mfaToken} onLogin={onLogin} onBack={() => setMfaToken('')} />
      </AuthLayout>
    );
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
          <p className="mt-3 text-center text-xs text-fg-subtle">
            <Link to={ROUTES.terms} className="hover:text-fg-muted hover:underline">Điều khoản sử dụng</Link>
            {' · '}
            <Link to={ROUTES.privacyPolicy} className="hover:text-fg-muted hover:underline">Chính sách bảo vệ dữ liệu</Link>
          </p>
        </form>
    </AuthLayout>
  );
}
