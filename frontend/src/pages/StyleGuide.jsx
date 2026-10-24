import React, { useState } from 'react';
import { AlertTriangle, FileText, Inbox, Pencil, Trash2, Upload } from 'lucide-react';
import {
  ApprovalBadge,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Confidence,
  ConfirmDialog,
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
  Textarea,
  Tooltip,
  useToast,
} from '../ui/index.js';
import { APPROVAL_STATUSES, RECONCILIATION_STATUSES } from '../lib/status.js';
import { formatDateTime, formatVND } from '../lib/format.js';

const ROLE_OPTIONS = [
  { value: 'all', label: 'Tất cả vai trò' },
  { value: 'accountant', label: 'Kế toán viên' },
  { value: 'chief_accountant', label: 'Kế toán trưởng' },
];

const TONES = ['success', 'warning', 'danger', 'info', 'neutral', 'brand'];

function Section({ title, description, children }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="space-y-4 p-5">{children}</div>
    </Card>
  );
}

/** Trang mẫu giao diện: chỗ duyệt component và token ở cả chế độ sáng/tối. Chỉ bật khi build với VITE_STYLEGUIDE=true. */
export default function StyleGuide() {
  const toast = useToast();
  const [role, setRole] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filter, setFilter] = useState('pending');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Bảng mẫu giao diện</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Token, trạng thái và component nền tảng. Đổi giao diện Sáng/Tối ở thanh bên để kiểm tra cả hai chế độ.
        </p>
      </header>

      <Section title="Hệ trạng thái" description="Mỗi badge luôn có icon và chữ. Hai nhóm tách bạch: đối soát (AI) và duyệt (con người).">
        <div>
          <p className="mb-2 text-sm font-medium text-fg-muted">Trạng thái đối soát</p>
          <div className="flex flex-wrap gap-2">
            {RECONCILIATION_STATUSES.map((status) => (
              <ReconciliationBadge key={status} status={status} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-fg-muted">Trạng thái duyệt</p>
          <div className="flex flex-wrap gap-2">
            {APPROVAL_STATUSES.map((status) => (
              <ApprovalBadge key={status} status={status} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-fg-muted">Độ tin cậy AI (theo chứng từ)</p>
          <div className="flex flex-wrap gap-2">
            <Confidence value={0.96} />
            <Confidence value={0.78} />
            <Confidence value={0.52} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-fg-muted">Tông màu ngữ nghĩa</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} icon={AlertTriangle}>
                {tone}
              </Badge>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Thẻ chỉ số" description="Thẻ có thể bấm hoạt động như bộ lọc nhanh (aria-pressed).">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['pending', 'Chờ duyệt', 3, 'brand'],
            ['approved', 'Đã duyệt', 12, 'success'],
            ['rejected', 'Từ chối', 0, 'danger'],
          ].map(([key, label, value, tone]) => (
            <StatCard
              key={key}
              label={label}
              value={value}
              icon={FileText}
              tone={tone}
              hint="Bộ đối soát trong khoảng thời gian đang lọc."
              active={filter === key}
              onClick={() => setFilter(key)}
            />
          ))}
        </div>
      </Section>

      <Section title="Nút" description="Nút icon bắt buộc có aria-label. Nút đang tải bị khóa và báo aria-busy.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" leadingIcon={Upload}>
            Tải chứng từ
          </Button>
          <Button variant="secondary">Hủy</Button>
          <Button variant="ghost">Xem chi tiết</Button>
          <Button variant="danger" leadingIcon={Trash2}>
            Xóa
          </Button>
          <Button variant="primary" loading>
            Đang lưu
          </Button>
          <Button variant="secondary" disabled>
            Không khả dụng
          </Button>
          <Button variant="secondary" size="sm">
            Nhỏ
          </Button>
          <Button iconOnly aria-label="Chỉnh sửa" leadingIcon={Pencil} />
        </div>
      </Section>

      <Section title="Biểu mẫu" description="Nhãn, gợi ý và lỗi được nối sẵn với ô nhập (aria-describedby, aria-invalid).">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Họ và tên" hint="Như trên căn cước công dân" required>
            <Input placeholder="Nguyễn Văn A" />
          </Field>
          <Field label="Email" error="Email không hợp lệ">
            <Input defaultValue="khong-hop-le" />
          </Field>
          <Field label="Vai trò">
            <Select value={role} onChange={setRole} options={ROLE_OPTIONS} />
          </Field>
          <Field label="Ghi chú" hint="Tối đa 500 ký tự">
            <Textarea placeholder="Ví dụ: Bộ đối chiếu hóa đơn công ty A…" />
          </Field>
        </div>
      </Section>

      <Section title="Bảng dữ liệu" description="Số căn phải, chữ số cùng độ rộng; menu thao tác thay cho nút xóa đỏ.">
        <Table caption="Danh sách người dùng mẫu">
          <THead>
            <TR>
              <TH>Người dùng</TH>
              <TH>Vai trò</TH>
              <TH>Cập nhật</TH>
              <TH numeric>Giá trị</TH>
              <TH className="w-12">
                <span className="sr-only">Thao tác</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {[
              ['Chu Thanh Dũng (Kế toán viên)', 'Kế toán viên', 119240000],
              ['Trần Văn Minh', 'Kế toán trưởng', 41990400],
            ].map(([name, roleLabel, amount]) => (
              <TR key={name}>
                <TD>
                  <span className="flex items-center gap-3">
                    <Avatar name={name} />
                    <Tooltip content={name}>
                      <span className="max-w-[12rem] truncate font-medium">{name}</span>
                    </Tooltip>
                  </span>
                </TD>
                <TD>
                  <Badge tone="brand">{roleLabel}</Badge>
                </TD>
                <TD>{formatDateTime('2026-10-11 09:36:04')}</TD>
                <TD numeric>{formatVND(amount)}</TD>
                <TD>
                  <DropdownMenu
                    label={`Thao tác với ${name}`}
                    items={[
                      { key: 'edit', label: 'Chỉnh sửa', icon: Pencil, onSelect: () => toast.info('Chỉnh sửa') },
                      { key: 'delete', label: 'Xóa tài khoản', icon: Trash2, tone: 'danger', onSelect: () => setConfirmOpen(true) },
                    ]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="Hộp thoại và thông báo">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setModalOpen(true)}>Mở hộp thoại</Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Hộp xác nhận
          </Button>
          <Button onClick={() => toast.success('Đã lưu thay đổi.')}>Thông báo thành công</Button>
          <Button onClick={() => toast.error('Không thể xóa file này. Vui lòng thử lại.')}>Thông báo lỗi</Button>
          <Button onClick={() => toast.warning('Bộ đối soát còn thiếu GRN.')}>Cảnh báo</Button>
        </div>
      </Section>

      <Section title="Trạng thái rỗng">
        <EmptyState
          icon={Inbox}
          title="Chưa có bộ đối soát nào"
          description="Tải lên Đơn đặt hàng, Hóa đơn và Phiếu nhập kho để hệ thống bắt đầu đối soát."
          action={
            <Button variant="primary" leadingIcon={Upload}>
              Tải chứng từ
            </Button>
          }
        />
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Thông tin cá nhân"
        description="Quản lý hồ sơ và bảo mật tài khoản."
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Lưu
            </Button>
          </>
        }
      >
        <Field label="Họ và tên">
          <Input defaultValue="Trần Văn Minh" />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success('Đã xóa tài khoản.');
        }}
        title="Xóa tài khoản này?"
        description="Người dùng sẽ không thể đăng nhập nữa. Thao tác này không thể hoàn tác."
        confirmLabel="Xóa tài khoản"
        tone="danger"
      />
    </div>
  );
}
