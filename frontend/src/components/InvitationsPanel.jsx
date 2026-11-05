import React, { useCallback, useEffect, useState } from 'react';
import { Copy, MailPlus, X } from 'lucide-react';
import { createInvitation, getInvitations, revokeInvitation } from '../api.js';
import { vi } from '../i18n/vi.js';
import { formatDate } from '../lib/format.js';
import { Button, Card, CardHeader, Field, Input, Modal, Select, useToast } from '../ui/index.js';

const ROLE_OPTIONS = [
  { value: 'accountant', label: vi.roles.accountant },
  { value: 'chief_accountant', label: vi.roles.chief_accountant },
];
const EMPTY = { email: '', full_name: '', role_code: 'accountant' };

/** Mời người dùng vào công ty qua email, và danh sách lời mời đang chờ (chỉ kế toán trưởng). */
export default function InvitationsPanel({ token }) {
  const toast = useToast();
  const [invitations, setInvitations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [emailSent, setEmailSent] = useState(true);

  const load = useCallback(() => {
    getInvitations(token)
      .then(setInvitations)
      .catch((err) => toast.error(err.message));
  }, [token, toast]);

  useEffect(load, [load]);

  function openModal() {
    setForm(EMPTY);
    setError('');
    setCreatedLink('');
    setOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const invitation = await createInvitation(token, form);
      setCreatedLink(invitation.accept_url);
      setEmailSent(invitation.email_sent !== false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Đã chép link mời.');
    } catch {
      toast.warning('Trình duyệt chặn sao chép. Hãy chọn link và chép thủ công.');
    }
  }

  async function handleRevoke(invitation) {
    try {
      await revokeInvitation(token, invitation.id);
      toast.success(`Đã thu hồi lời mời ${invitation.email}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Lời mời đang chờ"
          description="Người được mời nhận email, tự đặt mật khẩu và vào thẳng công ty. Link có hiệu lực 7 ngày."
          action={
            <Button leadingIcon={MailPlus} onClick={openModal}>
              Mời qua email
            </Button>
          }
        />
        {invitations.length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-muted">Không có lời mời nào đang chờ.</p>
        ) : (
          <ul className="divide-y divide-line">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-fg">
                    {invitation.full_name} · {vi.roles[invitation.role_code]}
                  </span>
                  <span className="block break-all text-fg-muted">
                    {invitation.email} · hết hạn {formatDate(invitation.expires_at)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => handleRevoke(invitation)}>
                  Thu hồi
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={createdLink ? (emailSent ? 'Đã gửi lời mời' : 'Đã tạo lời mời') : 'Mời người dùng'}
        description={createdLink ? undefined : 'Gửi email mời vào công ty của bạn.'}
        footer={
          createdLink ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              {vi.actions.close}
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)} disabled={saving}>
                {vi.actions.cancel}
              </Button>
              <Button variant="primary" type="submit" form="invite-form" loading={saving}>
                Gửi lời mời
              </Button>
            </>
          )
        }
      >
        {createdLink ? (
          <div className="space-y-3 text-sm">
            {emailSent ? (
              <p className="text-fg-muted">
                Email mời đã gửi tới <strong className="text-fg">{form.email}</strong>. Nếu sau vài phút người nhận vẫn không
                thấy (kể cả mục Spam/Quảng cáo), gửi họ link này:
              </p>
            ) : (
              <p role="alert" className="text-tone-danger-fg">
                Máy chủ chưa gửi được email tới <strong>{form.email}</strong>. Lời mời vẫn có hiệu lực: chép link dưới đây
                và gửi cho người nhận qua Zalo hoặc email của bạn.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input readOnly value={createdLink} onFocus={(event) => event.target.select()} aria-label="Link mời" />
              <Button iconOnly aria-label="Chép link mời" onClick={() => copyLink(createdLink)}>
                <Copy size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <form id="invite-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Họ tên" required>
              <Input
                value={form.full_name}
                minLength={2}
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              />
            </Field>
            <Field label="Vai trò">
              <Select
                value={form.role_code}
                onChange={(role_code) => setForm((current) => ({ ...current, role_code }))}
                options={ROLE_OPTIONS}
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
                {error}
              </p>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
