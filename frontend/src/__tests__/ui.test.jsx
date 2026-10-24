import React, { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalBadge,
  Avatar,
  BatchStatusBadges,
  Button,
  Card,
  ConfirmDialog,
  Confidence,
  DropdownMenu,
  EmptyState,
  Field,
  Input,
  Modal,
  ReconciliationBadge,
  Select,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  ToastProvider,
  Tooltip,
  getConfidenceLevel,
  useToast,
} from '../ui/index.js';

describe('Button', () => {
  it('is disabled and announces busy while loading, and ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lưu
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Hủy</Button>);
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveAttribute('type', 'button');
  });

  it('exposes an accessible name for icon-only buttons', () => {
    render(<Button iconOnly aria-label="Xóa file" leadingIcon={Trash2} />);
    expect(screen.getByRole('button', { name: 'Xóa file' })).toBeInTheDocument();
  });
});

describe('status badges', () => {
  it('always renders text and an icon, not just a colour', () => {
    const { container } = render(<ReconciliationBadge status="mismatch" />);
    expect(screen.getByText('Có chênh lệch')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders nothing for an unknown status', () => {
    const { container } = render(<ApprovalBadge status="nope" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('every batch gets a reconciliation badge (including one with no approval yet)', () => {
    render(<BatchStatusBadges batch={{ status: 'incomplete', missing_doc_types: ['po'], pending_extraction_doc_types: [] }} />);
    expect(screen.getByText('Thiếu chứng từ')).toBeInTheDocument();
    expect(screen.queryByText(/duyệt/i)).not.toBeInTheDocument();
  });

  it('shows both groups for an approved batch', () => {
    render(<BatchStatusBadges batch={{ status: 'final_approved', reconciliation_status: 'matched' }} />);
    expect(screen.getByText('Khớp')).toBeInTheDocument();
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
  });
});

describe('Confidence', () => {
  it('classifies by the 0.9 / 0.7 thresholds', () => {
    expect(getConfidenceLevel(0.95)).toBe('high');
    expect(getConfidenceLevel(0.8)).toBe('medium');
    expect(getConfidenceLevel(0.5)).toBe('low');
    expect(getConfidenceLevel(95)).toBe('high');
    expect(getConfidenceLevel(null)).toBeNull();
  });

  it('shows level and percentage, or nothing without a value', () => {
    const { rerender, container } = render(<Confidence value={0.93} />);
    expect(screen.getByText(/Tin cậy cao · 93%/)).toBeInTheDocument();
    rerender(<Confidence value={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Field and Input', () => {
  it('connects label, hint and error to the control', () => {
    render(
      <Field label="Email" hint="Dùng email công ty" error="Email không hợp lệ" required>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Email không hợp lệ');
    expect(screen.getByRole('alert')).toHaveTextContent('Email không hợp lệ');
  });

  it('shows the hint when there is no error', () => {
    render(
      <Field label="Họ tên" hint="Như trên CCCD">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Họ tên')).toHaveAccessibleDescription('Như trên CCCD');
  });
});

const OPTIONS = [
  { value: 'all', label: 'Tất cả vai trò' },
  { value: 'accountant', label: 'Kế toán viên' },
  { value: 'chief_accountant', label: 'Kế toán trưởng' },
];

function SelectHarness({ onChange }) {
  const [value, setValue] = useState('all');
  return (
    <Select
      aria-label="Vai trò"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Select', () => {
  it('opens with the keyboard (Space or arrow), moves with arrows and selects with Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SelectHarness onChange={onChange} />);

    const button = screen.getByRole('button', { name: /Vai trò/ });
    expect(button).toHaveTextContent('Tất cả vai trò');

    button.focus();
    await user.keyboard(' ');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);

    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('accountant'));
    expect(screen.getByRole('button', { name: /Vai trò/ })).toHaveTextContent('Kế toán viên');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape without changing the value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SelectHarness onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Vai trò/ }));
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the placeholder when nothing is selected', () => {
    render(<Select aria-label="Trạng thái" value={undefined} options={OPTIONS} onChange={() => {}} placeholder="Chọn trạng thái" />);
    expect(screen.getByRole('button', { name: /Trạng thái/ })).toHaveTextContent('Chọn trạng thái');
  });
});

describe('DropdownMenu', () => {
  it('opens from an icon button with an accessible name and runs the chosen action', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<DropdownMenu label="Thao tác với Lan" items={[{ key: 'edit', label: 'Chỉnh sửa', onSelect: onEdit }]} />);

    await user.click(screen.getByRole('button', { name: 'Thao tác với Lan' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Chỉnh sửa' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('puts danger actions last, separated from the rest', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        items={[
          { key: 'delete', label: 'Xóa', tone: 'danger', onSelect: () => {} },
          { key: 'edit', label: 'Chỉnh sửa', onSelect: () => {} },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Chỉnh sửa', 'Xóa']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('supports keyboard navigation and Escape', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DropdownMenu items={[{ key: 'a', label: 'Mở', onSelect }]} />);
    screen.getByRole('button', { name: 'Thao tác khác' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Modal and ConfirmDialog', () => {
  it('is a labelled dialog and closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose} title="Thông tin cá nhân" description="Quản lý hồ sơ">
        <Input aria-label="Họ tên" />
      </Modal>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Thông tin cá nhân' });
    expect(dialog).toHaveAccessibleDescription('Quản lý hồ sơ');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from the labelled close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Tiêu đề">
        nội dung
      </Modal>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps keyboard focus inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Ngoài hộp thoại</button>
        <Modal open onClose={() => {}} title="Tiêu đề" footer={<Button>Lưu</Button>}>
          <Input aria-label="Họ tên" />
        </Modal>
      </>,
    );
    const dialog = await screen.findByRole('dialog');
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('asks for confirmation and reports the choice', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Xóa tài khoản?"
        description="Không thể hoàn tác."
        confirmLabel="Xóa"
        tone="danger"
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Xóa tài khoản?' });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cannot be dismissed while the action is running', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open loading onClose={onClose} onConfirm={() => {}} title="Đang xóa" />);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Table', () => {
  it('right-aligns numeric cells with tabular figures and labels the table', () => {
    render(
      <Table caption="Danh sách hóa đơn">
        <THead>
          <TR>
            <TH>Số</TH>
            <TH numeric>Thành tiền</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>00001845</TD>
            <TD numeric>119.240.000</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole('table', { name: 'Danh sách hóa đơn' })).toBeInTheDocument();
    expect(screen.getByText('119.240.000')).toHaveClass('text-right', 'tabular-nums');
    expect(screen.getByRole('columnheader', { name: 'Thành tiền' })).toHaveClass('text-right');
    expect(screen.getByRole('columnheader', { name: 'Số' })).toHaveAttribute('scope', 'col');
  });
});

describe('StatCard', () => {
  it('is a plain block without onClick', () => {
    render(<StatCard label="Chờ duyệt" value={3} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('3')).toHaveClass('tabular-nums');
  });

  it('acts as a toggle filter button with aria-pressed', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<StatCard label="Chờ duyệt" value={3} onClick={onClick} active={false} />);
    const button = screen.getByRole('button', { name: /Chờ duyệt/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
    rerender(<StatCard label="Chờ duyệt" value={3} onClick={onClick} active />);
    expect(screen.getByRole('button', { name: /Chờ duyệt/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('EmptyState and Card', () => {
  it('explains the empty state and offers an action', () => {
    render(
      <EmptyState title="Chưa có bộ đối soát" description="Tải chứng từ để bắt đầu." action={<Button variant="primary">Tải lên</Button>} />,
    );
    expect(screen.getByRole('heading', { name: 'Chưa có bộ đối soát' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lên' })).toBeInTheDocument();
  });

  it('renders children inside a card', () => {
    render(<Card data-testid="card">nội dung</Card>);
    expect(screen.getByTestId('card')).toHaveTextContent('nội dung');
  });
});

describe('Avatar', () => {
  it('shows initials from the real name and exposes it to screen readers', () => {
    render(<Avatar name="Chu Thanh Dũng (Kế toán viên)" />);
    const avatar = screen.getByRole('img', { name: 'Chu Thanh Dũng' });
    expect(avatar).toHaveTextContent('CD');
  });

  it('uses the same colour for the same person', () => {
    const { container, rerender } = render(<Avatar name="Nguyễn Thị Lan" />);
    const first = container.firstChild.className;
    rerender(<Avatar name="Nguyễn Thị Lan" />);
    expect(container.firstChild.className).toBe(first);
  });

  it('prefers a photo when there is one', () => {
    const { container } = render(<Avatar name="Trần Văn Minh" src="/a.png" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/a.png');
  });
});

describe('Tooltip', () => {
  it('appears on keyboard focus, describes the trigger, and hides on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="po_11_10_2026_143.pdf">
        <button type="button">po_11…</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'po_11…' });
    await user.tab();
    expect(trigger).toHaveFocus();

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('po_11_10_2026_143.pdf');
    expect(trigger).toHaveAccessibleDescription('po_11_10_2026_143.pdf');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('renders only the child when there is no content', () => {
    render(
      <Tooltip content="">
        <button type="button">x</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'x' })).toBeInTheDocument();
  });
});

function ToastDemo() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success('Đã lưu')}>
        ok
      </button>
      <button type="button" onClick={() => toast.error('Không thể xóa file')}>
        fail
      </button>
    </>
  );
}

describe('Toast', () => {
  it('announces success politely and errors assertively, in a labelled region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastDemo />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ok' }));
    await user.click(screen.getByRole('button', { name: 'fail' }));

    expect(screen.getByRole('region', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu');
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể xóa file');
  });

  it('can be dismissed with a labelled button', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastDemo />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ok' }));
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('dismisses itself after its duration', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <ToastDemo />
        </ToastProvider>,
      );
      act(() => {
        screen.getByRole('button', { name: 'ok' }).click();
      });
      expect(screen.getByRole('status')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(4100);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses to be used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastDemo />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
