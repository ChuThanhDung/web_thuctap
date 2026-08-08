import React, { useEffect, useMemo, useState } from 'react';
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
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  changePassword,
  createUserAccount,
  getUserAccounts,
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
  const isChiefAccountant = user.role === 'chief_accountant';
  const fullName = repairVietnameseText(user.full_name) || '';
  const roleName = useMemo(() => repairVietnameseText(user.role_name), [user.role_name]);
  const department = repairVietnameseText(user.department);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'users'
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'otp' | 'password'
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

  // User creation state (chief accountant)
  const [userList, setUserList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    role_code: 'accountant',
    department: 'Phòng Kế toán - Tài chính',
    employee_code: '',
    phone: '',
  });

  useEffect(() => {
    if (activeTab === 'users' && isChiefAccountant) {
      loadUserList();
    }
  }, [activeTab]);

  async function loadUserList() {
    setLoadingUsers(true);
    try {
      const res = await getUserAccounts(token);
      setUserList(res.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }

  function setProfileField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function setNewUserField(field, value) {
    setNewUser((current) => ({ ...current, [field]: value }));
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

  async function handleCreateUser(event) {
    event.preventDefault();
    resetFeedback();

    // Frontend email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      setError('Vui lòng nhập địa chỉ Email hợp lệ (ví dụ: user@company.com).');
      return;
    }

    setLoading(true);
    try {
      const created = await createUserAccount(token, {
        email: newUser.email,
        password: newUser.password,
        full_name: newUser.full_name,
        role_code: newUser.role_code,
        department: newUser.department || null,
        employee_code: newUser.employee_code || null,
        phone: newUser.phone || null,
      });

      setMessage(`Đã tạo thành công tài khoản: ${created.email} (${created.role_name}).`);
      setNewUser({
        email: '',
        password: '',
        full_name: '',
        role_code: 'accountant',
        department: 'Phòng Kế toán - Tài chính',
        employee_code: '',
        phone: '',
      });
      loadUserList();
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
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        style={{ maxHeight: 'calc(100vh - 32px)' }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[#e3e8ee] bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.2px] text-[#0d253d]">
                {activeTab === 'profile' ? 'Thông tin cá nhân' : 'Quản lý tài khoản người dùng'}
              </h2>
              <p className="mt-0.5 text-sm text-[#64748d]">
                {activeTab === 'profile'
                  ? 'Quản lý hồ sơ và bảo mật tài khoản.'
                  : 'Tạo tài khoản Kế toán trưởng / Kế toán viên mới.'}
              </p>
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

          {/* Navigation Tabs for Chief Accountant */}
          {isChiefAccountant && (
            <div className="mt-3 flex border-b border-[#e3e8ee] gap-4 text-sm font-medium">
              <button
                type="button"
                className={`pb-2.5 transition-colors ${
                  activeTab === 'profile'
                    ? 'border-b-2 border-brand-600 font-semibold text-brand-600'
                    : 'text-[#64748d] hover:text-[#0d253d]'
                }`}
                onClick={() => {
                  setActiveTab('profile');
                  resetFeedback();
                }}
              >
                Hồ sơ cá nhân
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 pb-2.5 transition-colors ${
                  activeTab === 'users'
                    ? 'border-b-2 border-brand-600 font-semibold text-brand-600'
                    : 'text-[#64748d] hover:text-[#0d253d]'
                }`}
                onClick={() => {
                  setActiveTab('users');
                  resetFeedback();
                }}
              >
                <Users size={15} />
                Tạo & Quản lý tài khoản
              </button>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div
          className="min-h-0 overflow-y-auto overscroll-contain bg-[#f6f9fc] px-5 py-4"
          style={{ maxHeight: 'calc(100vh - 128px)' }}
        >
          {message && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <>
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
                      <p>Mã OTP 6 số đã được gửi trực tiếp đến địa chỉ email: <strong>{user.email}</strong>. Vui lòng kiểm tra hộp thư.</p>
                    </div>
                    {devOtp && <p className="mt-2 font-semibold text-xs text-brand-600">Mã OTP dev: {devOtp}</p>}
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Mã OTP</span>
                    <input
                      className="input-field text-center text-lg font-semibold tracking-[0.35em]"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      placeholder="000000"
                      required
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
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
                      Lưu mật khẩu mới
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* TAB 2: USER MANAGEMENT (CHIEF ACCOUNTANT ONLY) */}
          {activeTab === 'users' && isChiefAccountant && (
            <div className="space-y-6">
              {/* Form Tao Tai Khoan */}
              <div className="rounded-xl border border-[#e3e8ee] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 border-b border-[#f0f4ff] pb-3 text-sm font-semibold text-[#0d253d]">
                  <UserPlus className="text-brand-600" size={18} />
                  <span>Tạo tài khoản mới</span>
                </div>

                <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Email (bắt buộc)
                      </span>
                      <input
                        type="email"
                        className="input-field"
                        placeholder="vi-du@vinuni.edu.vn"
                        value={newUser.email}
                        onChange={(e) => setNewUserField('email', e.target.value)}
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Mật khẩu (tối thiểu 6 ký tự)
                      </span>
                      <input
                        type="password"
                        className="input-field"
                        placeholder="••••••••"
                        value={newUser.password}
                        onChange={(e) => setNewUserField('password', e.target.value)}
                        minLength={6}
                        required
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Họ và Tên
                      </span>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Nguyễn Văn A"
                        value={newUser.full_name}
                        onChange={(e) => setNewUserField('full_name', e.target.value)}
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Vai trò hệ thống
                      </span>
                      <select
                        className="input-field font-medium text-slate-800"
                        value={newUser.role_code}
                        onChange={(e) => setNewUserField('role_code', e.target.value)}
                      >
                        <option value="accountant">Kế toán viên</option>
                        <option value="chief_accountant">Kế toán trưởng</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Mã nhân viên
                      </span>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="ACC-003"
                        value={newUser.employee_code}
                        onChange={(e) => setNewUserField('employee_code', e.target.value)}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Phòng ban
                      </span>
                      <input
                        type="text"
                        className="input-field"
                        value={newUser.department}
                        onChange={(e) => setNewUserField('department', e.target.value)}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#64748d]">
                        Số điện thoại
                      </span>
                      <input
                        type="tel"
                        className="input-field"
                        placeholder="0912345678"
                        value={newUser.phone}
                        onChange={(e) => setNewUserField('phone', e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button type="submit" className="btn-primary" disabled={loading}>
                      {loading ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                      Tạo tài khoản
                    </button>
                  </div>
                </form>
              </div>

              {/* Danh sach Tai Khoan */}
              <div className="rounded-xl border border-[#e3e8ee] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#f0f4ff] pb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0d253d]">
                    <Users className="text-brand-600" size={18} />
                    <span>Danh sách tài khoản ({userList.length})</span>
                  </div>
                  {loadingUsers && <Loader2 className="animate-spin text-brand-600" size={16} />}
                </div>

                <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                  {userList.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border border-[#e3e8ee] bg-[#f8faff] p-3 text-sm transition-colors hover:bg-white hover:border-brand-200"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[#0d253d] truncate">{repairVietnameseText(u.full_name)}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              u.role === 'chief_accountant'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {u.role_name || u.role}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748d] mt-0.5">{u.email}</p>
                      </div>
                      <div className="text-right text-xs text-[#64748d] shrink-0">
                        <p className="font-medium text-[#0d253d]">{u.employee_code || '---'}</p>
                        <p>{repairVietnameseText(u.department) || 'Kế toán'}</p>
                      </div>
                    </div>
                  ))}
                  {userList.length === 0 && !loadingUsers && (
                    <p className="py-4 text-center text-xs text-[#64748d]">Chưa có tài khoản nào khác.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
