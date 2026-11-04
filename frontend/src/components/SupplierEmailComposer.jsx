import React, { useState } from 'react';
import { Copy, Mail, Send } from 'lucide-react';
import { draftSupplierEmail, sendSupplierEmail } from '../api.js';
import { Button, Field, Input, Modal, Textarea } from '../ui/index.js';
import { useToast } from '../ui/Toast.jsx';

// Trợ lý soạn thư đề nghị nhà cung cấp điều chỉnh. Số liệu lấy từ kết quả đối soát; người dùng đọc, sửa, rồi tự bấm gửi
// (hoặc sao chép để gửi bằng email riêng).

export function canDraftSupplierEmail(batch) {
  return Boolean(batch) && !batch.foreignCopy && ['major_diff', 'minor_diff'].includes(batch.reconciliationStatus);
}

export default function SupplierEmailComposer({ token, batch }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState(null);
  const [letter, setLetter] = useState({ to: '', subject: '', body: '' });

  if (!canDraftSupplierEmail(batch)) return null;

  const start = async () => {
    setLoading(true);
    try {
      const result = await draftSupplierEmail(token, batch.id);
      setDraft(result);
      setLetter({ to: result.to || '', subject: result.subject, body: result.body });
      setOpen(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${letter.subject}\n\n${letter.body}`);
      toast.success('Đã sao chép tiêu đề và nội dung thư.');
    } catch {
      toast.error('Trình duyệt không cho sao chép; hãy chọn và sao chép thủ công.');
    }
  };

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      await sendSupplierEmail(token, batch.id, letter);
      toast.success(`Đã gửi thư tới ${letter.to}. Bạn nhận một bản sao; nhà cung cấp trả lời thẳng về email của bạn.`);
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const update = (key) => (event) => setLetter((current) => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <Button size="sm" variant="secondary" leadingIcon={Mail} loading={loading} onClick={start}>
        Soạn thư cho nhà cung cấp
      </Button>
      <Modal
        open={open}
        onClose={() => (sending ? null : setOpen(false))}
        size="lg"
        title={`Thư gửi ${draft?.supplier || 'nhà cung cấp'}`}
        description={
          draft?.ai_used
            ? 'AI viết lời dẫn; danh sách chênh lệch lấy nguyên từ kết quả đối soát. Đọc và sửa trước khi gửi.'
            : 'Thư dựng từ kết quả đối soát. Đọc và sửa trước khi gửi.'
        }
      >
        <form onSubmit={send} className="space-y-4">
          <Field label="Gửi tới" required hint="Email phòng kế toán hoặc kinh doanh của nhà cung cấp.">
            <Input type="email" value={letter.to} onChange={update('to')} autoComplete="email" />
          </Field>
          <Field label="Tiêu đề" required>
            <Input value={letter.subject} onChange={update('subject')} maxLength={200} />
          </Field>
          <Field label="Nội dung" required>
            <Textarea value={letter.body} onChange={update('body')} rows={14} maxLength={8000} className="font-[inherit]" />
          </Field>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" leadingIcon={Copy} onClick={copy}>
              Sao chép
            </Button>
            {draft?.can_send ? (
              <Button type="submit" variant="primary" leadingIcon={Send} loading={sending} disabled={!letter.to}>
                Gửi thư
              </Button>
            ) : (
              <p className="text-xs text-fg-muted">Máy chủ chưa cấu hình email: sao chép rồi gửi bằng email của bạn.</p>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
