import React, { useEffect, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { enableMfa, startMfaSetup } from '../api.js';
import { Button, Field, Input, useToast } from '../ui/index.js';

/** Các mã khôi phục vừa tạo: chỉ hiện một lần, có nút chép và tải về. */
export function RecoveryCodes({ codes, onDone, doneLabel = 'Tôi đã lưu mã khôi phục' }) {
  const toast = useToast();
  const text = codes.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Đã chép mã khôi phục.');
    } catch {
      toast.warning('Trình duyệt chặn sao chép, hãy chép thủ công.');
    }
  }

  function download() {
    const blob = new Blob([`Mã khôi phục DocuSync AI (mỗi mã dùng một lần)\n\n${text}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'docusync-ma-khoi-phuc.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Lưu các mã này ở nơi an toàn (trình quản lý mật khẩu, giấy cất kỹ). Mất điện thoại thì dùng một mã thay cho mã 6 số;
        mỗi mã chỉ dùng được một lần. Mã chỉ hiện <strong className="text-fg">lần này</strong>.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-card border border-line bg-surface-muted p-4 font-mono text-sm tabular-nums text-fg">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button leadingIcon={Copy} onClick={copy}>Chép</Button>
        <Button leadingIcon={Download} onClick={download}>Tải tệp .txt</Button>
        <Button variant="primary" className="ml-auto" onClick={onDone}>{doneLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Cài xác thực hai lớp: quét QR bằng ứng dụng xác thực → nhập mã 6 số → hiện mã khôi phục.
 * onFinished() gọi khi đã bật và người dùng xác nhận đã lưu mã khôi phục.
 */
export default function MfaSetup({ token, onFinished }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState(null);

  useEffect(() => {
    startMfaSetup(token)
      .then(setSetup)
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await enableMfa(token, code);
      setCodes(result.recovery_codes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={onFinished} />;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
        <li>Cài ứng dụng xác thực trên điện thoại: Google Authenticator, Microsoft Authenticator hoặc tương tự.</li>
        <li>Trong ứng dụng, chọn thêm tài khoản và quét mã QR dưới đây.</li>
        <li>Nhập mã 6 số ứng dụng hiện ra.</li>
      </ol>
      {setup ? (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-5">
          <img src={setup.qr_svg} alt="Mã QR để thêm DocuSync AI vào ứng dụng xác thực" className="h-44 w-44 rounded-card border border-line bg-white p-1" />
          <div className="min-w-0 text-sm text-fg-muted">
            <p>Không quét được? Nhập khóa này vào ứng dụng:</p>
            <p className="mt-1 break-all rounded-control bg-surface-muted px-2 py-1.5 font-mono text-xs text-fg">{setup.secret}</p>
          </div>
        </div>
      ) : (
        !error && <p className="text-sm text-fg-muted">Đang tạo mã…</p>
      )}
      <Field label="Mã 6 số" required>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="text-center text-lg font-semibold tracking-[0.4em] tabular-nums"
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-control border border-tone-danger-line bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!setup || code.length !== 6}>
        Bật xác thực hai lớp
      </Button>
    </form>
  );
}
