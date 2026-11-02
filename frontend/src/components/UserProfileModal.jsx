import Modal from '../ui/Modal.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { getPasswordPolicyError } from '../passwordPolicy.js';

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
        className={`${className} shrink-0 rounded-full border-2 border-line object-cover shadow-card ring-1 ring-focus`}
      />
    );
  }

  return (
    <div className={`flex ${className} shrink-0 items-center justify-center rounded-full border-2 border-line bg-tone-brand-bg text-base font-semibold text-tone-brand-fg shadow-card ring-1 ring-focus`}>
      {getInitials(fullName)}
    </div>
  );
}

function Field({ icon: Icon, label, value, numeric = false }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-baseline gap-3 py-2.5">
      <dt className="flex items-center gap-2 text-sm text-fg-muted">
        {Icon ? <Icon size={14} aria-hidden="true" className="shrink-0 text-primary" /> : null}
        {label}
      </dt>
      <dd className={`min-w-0 break-words text-sm font-medium text-fg ${numeric ? 'tabular-nums' : ''}`}>
        {value || <span className="font-normal text-fg-subtle">Chưa cập nhật</span>}
      </dd>
    </div>
  );
}

function PasswordField({ label, value, onChange, visible, onToggle, error, helper }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg-muted">{label}</span>
      <div className="relative">
        <input
          className={`input-field pr-12 ${error ? 'border-tone-danger-line focus:border-tone-danger-line focus:ring-tone-danger-line' : ''}`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={label === 'Mật khẩu hiện tại' ? 'current-password' : 'new-password'}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-fg-subtle hover:text-primary"
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <p className={`mt-1 text-xs ${error ? 'text-tone-danger-fg' : 'text-fg-subtle'}`}>{error || helper}</p>
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
    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) nextErrors.new = policyError;
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

  return (
    <Modal open onClose={onClose} title="Thông tin cá nhân" description="Quản lý hồ sơ và bảo mật tài khoản." size="md">
      <div className="-mx-6 -my-5 bg-canvas px-6 py-5">
          {message && (
            <div className="mb-4 flex items-start gap-2 rounded-control border border-tone-success-line bg-tone-success-bg px-3 py-2.5 text-sm text-tone-success-fg">
              <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2.5 text-sm text-tone-danger-fg">
              {error}
            </div>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <>
              {mode === 'view' && (
                <>
                  <div className="mb-4 flex items-center gap-3">
                    
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ProfileAvatar user={user} fullName={fullName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-fg">{fullName}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-control bg-tone-brand-bg px-3 py-1 text-sm font-medium text-tone-brand-fg">
                            {roleName || 'Chưa cập nhật'}
                          </span>
                          <span className="rounded-control border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-subtle">
                            {department || 'Chưa cập nhật phòng ban'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <dl className="divide-y divide-line border-y border-line">
                    <Field icon={Mail} label="Email" value={user.email} />
                    <Field icon={Building2} label="Phòng ban" value={department} />
                    <Field icon={Badge} label="Mã nhân viên" value={user.employee_code} numeric />
                    <Field icon={CalendarDays} label="Ngày sinh" value={formatDate(user.date_of_birth)} numeric />
                    <Field icon={MapPin} label="Nơi ở" value={repairVietnameseText(user.address)} />
                    <Field icon={Phone} label="Số điện thoại" value={user.phone} numeric />
                    <Field icon={CreditCard} label="Căn cước công dân" value={user.citizen_id} numeric />
                    <Field icon={ImageIcon} label="Ảnh đại diện" value={user.avatar_url ? 'Đã cập nhật' : ''} />
                  </dl>

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
                    <span className="mb-1.5 block text-sm font-medium text-fg-muted">Tên</span>
                    <input
                      className="input-field"
                      value={profile.full_name}
                      onChange={(event) => setProfileField('full_name', event.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-fg-muted">Địa chỉ</span>
                    <input
                      className="input-field"
                      value={profile.address}
                      onChange={(event) => setProfileField('address', event.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-fg-muted">Số điện thoại</span>
                      <input
                        className="input-field"
                        value={profile.phone}
                        onChange={(event) => setProfileField('phone', event.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-fg-muted">Ngày sinh</span>
                      <input
                        className="input-field"
                        type="date"
                        value={profile.date_of_birth}
                        onChange={(event) => setProfileField('date_of_birth', event.target.value)}
                      />
                    </label>
                  </div>

                <div className="sticky bottom-0 -mx-6 flex flex-col-reverse justify-end gap-2 border-t border-line bg-canvas px-6 py-3 sm:flex-row">
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
                  <div className="rounded-control border border-tone-brand-line bg-tone-brand-bg px-3 py-3 text-sm text-tone-brand-fg">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 shrink-0" size={16} />
                      <p>Mã OTP 6 số đã được gửi trực tiếp đến địa chỉ email: <strong>{user.email}</strong>. Vui lòng kiểm tra hộp thư.</p>
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-fg-muted">Mã OTP</span>
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
                    <span className="text-fg-subtle">Mã hết hạn sau 5 phút.</span>
                    <button
                      type="button"
                      className="font-medium text-primary disabled:cursor-not-allowed disabled:text-fg-subtle"
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
                  <div className="rounded-control border border-tone-brand-line bg-tone-brand-bg px-3 py-3 text-sm text-tone-brand-fg">
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
    </Modal>
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
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-36 w-36 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-4 ring-focus sm:mx-0">
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
            <p className="text-sm font-semibold text-fg">Ảnh đại diện</p>
            <p className="mt-1 text-xs leading-5 text-fg-subtle">JPG, PNG hoặc WebP · tối đa 5 MB · lưu thành WebP 512×512.</p>
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
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-xs font-medium text-fg-subtle">
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
