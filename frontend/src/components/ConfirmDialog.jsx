import React from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';

/**
 * Hộp xác nhận dùng chung cho các trang. Dựng trên ui/Modal để có sẵn nhốt focus, Esc để đóng,
 * trả focus về nút đã mở và aria-modal. `children` dùng cho nội dung thêm (tóm tắt, cảnh báo).
 * tone: 'primary' | 'success' | 'danger' | 'warning' (success/warning hiển thị như primary).
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'primary',
  loading = false,
  onCancel,
  onConfirm,
}) {
  const handleClose = () => {
    if (!loading) onCancel?.();
  };

  return (
    <Modal
      open={Boolean(open)}
      onClose={handleClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
