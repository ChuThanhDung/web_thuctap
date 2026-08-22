import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  activateUserAccount,
  createUserAccount,
  deactivateUserAccount,
  getAvatarViewUrl,
  getUserAccounts,
  updateUserAccount,
} from '../api.js';
import { repairVietnameseText } from '../text.js';

const EMPTY_FORM = {
  email: '',
  password: '',
  full_name: '',
  role_code: 'accountant',
  phone: '',
  citizen_id: '',
  address: '',
  date_of_birth: '',
};
const USERS_PER_PAGE = 5;

function getInitials(fullName = '') {
  return repairVietnameseText(fullName)
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function UserAvatar({ user }) {
  const [imageError, setImageError] = useState(false);
  const avatarUrl = getAvatarViewUrl(user);
  const fullName = repairVietnameseText(user.full_name);

  useEffect(() => setImageError(false), [avatarUrl]);

  if (avatarUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        onError={() => setImageError(true)}
        className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
      {getInitials(fullName) || 'U'}
    </div>
  );
}

function RoleBadge({ role }) {
  const isChief = role === 'chief_accountant';
  return (
    <span className={`inline-flex whitespace-nowrap text-sm font-semibold ${
      isChief
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-blue-700 dark:text-blue-300'
    }`}>
      {isChief ? 'KT_Trưởng' : 'KT_Viên'}
    </span>
  );
}

function StatusBadge({ status }) {
  const isActive = status === 'ACTIVE';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
      isActive
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    }`}>
      {isActive ? 'Active' : 'Deactive'}
    </span>
  );
}

function buildFormFromUser(user) {
  return {
    email: user.email || '',
    password: '',
    full_name: repairVietnameseText(user.full_name) || '',
    role_code: user.role || 'accountant',
    phone: user.phone || '',
    citizen_id: user.citizen_id || '',
    address: repairVietnameseText(user.address) || '',
    date_of_birth: user.date_of_birth || '',
  };
}

export default function UserManagement({ token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const response = await getUserAccounts(token);
      setUsers(response.items || []);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [token]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !query || [
        user.full_name,
        user.email,
        user.phone,
        user.citizen_id,
        user.address,
        user.role_name,
      ].some((value) => repairVietnameseText(value || '').toLowerCase().includes(query));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchQuery, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice((safePage - 1) * USERS_PER_PAGE, safePage * USERS_PER_PAGE);
  const startIndex = filteredUsers.length === 0 ? 0 : (safePage - 1) * USERS_PER_PAGE + 1;
  const endIndex = Math.min(safePage * USERS_PER_PAGE, filteredUsers.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, searchQuery, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function openCreateModal() {
    setModalOpen(true);
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
    setPasswordVisible(false);
    setError('');
    setMessage('');
  }

  function openEditModal(user) {
    setModalOpen(true);
    setEditingUser(user);
    setForm(buildFormFromUser(user));
    setPasswordVisible(false);
    setError('');
    setMessage('');
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
    setPasswordVisible(false);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validateForm() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) return 'Email không hợp lệ.';
    if (!form.full_name.trim()) return 'Vui lòng nhập họ và tên.';
    if (!editingUser && form.password.length < 6) return 'Mật khẩu phải có tối thiểu 6 ký tự.';
    if (!/^\d{10}$/.test(form.phone)) return 'Số điện thoại phải đủ 10 số.';
    if (!/^\d{12}$/.test(form.citizen_id)) return 'Căn cước công dân phải đủ 12 số.';
    if (!form.address.trim()) return 'Vui lòng nhập địa chỉ.';
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    const payload = {
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      role_code: form.role_code,
      phone: form.phone,
      citizen_id: form.citizen_id,
      address: form.address.trim(),
      date_of_birth: form.date_of_birth || null,
    };

    try {
      if (editingUser) {
        await updateUserAccount(token, editingUser.id, payload);
        setMessage('Đã cập nhật tài khoản.');
      } else {
        await createUserAccount(token, { ...payload, password: form.password });
        setMessage('Đã tạo tài khoản mới.');
      }
      setModalOpen(false);
      setEditingUser(null);
      setForm({ ...EMPTY_FORM });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Không thể lưu tài khoản.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(user) {
    const confirmed = window.confirm(`Bạn có chắc muốn vô hiệu hóa tài khoản "${repairVietnameseText(user.full_name)}" không?`);
    if (!confirmed) return;

    try {
      setError('');
      await deactivateUserAccount(token, user.id);
      setMessage('Đã chuyển tài khoản sang Deactive.');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Không thể vô hiệu hóa tài khoản.');
    }
  }

  async function handleActivate(user) {
    const confirmed = window.confirm(`Bạn có chắc muốn kích hoạt lại tài khoản "${repairVietnameseText(user.full_name)}" không?`);
    if (!confirmed) return;

    try {
      setError('');
      await activateUserAccount(token, user.id);
      setMessage('Đã kích hoạt lại tài khoản.');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Không thể kích hoạt tài khoản.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quản lý tài khoản</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Quản lý Kế toán trưởng và Kế toán viên trong hệ thống.
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="btn-primary self-start lg:self-auto">
          <Plus size={16} />
          Tạo tài khoản
        </button>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          error
            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
        }`}>
          {error || message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo tên, email, số điện thoại, CCCD, địa chỉ..."
              className="input-field pl-9"
            />
          </div>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="input-field lg:w-52">
            <option value="all">Tất cả vai trò</option>
            <option value="chief_accountant">Kế toán trưởng</option>
            <option value="accountant">Kế toán viên</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field lg:w-44">
            <option value="all">Tất cả trạng thái</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVE">Deactive</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={20} />
            Đang tải danh sách...
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className="w-[20%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Người dùng</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Số điện thoại</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">CCCD</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Địa chỉ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">Trạng thái</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50">
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar user={user} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900 dark:text-slate-100">{repairVietnameseText(user.full_name)}</p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                            <Mail size={12} />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Phone size={13} />
                        <span className="truncate">{user.phone || '-'}</span>
                      </span>
                    </td>
                    <td className="truncate px-4 py-3 text-slate-600 dark:text-slate-300">{user.citizen_id || '-'}</td>
                    <td className="max-w-[260px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin size={13} className="shrink-0" />
                        <span className="truncate">{repairVietnameseText(user.address) || '-'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          title="Sửa tài khoản"
                          aria-label={`Sửa tài khoản ${repairVietnameseText(user.full_name)}`}
                        >
                          <Edit3 size={14} />
                        </button>
                        {user.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(user)}
                            disabled={String(user.id) === String(currentUser?.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Chuyển sang Deactive"
                            aria-label={`Chuyển ${repairVietnameseText(user.full_name)} sang Deactive`}
                          >
                            <X size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(user)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
                            title="Kích hoạt lại"
                            aria-label={`Kích hoạt lại ${repairVietnameseText(user.full_name)}`}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="py-16 text-center text-sm text-slate-500">Không tìm thấy người dùng phù hợp.</div>
            )}
            {filteredUsers.length > USERS_PER_PAGE && (
              <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Hiển thị {startIndex}-{endIndex} / {filteredUsers.length} tài khoản
                </span>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={safePage === 1}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Trước
                  </button>
                  <span className="min-w-[88px] text-center font-semibold text-slate-700 dark:text-slate-200">
                    Trang {safePage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={safePage === totalPages}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {editingUser ? 'Sửa tài khoản' : 'Tạo tài khoản'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Thông tin được lưu trực tiếp xuống database.</p>
              </div>
              <button type="button" onClick={closeModal} className="btn-ghost h-8 w-8 rounded-lg p-0" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 md:col-span-2 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  {error}
                </div>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Email</span>
                <input type="email" required value={form.email} onChange={(e) => updateForm('email', e.target.value)} className="input-field" />
              </label>
              {!editingUser && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Mật khẩu</span>
                  <div className="relative">
                    <input
                      type={passwordVisible ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => updateForm('password', e.target.value)}
                      className="input-field pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition-colors hover:text-brand-600"
                      title={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-label={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Họ và tên</span>
                <input required value={form.full_name} onChange={(e) => updateForm('full_name', e.target.value)} className="input-field" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Role</span>
                <select value={form.role_code} onChange={(e) => updateForm('role_code', e.target.value)} className="input-field">
                  <option value="chief_accountant">Kế toán trưởng</option>
                  <option value="accountant">Kế toán viên</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Số điện thoại</span>
                <input
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric"
                  maxLength={10}
                  required
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Căn cước công dân</span>
                <input
                  value={form.citizen_id}
                  onChange={(e) => updateForm('citizen_id', e.target.value.replace(/\D/g, '').slice(0, 12))}
                  inputMode="numeric"
                  maxLength={12}
                  required
                  className="input-field"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Địa chỉ</span>
                <input required value={form.address} onChange={(e) => updateForm('address', e.target.value)} className="input-field" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Phòng ban</span>
                <input value="Phòng Kế toán - Tài chính" disabled className="input-field cursor-not-allowed bg-slate-100 text-slate-500" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Mã nhân viên</span>
                <input
                  value={editingUser?.employee_code || (form.role_code === 'chief_accountant' ? 'Tự sinh: CHIEF-xxx' : 'Tự sinh: ACC-xxx')}
                  disabled
                  className="input-field cursor-not-allowed bg-slate-100 text-slate-500"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeModal} disabled={saving} className="btn-secondary disabled:opacity-50">Hủy</button>
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Lưu
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
