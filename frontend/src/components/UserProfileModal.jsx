import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Badge,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import {
  getAvatarViewUrl,
  requestPasswordOtp,
  updateProfile,
  uploadAvatar,
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

function ProfileAvatar({ user, fullName, className = 'h-14 w-14' }) {
  const [imageError, setImageError] = useState(false);
  const avatarUrl = getAvatarViewUrl(user);

  useEffect(() => setImageError(false), [avatarUrl]);

  if (avatarUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        onError={() => setImageError(true)}
        className={`${className} shrink-0 rounded-full border-2 border-white object-cover shadow-[0_8px_20px_rgba(83,58,253,0.20)] ring-1 ring-brand-100 dark:border-slate-900 dark:ring-brand-800/60`}
      />
    );
  }

  return (
    <div className={`flex ${className} shrink-0 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-100 via-white to-brand-200 text-base font-semibold text-brand-700 shadow-[0_8px_20px_rgba(83,58,253,0.18)] ring-1 ring-brand-100 dark:border-slate-900 dark:from-brand-950 dark:via-slate-900 dark:to-brand-800/70 dark:text-brand-200 dark:ring-brand-800/60`}>
      {getInitials(fullName)}
    </div>
  );
}

function Field({ icon: Icon, label, value, numeric = false }) {
  return (
    <div className="group rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(0,55,112,0.05)] transition-colors hover:border-brand-200 hover:bg-[#f8faff] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800 dark:hover:bg-slate-800/70">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
        {Icon ? <Icon size={13} className="text-brand-500 dark:text-brand-300" /> : null}
        <span>{label}</span>
      </div>
      <p
        className={`mt-1.5 break-words text-sm font-medium leading-5 text-slate-950 dark:text-slate-100 ${
          numeric ? '[font-feature-settings:"tnum"]' : ''
        }`}
      >
        {value || 'Chưa cập nhật'}
      </p>
    </div>
  );
}

function PasswordField({ label, value, onChange, visible, onToggle, error, helper }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="relative">
        <input
          className={`input-field pr-12 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : ''}`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={label === 'Mật khẩu hiện tại' ? 'current-password' : 'new-password'}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300"
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <p className={`mt-1 text-xs ${error ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{error || helper}</p>
    </label>
  );
}

export default function UserProfileModal({ token, user, onClose, onUserUpdate }) {
  const fullName = repairVietnameseText(user.full_name) || '';
  const roleName = useMemo(() => repairVietnameseText(user.role_name), [user.role_name]);
  const department = repairVietnameseText(user.department);
  const activeTab = 'profile';
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'otp' | 'password'
  const [profile, setProfile] = useState({
    full_name: fullName,
    date_of_birth: user.date_of_birth || '',
    address: repairVietnameseText(user.address) || '',
    phone: user.phone || '',
  });
  const [otp, setOtp] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState({ current: false, new: false, confirm: false });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [resendCountdown, setResendCountdown] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendCountdown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCountdown]);

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

  async function handleRequestOtp(event) {
    event?.preventDefault();
    resetFeedback();
    const nextErrors = {};
    if (!currentPassword) nextErrors.current = 'Vui lòng nhập mật khẩu hiện tại.';
    if (newPassword.length < 6) nextErrors.new = 'Mật khẩu mới phải có tối thiểu 6 ký tự.';
    if (newPassword && newPassword === currentPassword) nextErrors.new = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    if (confirmPassword !== newPassword) nextErrors.confirm = 'Xác nhận mật khẩu mới không khớp.';
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);

    try {
      const response = await requestPasswordOtp(token, currentPassword, newPassword, confirmPassword);
      setMode('otp');
      setOtp('');
      setResendCountdown(response.resend_after_seconds || 60);
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
      setMode('view');
      setOtp('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
      setResendCountdown(0);
      setMessage(response.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-950 dark:ring-slate-700/70 sm:max-h-[calc(100dvh-2rem)]"
        style={{ maxHeight: 'calc(100vh - 32px)' }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-100">
                Thông tin cá nhân
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Quản lý hồ sơ và bảo mật tài khoản.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-2xl font-light leading-none text-slate-500 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Đóng"
              title="Đóng"
            >
              ×
            </button>
          </div>

        </div>

        {/* Modal Body */}
        <div
          className="min-h-0 overflow-y-auto overscroll-contain bg-[#f6f9fc] px-4 py-4 dark:bg-slate-950 sm:px-5"
          style={{ maxHeight: 'calc(100vh - 128px)' }}
        >
          {message && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <>
              {mode === 'view' && (
                <>
                  <div className="relative mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,55,112,0.07)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_18px_38px_rgba(0,0,0,0.28)]">
                    <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_12%_20%,rgba(245,233,212,0.95),transparent_30%),radial-gradient(circle_at_50%_0%,rgba(185,185,249,0.72),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(249,107,238,0.22),transparent_32%)] dark:bg-[radial-gradient(circle_at_18%_24%,rgba(79,70,229,0.36),transparent_32%),radial-gradient(circle_at_66%_0%,rgba(14,165,233,0.22),transparent_38%),radial-gradient(circle_at_88%_18%,rgba(244,63,94,0.18),transparent_34%)]" />
                    <div className="relative flex items-center gap-3">
                      <ProfileAvatar user={user} fullName={fullName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-slate-950 dark:text-slate-100">{fullName}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 dark:bg-brand-950/70 dark:text-brand-200">
                            {roleName || 'Chưa cập nhật'}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300">
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
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      onClick={() => {
                        resetFeedback();
                        setPasswordErrors({});
                        setMode('password');
                      }}
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
                      Đổi mật khẩu
                    </button>
                  </div>
                </>
              )}

              {mode === 'edit' && (
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <AvatarEditor
                    token={token}
                    user={user}
                    fullName={fullName}
                    onUpdated={onUserUpdate}
                    onError={setError}
                    onMessage={setMessage}
                  />

                  <div className="grid grid-cols-1 gap-2.5">
                    <Field icon={Mail} label="Email" value={user.email} />
                    <Field icon={Building2} label="Phòng ban" value={department} />
                    <Field icon={Badge} label="Mã nhân viên" value={user.employee_code} numeric />
                    <Field icon={CreditCard} label="Căn cước công dân" value={user.citizen_id} numeric />
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Tên</span>
                    <input
                      className="input-field"
                      value={profile.full_name}
                      onChange={(event) => setProfileField('full_name', event.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Địa chỉ</span>
                    <input
                      className="input-field"
                      value={profile.address}
                      onChange={(event) => setProfileField('address', event.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Số điện thoại</span>
                      <input
                        className="input-field"
                        value={profile.phone}
                        onChange={(event) => setProfileField('phone', event.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Ngày sinh</span>
                      <input
                        className="input-field"
                        type="date"
                        value={profile.date_of_birth}
                        onChange={(event) => setProfileField('date_of_birth', event.target.value)}
                      />
                    </label>
                  </div>

                <div className="sticky bottom-0 -mx-4 flex flex-col-reverse justify-end gap-2 border-t border-slate-200 bg-[#f6f9fc]/95 px-4 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:flex-row sm:px-5">
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
                  <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-3 text-sm text-brand-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-200">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 shrink-0" size={16} />
                      <p>Mã OTP 6 số đã được gửi trực tiếp đến địa chỉ email: <strong>{user.email}</strong>. Vui lòng kiểm tra hộp thư.</p>
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Mã OTP</span>
                    <input
                      className="input-field text-center text-lg font-semibold tracking-[0.35em]"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      placeholder="000000"
                      required
                    />
                  </label>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Mã hết hạn sau 5 phút.</span>
                    <button
                      type="button"
                      className="font-medium text-brand-600 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-brand-300 dark:disabled:text-slate-600"
                      onClick={() => handleRequestOtp()}
                      disabled={loading || resendCountdown > 0}
                    >
                      {resendCountdown > 0 ? `Gửi lại sau ${resendCountdown}s` : 'Gửi lại mã OTP'}
                    </button>
                  </div>
                <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
                    <button type="button" className="btn-secondary" onClick={() => setMode('view')}>
                      Hủy
                    </button>
                    <button type="submit" className="btn-primary" disabled={loading || otp.length !== 6}>
                      {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                      Xác thực OTP
                    </button>
                  </div>
                </form>
              )}

              {mode === 'password' && (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-3 text-sm text-brand-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-200">
                    OTP sẽ được gửi tới email đăng nhập: <strong>{user.email}</strong>
                  </div>
                  <PasswordField
                    label="Mật khẩu hiện tại"
                    value={currentPassword}
                    onChange={(value) => { setCurrentPassword(value); setPasswordErrors((items) => ({ ...items, current: '' })); }}
                    visible={passwordVisible.current}
                    onToggle={() => setPasswordVisible((items) => ({ ...items, current: !items.current }))}
                    error={passwordErrors.current}
                    helper="Nhập mật khẩu bạn đang sử dụng."
                  />
                  <PasswordField
                    label="Mật khẩu mới"
                    value={newPassword}
                    onChange={(value) => { setNewPassword(value); setPasswordErrors((items) => ({ ...items, new: '' })); }}
                    visible={passwordVisible.new}
                    onToggle={() => setPasswordVisible((items) => ({ ...items, new: !items.new }))}
                    error={passwordErrors.new}
                    helper="Tối thiểu 6 ký tự và phải khác mật khẩu hiện tại."
                  />
                  <PasswordField
                    label="Xác nhận mật khẩu mới"
                    value={confirmPassword}
                    onChange={(value) => { setConfirmPassword(value); setPasswordErrors((items) => ({ ...items, confirm: '' })); }}
                    visible={passwordVisible.confirm}
                    onToggle={() => setPasswordVisible((items) => ({ ...items, confirm: !items.confirm }))}
                    error={passwordErrors.confirm}
                    helper="Nhập lại chính xác mật khẩu mới."
                  />
                <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
                    <button type="button" className="btn-secondary" onClick={() => setMode('view')}>
                      Hủy
                    </button>
                    <button type="submit" className="btn-primary" disabled={loading}>
                      {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                      Gửi mã OTP
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function canvasToWebp(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Trình duyệt không thể xử lý ảnh này.'))),
      'image/webp',
      0.86,
    );
  });
}

function AvatarEditor({ token, user, fullName, onUpdated, onError, onMessage }) {
  const imageRef = useRef(null);
  const inputRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(file) {
    onError('');
    onMessage('');
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_AVATAR_EXTENSIONS.includes(extension) || !ALLOWED_AVATAR_TYPES.includes(file.type)) {
      onError('Chỉ chấp nhận ảnh JPG, JPEG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      onError('Ảnh đại diện không được vượt quá 5 MB.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSourceFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setZoom(1);
  }

  async function handleUpload() {
    if (!sourceFile || !imageRef.current) return;
    onError('');
    onMessage('');
    setUploading(true);

    try {
      const image = imageRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      const baseScale = Math.max(512 / image.naturalWidth, 512 / image.naturalHeight);
      const scale = baseScale * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height);

      const blob = await canvasToWebp(canvas);
      const croppedFile = new File([blob], 'avatar.webp', { type: 'image/webp' });
      const updatedUser = await uploadAvatar(token, croppedFile);
      onUpdated(updatedUser);
      onMessage('Đã cập nhật ảnh đại diện.');
      setSourceFile(null);
      setPreviewUrl('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      onError(err.message || 'Không thể cập nhật ảnh đại diện.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-36 w-36 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-brand-50 dark:bg-slate-800 dark:ring-brand-950/70 sm:mx-0">
          {previewUrl ? (
            <img
              ref={imageRef}
              src={previewUrl}
              alt="Xem trước vùng cắt ảnh đại diện"
              className="h-full w-full object-cover transition-transform"
              style={{ transform: `scale(${zoom})` }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ProfileAvatar user={user} fullName={fullName} className="h-full w-full" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">Ảnh đại diện</p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">JPG, PNG hoặc WebP · tối đa 5 MB · lưu thành WebP 512×512.</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Camera size={17} />
            {sourceFile ? 'Chọn ảnh khác' : 'Chọn ảnh'}
          </button>
        </div>
      </div>

      {sourceFile && (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              Phóng to để chọn vùng crop
              <span>{Math.round(zoom * 100)}%</span>
            </span>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-11 w-full accent-brand-600"
            />
          </label>
          <button type="button" className="btn-primary w-full" onClick={handleUpload} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" size={17} /> : <Camera size={17} />}
            {uploading ? 'Đang xử lý và tải lên...' : 'Crop và cập nhật ảnh'}
          </button>
        </div>
      )}
    </div>
  );
}
