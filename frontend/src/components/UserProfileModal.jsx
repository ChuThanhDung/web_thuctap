import React, { useMemo, useState } from 'react';
import {
  Badge,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Edit3,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import {
  changePassword,
  requestPasswordOtp,
  updateProfile,
  verifyPasswordOtp,
} from '../api.js';
import { repairVietnameseText } from '../text.js';

function getInitials(fullName) {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
}

function ProfileAvatar({ user, fullName }) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={fullName}
        className="h-14 w-14 shrink-0 rounded-full border-2 border-white object-cover shadow-[0_8px_20px_rgba(83,58,253,0.20)] ring-1 ring-brand-100"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-100 via-white to-brand-200 text-base font-semibold text-brand-700 shadow-[0_8px_20px_rgba(83,58,253,0.18)] ring-1 ring-brand-100">
      {getInitials(fullName)}
    </div>
  );
}

function Field({ icon: Icon, label, value, numeric = false }) {
  return (
    <div className="group rounded-lg border border-[#e3e8ee] bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(0,55,112,0.05)] transition-colors hover:border-brand-200 hover:bg-[#f8faff]">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-[#64748d]">
        {Icon ? <Icon size={13} className="text-brand-500" /> : null}
        <span>{label}</span>
      </div>
      <p
        className={`mt-1.5 break-words text-sm font-medium leading-5 text-[#0d253d] ${
          numeric ? '[font-feature-settings:"tnum"]' : ''
        }`}
      >
        {value || 'Chưa cập nhật'}
      </p>
    </div>
  );
}

export default function UserProfileModal({ token, user, onClose, onUserUpdate }) {
  const fullName = repairVietnameseText(user.full_name) || '';
  const roleName = useMemo(() => repairVietnameseText(user.role_name), [user.role_name]);
  const department = repairVietnameseText(user.department);
  const [mode, setMode] = useState('view');
  const [profile, setProfile] = useState({
    full_name: fullName,
    date_of_birth: user.date_of_birth || '',
    address: repairVietnameseText(user.address) || '',
    phone: user.phone || '',
  });
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function setProfileField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function resetFeedback() {
    setError('');
    setMessage('');
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const updatedUser = await updateProfile(token, {
        full_name: profile.full_name,
        date_of_birth: profile.date_of_birth || null,
        address: profile.address,
        phone: profile.phone,
      });
      onUserUpdate(updatedUser);
      setMode('view');
      setMessage('Đã lưu thông tin cá nhân.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp() {
    resetFeedback();
    setLoading(true);

    try {
      const response = await requestPasswordOtp(token);
      setDevOtp(response.dev_otp || '');
      setMode('otp');
      setMessage(response.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const response = await verifyPasswordOtp(token, otp);
      setResetToken(response.reset_token);
      setMode('password');
      setMessage('OTP hợp lệ. Vui lòng nhập mật khẩu mới.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const response = await changePassword(token, resetToken, newPassword, confirmPassword);
      setMode('view');
      setOtp('');
      setDevOtp('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(response.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        style={{ maxHeight: 'calc(100vh - 32px)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[#e3e8ee] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.2px] text-[#0d253d]">Thông tin cá nhân</h2>
            <p className="mt-1 text-sm text-[#64748d]">Quản lý hồ sơ và bảo mật tài khoản.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7dee8] bg-white text-2xl font-light leading-none text-[#64748d] shadow-sm transition-colors hover:bg-slate-100 hover:text-[#0d253d]"
            aria-label="Đóng"
            title="Đóng"
          >
            ×
          </button>
        </div>

        <div
          className="min-h-0 overflow-y-auto overscroll-contain bg-[#f6f9fc] px-5 py-4"
          style={{ maxHeight: 'calc(100vh - 112px)' }}
        >
          {message && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {mode === 'view' && (
            <>
              <div className="relative mb-4 overflow-hidden rounded-xl border border-[#e3e8ee] bg-white p-4 shadow-[0_6px_18px_rgba(0,55,112,0.07)]">
                <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_12%_20%,rgba(245,233,212,0.95),transparent_30%),radial-gradient(circle_at_50%_0%,rgba(185,185,249,0.72),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(249,107,238,0.22),transparent_32%)]" />
                <div className="relative flex items-center gap-3">
                  <ProfileAvatar user={user} fullName={fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold tracking-[-0.2px] text-[#0d253d]">{fullName}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
                        {roleName || 'Chưa cập nhật'}
                      </span>
                      <span className="rounded-full border border-[#e3e8ee] bg-white/80 px-3 py-1 text-xs font-medium text-[#64748d]">
                        {department || 'Chưa cập nhật phòng ban'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <Field icon={Mail} label="Email" value={user.email} />
                <Field icon={Building2} label="Phòng ban" value={department} />
                <Field icon={Badge} label="Mã nhân viên" value={user.employee_code} numeric />
                <Field icon={CalendarDays} label="Ngày sinh" value={formatDate(user.date_of_birth)} numeric />
                <Field icon={MapPin} label="Nơi ở" value={repairVietnameseText(user.address)} />
                <Field icon={Phone} label="Số điện thoại" value={user.phone} numeric />
                <Field icon={CreditCard} label="Căn cước công dân" value={user.citizen_id} numeric />
                <Field icon={ImageIcon} label="Ảnh đại diện" value={user.avatar_url ? 'Đã cập nhật' : ''} />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-primary flex-1" onClick={() => setMode('edit')}>
                  <Edit3 size={16} />
                  Sửa thông tin cá nhân
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={handleRequestOtp} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
                  Đổi mật khẩu
                </button>
              </div>
            </>
          )}

          {mode === 'edit' && (
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5">
                <Field icon={Mail} label="Email" value={user.email} />
                <Field icon={Building2} label="Phòng ban" value={department} />
                <Field icon={Badge} label="Mã nhân viên" value={user.employee_code} numeric />
                <Field icon={CreditCard} label="Căn cước công dân" value={user.citizen_id} numeric />
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Tên</span>
                <input
                  className="input-field"
                  value={profile.full_name}
                  onChange={(event) => setProfileField('full_name', event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Địa chỉ</span>
                <input
                  className="input-field"
                  value={profile.address}
                  onChange={(event) => setProfileField('address', event.target.value)}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Số điện thoại</span>
                  <input
                    className="input-field"
                    value={profile.phone}
                    onChange={(event) => setProfileField('phone', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Ngày sinh</span>
                  <input
                    className="input-field"
                    type="date"
                    value={profile.date_of_birth}
                    onChange={(event) => setProfileField('date_of_birth', event.target.value)}
                  />
                </label>
              </div>

              <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-[#e3e8ee] bg-[#f6f9fc]/95 px-5 pt-3 backdrop-blur">
                <button type="button" className="btn-secondary" onClick={() => setMode('view')}>
                  Hủy
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                  Lưu lại
                </button>
              </div>
            </form>
          )}

          {mode === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-3 text-sm text-brand-700">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 shrink-0" size={16} />
                  <p>Nhập mã OTP 6 số vừa gửi tới email {user.email}.</p>
                </div>
                {devOtp && <p className="mt-2 font-semibold">Mã OTP dev: {devOtp}</p>}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Mã OTP</span>
                <input
                  className="input-field text-center text-lg font-semibold tracking-[0.35em]"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  required
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setMode('view')}>
                  Hủy
                </button>
                <button type="submit" className="btn-primary" disabled={loading || otp.length !== 6}>
                  {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                  Xác thực
                </button>
              </div>
            </form>
          )}

          {mode === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu mới</span>
                <input
                  className="input-field"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Nhập lại mật khẩu mới</span>
                <input
                  className="input-field"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setMode('view')}>
                  Hủy
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                  Lưu mật khẩu
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
