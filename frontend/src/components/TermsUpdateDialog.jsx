import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { acceptTerms } from '../api.js';
import { ROUTES } from '../routes.js';
import { Button, Modal } from '../ui/index.js';

const LINK = 'font-semibold text-primary underline-offset-2 hover:underline';

/** Người dùng chưa đồng ý phiên bản điều khoản hiện tại: hỏi trước khi dùng tiếp (không đóng được). */
export default function TermsUpdateDialog({ token, onAccepted, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    setLoading(true);
    setError('');
    try {
      onAccepted(await acceptTerms(token));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => {}}
      dismissible={false}
      title="Điều khoản và chính sách dữ liệu"
      size="sm"
      footer={
        <>
          <Button onClick={onLogout} disabled={loading}>Đăng xuất</Button>
          <Button variant="primary" onClick={handleAccept} loading={loading}>Tôi đồng ý</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-fg-muted">
        <p>
          Để tiếp tục, vui lòng đọc và đồng ý với{' '}
          <Link to={ROUTES.terms} target="_blank" className={LINK}>Điều khoản sử dụng</Link>,{' '}
          <Link to={ROUTES.privacyPolicy} target="_blank" className={LINK}>Chính sách bảo vệ dữ liệu cá nhân</Link> và{' '}
          <Link to={ROUTES.dpa} target="_blank" className={LINK}>Thỏa thuận xử lý dữ liệu</Link>.
        </p>
        <p>
          Điểm chính: chứng từ PDF/ảnh được gửi tới dịch vụ AI ở Hoa Kỳ để đọc (kế toán trưởng tắt được), CCCD được mã hóa,
          công ty tải về hoặc yêu cầu xóa toàn bộ dữ liệu bất cứ lúc nào.
        </p>
        {error && <p role="alert" className="font-medium text-tone-danger-fg">{error}</p>}
      </div>
    </Modal>
  );
}
