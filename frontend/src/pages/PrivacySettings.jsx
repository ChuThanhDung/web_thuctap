import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Trash2 } from 'lucide-react';
import {
  cancelCompanyDeletion,
  downloadCompanyExport,
  getCurrentUser,
  getPrivacySettings,
  requestCompanyDeletion,
  updatePrivacySettings,
} from '../api.js';
import { vi } from '../i18n/vi.js';
import { formatDate } from '../lib/format.js';
import { ROUTES } from '../routes.js';
import { Button, Card, CardHeader, Field, Input, Modal, PageHeader, cn, useToast } from '../ui/index.js';

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-line-input',
      )}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export default function PrivacySettings({ token, user, onUserUpdate }) {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [savingAi, setSavingAi] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const companyName = user.organization?.name || '';

  useEffect(() => {
    getPrivacySettings(token)
      .then(setSettings)
      .catch((err) => toast.error(err.message));
  }, [token, toast]);

  async function refreshUser() {
    try {
      onUserUpdate?.(await getCurrentUser(token));
    } catch {
      // Thông tin trên thanh bên cập nhật ở lần mở app sau.
    }
  }

  async function handleAiToggle(enabled) {
    setSavingAi(true);
    try {
      setSettings(await updatePrivacySettings(token, { ai_enabled: enabled }));
      toast.success(enabled ? 'Đã bật đọc PDF/ảnh bằng AI.' : 'Đã tắt AI: công ty chỉ tải được file XML.');
      await refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingAi(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { blob, filename } = await downloadCompanyExport(token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleRequestDeletion(event) {
    event.preventDefault();
    setDeleteError('');
    setDeleting(true);
    try {
      setSettings(await requestCompanyDeletion(token, password, confirmName));
      setDeleteOpen(false);
      toast.warning('Đã ghi nhận yêu cầu xóa. Có thể hủy trước ngày xóa.');
      await refreshUser();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancelDeletion() {
    try {
      setSettings(await cancelCompanyDeletion(token));
      toast.success('Đã hủy yêu cầu xóa công ty.');
      await refreshUser();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!settings) return <p className="text-sm text-fg-muted">{vi.common.loading}</p>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dữ liệu & quyền riêng tư"
        description="Kiểm soát việc gửi chứng từ ra dịch vụ AI, tải toàn bộ dữ liệu và yêu cầu xóa công ty."
      />

      <Card>
        <CardHeader
          title="Đọc chứng từ PDF/ảnh bằng AI"
          description="PDF và ảnh được gửi tới dịch vụ AI ở Hoa Kỳ để đọc. Tắt thì công ty chỉ tải được XML, đọc ngay trên máy chủ, không file nào ra nước ngoài."
          action={<Toggle checked={settings.ai_enabled} onChange={handleAiToggle} disabled={savingAi} label="Đọc chứng từ bằng AI" />}
        />
        <p className="px-5 py-3 text-sm text-fg-muted">
          Đang {settings.ai_enabled ? <strong className="text-fg">bật</strong> : <strong className="text-fg">tắt</strong>}. Chi tiết ở{' '}
          <Link to={ROUTES.privacyPolicy} className="font-semibold text-primary underline-offset-2 hover:underline">
            Chính sách bảo vệ dữ liệu
          </Link>
          .
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Tải toàn bộ dữ liệu"
          description="Một file ZIP gồm chứng từ gốc, dữ liệu hệ thống đọc được, danh sách bộ đối soát, người dùng và nhật ký thao tác."
          action={
            <Button leadingIcon={Download} loading={exporting} onClick={handleExport}>
              Tải về
            </Button>
          }
        />
        <p className="px-5 py-3 text-sm text-fg-muted">
          Theo Luật Kế toán, chứng từ dùng ghi sổ phải lưu tối thiểu 10 năm. Hãy tải và cất giữ trước khi ngừng dùng dịch vụ.
        </p>
      </Card>

      <Card className="border-tone-danger-line">
        <CardHeader
          title="Xóa công ty"
          description="Xóa vĩnh viễn mọi chứng từ, kết quả đối soát, tài khoản và nhật ký của công ty, 30 ngày sau khi yêu cầu."
        />
        <div className="px-5 py-4">
          {settings.deletion_scheduled_for ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p role="status" className="text-sm text-tone-danger-fg">
                Công ty sẽ bị xóa ngày <strong>{formatDate(settings.deletion_scheduled_for)}</strong>. Trước ngày đó mọi người vẫn
                dùng bình thường.
              </p>
              <Button onClick={handleCancelDeletion}>Hủy yêu cầu xóa</Button>
            </div>
          ) : (
            <Button
              variant="danger"
              leadingIcon={Trash2}
              onClick={() => {
                setPassword('');
                setConfirmName('');
                setDeleteError('');
                setDeleteOpen(true);
              }}
            >
              Yêu cầu xóa công ty
            </Button>
          )}
        </div>
      </Card>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Yêu cầu xóa công ty" size="sm">
        <form onSubmit={handleRequestDeletion} className="space-y-4">
          <p className="text-sm text-fg-muted">
            Sau 30 ngày, toàn bộ dữ liệu của <strong className="text-fg">{companyName}</strong> bị xóa và không khôi phục được.
            Mọi kế toán trưởng nhận email thông báo và có thể hủy trong thời gian đó.
          </p>
          <Field label={`Gõ lại tên công ty: ${companyName}`} required>
            <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" />
          </Field>
          <Field label="Mật khẩu của bạn" required>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </Field>
          {deleteError && <p role="alert" className="text-sm font-medium text-tone-danger-fg">{deleteError}</p>}
          <Button
            type="submit"
            variant="danger"
            className="w-full"
            loading={deleting}
            disabled={!password || confirmName.trim().toLocaleLowerCase('vi') !== companyName.trim().toLocaleLowerCase('vi')}
          >
            Xác nhận yêu cầu xóa
          </Button>
        </form>
      </Modal>
    </div>
  );
}
