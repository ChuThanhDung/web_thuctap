import React, { useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { disableMfa, getCurrentUser, regenerateRecoveryCodes } from '../api.js';
import { Badge, Button, Field, Input, Modal, useToast } from '../ui/index.js';
import MfaSetup, { RecoveryCodes } from './MfaSetup.jsx';

const REQUIRED_ROLES = ['chief_accountant', 'platform_admin'];

/** Mục xác thực hai lớp trong hồ sơ: bật, tạo lại mã khôi phục, tắt (vai trò không bắt buộc). */
export default function MfaSettings({ token, user, onUserUpdate }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // 'setup' | 'codes' | 'disable'
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [newCodes, setNewCodes] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const required = REQUIRED_ROLES.includes(user.role);

  function open(name) {
    setDialog(name);
    setCode('');
    setPassword('');
    setNewCodes(null);
    setError('');
  }

  async function refreshUser() {
    try {
      onUserUpdate?.(await getCurrentUser(token));
    } catch {
      // Trạng thái hiển thị cập nhật ở lần mở app sau.
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (dialog === 'codes') {
        setNewCodes((await regenerateRecoveryCodes(token, code)).recovery_codes);
      } else {
        await disableMfa(token, password, code);
        toast.success('Đã tắt xác thực hai lớp.');
        setDialog(null);
        await refreshUser();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="mfa-heading" className="mt-4 rounded-card border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="mfa-heading" className="flex items-center gap-2 text-sm font-semibold text-fg">
          {user.mfa_enabled ? <ShieldCheck size={16} className="text-tone-success-fg" aria-hidden="true" /> : <ShieldOff size={16} aria-hidden="true" />}
          Xác thực hai lớp
        </h3>
        <Badge tone={user.mfa_enabled ? 'success' : 'neutral'} size="sm">{user.mfa_enabled ? 'Đang bật' : 'Chưa bật'}</Badge>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Đăng nhập cần thêm mã 6 số từ điện thoại.{required ? ' Bắt buộc với vai trò của bạn.' : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {user.mfa_enabled ? (
          <>
            <Button size="sm" onClick={() => open('codes')}>Tạo mã khôi phục mới</Button>
            {!required && <Button size="sm" variant="ghost" onClick={() => open('disable')}>Tắt</Button>}
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={() => open('setup')}>Bật xác thực hai lớp</Button>
        )}
      </div>

      <Modal open={dialog === 'setup'} onClose={() => setDialog(null)} title="Bật xác thực hai lớp">
        {dialog === 'setup' && (
          <MfaSetup
            token={token}
            onFinished={async () => {
              setDialog(null);
              toast.success('Đã bật xác thực hai lớp.');
              await refreshUser();
            }}
          />
        )}
      </Modal>

      <Modal
        open={dialog === 'codes' || dialog === 'disable'}
        onClose={() => setDialog(null)}
        title={dialog === 'codes' ? 'Tạo mã khôi phục mới' : 'Tắt xác thực hai lớp'}
        size="sm"
      >
        {newCodes ? (
          <RecoveryCodes codes={newCodes} onDone={() => setDialog(null)} doneLabel="Xong" />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-fg-muted">
              {dialog === 'codes'
                ? 'Bộ mã cũ sẽ hết hiệu lực. Nhập mã 6 số hiện tại để xác nhận.'
                : 'Nhập mật khẩu và mã 6 số để xác nhận.'}
            </p>
            {dialog === 'disable' && (
              <Field label="Mật khẩu" required>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              </Field>
            )}
            <Field label="Mã 6 số" required>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>
            {error && <p role="alert" className="text-sm font-medium text-tone-danger-fg">{error}</p>}
            <Button type="submit" variant={dialog === 'disable' ? 'danger' : 'primary'} className="w-full" loading={loading} disabled={code.length !== 6}>
              {dialog === 'codes' ? 'Tạo mã mới' : 'Tắt xác thực hai lớp'}
            </Button>
          </form>
        )}
      </Modal>
    </section>
  );
}
