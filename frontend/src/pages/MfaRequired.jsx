import React from 'react';
import { LogOut } from 'lucide-react';
import { getCurrentUser } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import MfaSetup from '../components/MfaSetup.jsx';
import { vi } from '../i18n/vi.js';

/** Kế toán trưởng / admin nền tảng chưa bật 2FA: phải cài xong mới vào được hệ thống. */
export default function MfaRequired({ token, user, onUserUpdate, onLogout }) {
  async function handleFinished() {
    onUserUpdate(await getCurrentUser(token));
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md rounded-modal bg-surface p-5 shadow-pop sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-fg">Bật xác thực hai lớp</h2>
            <p className="mt-2 text-sm text-fg-subtle">
              Tài khoản {vi.roles[user.role]?.toLowerCase()} bắt buộc dùng mã từ điện thoại khi đăng nhập, để mật khẩu bị lộ
              cũng không ai vào được.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <LogOut size={15} aria-hidden="true" /> {vi.shell.logout}
          </button>
        </div>
        <MfaSetup token={token} onFinished={handleFinished} />
      </div>
    </AuthLayout>
  );
}
