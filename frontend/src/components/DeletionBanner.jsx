import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { formatDate } from '../lib/format.js';
import { ROUTES } from '../routes.js';

/** Công ty đã có yêu cầu xóa: nhắc mọi người trong công ty ngày dữ liệu bị xóa. */
export default function DeletionBanner({ organization, canManage }) {
  if (!organization?.deletion_scheduled_for) return null;
  return (
    <p
      role="status"
      className="mb-4 flex items-start gap-2 rounded-card border border-tone-danger-line bg-tone-danger-bg px-4 py-2.5 text-sm text-tone-danger-fg"
    >
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        Dữ liệu công ty sẽ bị xóa vĩnh viễn ngày <strong>{formatDate(organization.deletion_scheduled_for)}</strong>.{' '}
        {canManage ? (
          <Link to={ROUTES.privacy} className="font-semibold underline underline-offset-2">
            Tải dữ liệu hoặc hủy yêu cầu
          </Link>
        ) : (
          'Liên hệ kế toán trưởng nếu cần giữ dữ liệu.'
        )}
      </span>
    </p>
  );
}
