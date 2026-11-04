import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { resendSignupOtp, startSignup, verifySignup } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { getPasswordPolicyError } from '../passwordPolicy.js';
import { ROUTES } from '../routes.js';
import { Button, Field, Input } from '../ui/index.js';

const EMPTY = { company_name: '', tax_id: '', full_name: '', email: '', password: '', accept_terms: false };

function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
      {children}
    </div>
  );
}

/** Đếm ngược số giây (cho nút gửi lại mã). */
function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  return [left, setLeft];
}

function CompanyStep({ form, setForm, onSent }) {
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordError = passwordTouched ? getPasswordPolicyError(form.password) : '';
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setPasswordTouched(true);
    if (getPasswordPolicyError(form.password)) return;
    setError('');
    setLoading(true);
    try {
      const result = await startSignup({ ...form, tax_id: form.tax_id.trim() || null });
      onSent(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Tên công ty" required>
        <Input value={form.company_name} onChange={set('company_name')} autoComplete="organization" minLength={2} maxLength={255} />
      </Field>
      <Field label="Mã số thuế" hint="10 số, hoặc 10 số kèm mã chi nhánh (0312345678-001). Có thể bổ sung sau.">
        <Input value={form.tax_id} onChange={set('tax_id')} inputMode="numeric" pattern="\d{10}(-\d{3})?" maxLength={14} />
      </Field>
      <Field label="Họ tên của bạn" required>
        <Input value={form.full_name} onChange={set('full_name')} autoComplete="name" minLength={2} maxLength={100} />
      </Field>
      <Field label="Email công việc" hint="Mã xác thực sẽ gửi tới email này. Đây cũng là tên đăng nhập." required>
        <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
      </Field>
      <Field label="Mật khẩu" hint="Tối thiểu 10 ký tự, có cả chữ và số." error={passwordError} required>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={set('password')}
            onBlur={() => setPasswordTouched(true)}
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

      <label className="flex items-start gap-2.5 text-sm text-fg-muted">
        <input type="checkbox" checked={form.accept_terms} onChange={set('accept_terms')} required className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-primary))]" />
        <span>
          Tôi đồng ý với điều khoản sử dụng và chính sách bảo vệ dữ liệu. Chứng từ PDF/ảnh được gửi tới dịch vụ AI để đọc;
          chứng từ XML được đọc ngay trên hệ thống.
        </span>
      </label>

      <ErrorBox>{error}</ErrorBox>

      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Tiếp tục
      </Button>
    </form>
  );
}

function OtpStep({ signup, onBack, onDone }) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLeft, setResendLeft] = useCountdown(signup.resend_after_seconds);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      onDone(await verifySignup(signup.signup_id, otp));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setInfo('');
    try {
      const result = await resendSignupOtp(signup.signup_id);
      setResendLeft(result.resend_after_seconds);
      setInfo('Đã gửi mã mới.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-fg-muted">
        Đã gửi mã 6 số tới <strong className="text-fg">{signup.email}</strong>. Mã có hiệu lực{' '}
        {Math.max(1, Math.round(signup.expires_in_seconds / 60))} phút.
      </p>
      <Field label="Mã xác thực" required>
        <Input
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          className="text-center text-xl font-semibold tracking-[0.4em] tabular-nums"
          autoFocus
        />
      </Field>

      <ErrorBox>{error}</ErrorBox>
      {info && <p className="text-sm text-tone-success-fg">{info}</p>}

      <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={otp.length !== 6}>
        Xác thực và tạo công ty
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
          <ArrowLeft size={15} aria-hidden="true" /> Sửa thông tin
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendLeft > 0}
          className="font-semibold text-primary disabled:cursor-not-allowed disabled:font-normal disabled:text-fg-subtle"
        >
          {resendLeft > 0 ? `Gửi lại mã sau ${resendLeft} giây` : 'Gửi lại mã'}
        </button>
      </div>
    </form>
  );
}

export default function Signup({ onLogin }) {
  const [signup, setSignup] = useState(null);
  // Giữ thông tin đã nhập khi quay lại bước 1 để sửa.
  const [form, setForm] = useState(EMPTY);

  return (
    <AuthLayout>
      <div className="w-full max-w-md rounded-modal bg-surface p-5 shadow-pop sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Bước {signup ? 2 : 1} / 2</p>
          <h2 className="mt-1 text-2xl font-bold text-fg">{signup ? 'Xác thực email' : 'Đăng ký dùng thử'}</h2>
          {!signup && (
            <p className="mt-2 text-sm text-fg-subtle">
              Dùng thử gói Pro miễn phí 14 ngày, không cần thẻ. Hết hạn tự chuyển về gói Free, dữ liệu vẫn giữ nguyên.
            </p>
          )}
        </div>

        {signup ? (
          <OtpStep signup={signup} onBack={() => setSignup(null)} onDone={onLogin} />
        ) : (
          <CompanyStep form={form} setForm={setForm} onSent={setSignup} />
        )}

        <p className="mt-6 text-center text-sm text-fg-muted">
          Đã có tài khoản?{' '}
          <Link to={ROUTES.login} className="font-semibold text-primary underline-offset-2 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
