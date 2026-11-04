import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { acceptInvitation, lookupInvitation } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { vi } from '../i18n/vi.js';
import { getPasswordPolicyError } from '../passwordPolicy.js';
import { ROUTES } from '../routes.js';
import { Button, Field, Input } from '../ui/index.js';

/** Trang mở từ link trong email mời: xem mình được mời vào công ty nào, đặt mật khẩu và vào thẳng hệ thống. */
export default function AcceptInvite({ onLogin }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [invitation, setInvitation] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setLookupError('Link mời không đầy đủ. Hãy mở lại link trong email.');
      return;
    }
    lookupInvitation(token)
      .then((result) => {
        setInvitation(result);
        setFullName(result.full_name);
      })
      .catch((err) => setLookupError(err.message));
  }, [token]);

  const passwordError = touched ? getPasswordPolicyError(password) : '';
  const confirmError = touched && confirm && confirm !== password ? 'Hai lần nhập mật khẩu không khớp.' : '';

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    if (getPasswordPolicyError(password) || password !== confirm) return;
    setError('');
    setLoading(true);
    try {
      onLogin(await acceptInvitation(token, password, fullName.trim()));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md rounded-modal bg-surface p-5 shadow-pop sm:p-8">
        <h2 className="text-2xl font-bold text-fg">Nhận lời mời</h2>

        {lookupError ? (
          <div className="mt-5 space-y-4">
            <p role="alert" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
              {lookupError}
            </p>
            <Link to={ROUTES.login} className="btn-primary w-full">
              Về trang đăng nhập
            </Link>
          </div>
        ) : !invitation ? (
          <p className="mt-4 text-sm text-fg-muted">{vi.common.loading}</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            <p className="text-sm text-fg-subtle">
              Bạn được mời vào <strong className="text-fg">{invitation.organization_name}</strong> với vai trò{' '}
              <strong className="text-fg">{vi.roles[invitation.role_code]}</strong>. Đặt mật khẩu để bắt đầu.
            </p>
            <Field label="Email đăng nhập">
              <Input value={invitation.email} disabled />
            </Field>
            <Field label="Họ tên" required>
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" minLength={2} maxLength={100} />
            </Field>
            <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự, có cả chữ và số." error={passwordError} required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="new-password"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-control text-fg-subtle hover:text-fg-muted"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <Field label="Nhập lại mật khẩu" error={confirmError} required>
              <Input type={showPassword ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
            </Field>

            {error && (
              <p role="alert" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Tham gia {invitation.organization_name}
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
