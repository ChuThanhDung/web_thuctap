import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StyleGuide from '../pages/StyleGuide.jsx';
import { ToastProvider } from '../ui/index.js';

describe('StyleGuide', () => {
  it('renders every foundation component without errors', () => {
    render(
      <ToastProvider>
        <StyleGuide />
      </ToastProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Bảng mẫu giao diện' })).toBeInTheDocument();
    // Cả 4 trạng thái đối soát và 4 trạng thái duyệt đều có badge.
    for (const label of ['Đang xử lý', 'Thiếu chứng từ', 'Khớp', 'Có chênh lệch', 'Chờ kế toán viên duyệt', 'Chờ kế toán trưởng duyệt', 'Đã duyệt', 'Từ chối']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Avatar lấy chữ viết tắt từ họ tên thật, không từ vai trò trong ngoặc.
    expect(screen.getByRole('img', { name: 'Chu Thanh Dũng' })).toHaveTextContent('CD');
  });
});
