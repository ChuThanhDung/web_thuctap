import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Search, ShieldOff } from 'lucide-react';
import { getAdminOrganization, getAdminOrganizations, getAdminOverview, updateAdminOrganization } from '../api.js';
import { vi } from '../i18n/vi.js';
import SummaryLine from '../components/overview/SummaryLine.jsx';
import { formatDate, formatDateTime, formatVND } from '../lib/format.js';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '../ui/index.js';

const PLAN_OPTIONS = ['free', 'pro', 'ultra'].map((value) => ({ value, label: vi.plans[value] }));
const PLAN_TONE = { free: 'neutral', pro: 'brand', ultra: 'info' };
const PLAN_DAYS_OPTIONS = [
  { value: '', label: 'Không thời hạn' },
  { value: '30', label: '30 ngày' },
  { value: '365', label: '365 ngày' },
];

function inTrial(organization) {
  return organization.trial_ends_at && new Date(organization.trial_ends_at) > new Date();
}

function PlanBadge({ organization }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={PLAN_TONE[organization.effective_plan]} size="sm">
        {vi.plans[organization.effective_plan]}
      </Badge>
      {inTrial(organization) && organization.plan !== organization.effective_plan && (
        <span className="text-xs text-fg-muted">dùng thử đến {formatDate(organization.trial_ends_at)}</span>
      )}
    </span>
  );
}

function StatusBadge({ status, deletionScheduledFor }) {
  if (status === 'deleted') return <Badge tone="neutral" size="sm">Đã xóa</Badge>;
  if (status !== 'active') return <Badge tone="danger" size="sm" icon={ShieldOff}>Tạm khóa</Badge>;
  if (deletionScheduledFor) return <Badge tone="danger" size="sm">Xóa ngày {formatDate(deletionScheduledFor)}</Badge>;
  return <Badge tone="success" size="sm">Hoạt động</Badge>;
}

function OrganizationModal({ token, organizationId, onClose, onChanged }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [plan, setPlan] = useState('free');
  const [planDays, setPlanDays] = useState('');
  const [saving, setSaving] = useState('');
  const [confirmStatus, setConfirmStatus] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setDetail(null);
    getAdminOrganization(token, organizationId)
      .then((result) => {
        setDetail(result);
        setPlan(result.plan);
      })
      .catch((err) => toast.error(err.message));
  }, [token, organizationId, toast]);

  async function apply(changes, key, message) {
    setSaving(key);
    try {
      const result = await updateAdminOrganization(token, organizationId, changes);
      setDetail(result);
      setPlan(result.plan);
      setPlanDays('');
      onChanged();
      toast.success(message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving('');
      setConfirmStatus(false);
    }
  }

  const suspended = detail?.status === 'suspended';

  return (
    <>
      <Modal open={Boolean(organizationId)} onClose={onClose} title={detail?.name ?? vi.common.loading} size="lg">
        {!detail ? (
          <p className="text-sm text-fg-muted">{vi.common.loading}</p>
        ) : (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-fg-muted">Mã số thuế</dt>
                <dd className="font-medium tabular-nums">{detail.tax_id || 'Chưa có'}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Ngày đăng ký</dt>
                <dd className="font-medium">{formatDate(detail.created_at)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Trạng thái</dt>
                <dd><StatusBadge status={detail.status} deletionScheduledFor={detail.deletion_scheduled_for} /></dd>
              </div>
              <div>
                <dt className="text-fg-muted">Gói đang dùng</dt>
                <dd><PlanBadge organization={detail} /></dd>
              </div>
              <div>
                <dt className="text-fg-muted">Gói trả phí hết hạn</dt>
                <dd className="font-medium">{detail.plan === 'free' ? 'Không áp dụng' : detail.plan_expires_at ? formatDate(detail.plan_expires_at) : 'Không thời hạn'}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Bộ tháng này / tổng</dt>
                <dd className="font-medium tabular-nums">{detail.batches_this_month} / {detail.batch_count}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">File tải lên tháng này</dt>
                <dd className="font-medium tabular-nums">{detail.files_this_month}</dd>
              </div>
            </dl>

            <section aria-labelledby="org-plan" className="space-y-3 rounded-card border border-line p-4">
              <h3 id="org-plan" className="text-sm font-semibold text-fg">Gói và dùng thử</h3>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="sm:w-48">
                  <span className="mb-1.5 block text-xs font-medium text-fg-muted">Gói đã trả tiền</span>
                  <Select value={plan} onChange={setPlan} options={PLAN_OPTIONS} aria-label="Gói đã trả tiền" />
                </div>
                {plan !== 'free' && (
                  <div className="sm:w-44">
                    <span className="mb-1.5 block text-xs font-medium text-fg-muted">Thời hạn</span>
                    <Select value={planDays} onChange={setPlanDays} options={PLAN_DAYS_OPTIONS} aria-label="Thời hạn gói" />
                  </div>
                )}
                <Button
                  variant="primary"
                  loading={saving === 'plan'}
                  disabled={plan === detail.plan && !planDays}
                  onClick={() =>
                    apply(
                      { plan, ...(planDays && plan !== 'free' ? { plan_days: Number(planDays) } : {}) },
                      'plan',
                      `Đã cấp gói ${vi.plans[plan]}${planDays && plan !== 'free' ? ` ${planDays} ngày` : ''}.`,
                    )
                  }
                >
                  Lưu gói
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={saving === 'trial'} onClick={() => apply({ trial_days: 14 }, 'trial', 'Đã gia hạn dùng thử 14 ngày.')}>
                  Dùng thử Pro thêm 14 ngày
                </Button>
                {inTrial(detail) && (
                  <Button size="sm" variant="ghost" loading={saving === 'end'} onClick={() => apply({ trial_days: 0 }, 'end', 'Đã kết thúc dùng thử.')}>
                    Kết thúc dùng thử
                  </Button>
                )}
              </div>
            </section>

            <section aria-labelledby="org-users">
              <h3 id="org-users" className="mb-2 text-sm font-semibold text-fg">Tài khoản ({detail.users.length})</h3>
              <Table caption="Tài khoản của công ty">
                <THead>
                  <tr>
                    <TH>Họ tên</TH>
                    <TH>Email</TH>
                    <TH>Vai trò</TH>
                    <TH>Đăng nhập gần nhất</TH>
                  </tr>
                </THead>
                <TBody>
                  {detail.users.map((user) => (
                    <TR key={user.id}>
                      <TD>{user.full_name}</TD>
                      <TD className="break-all">{user.email}</TD>
                      <TD>{vi.roles[user.role] ?? user.role}{user.status !== 'ACTIVE' && ' (ngưng)'}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">{user.last_login_at ? formatDateTime(user.last_login_at) : 'Chưa đăng nhập'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </section>

            <div className="flex justify-end border-t border-line pt-4">
              <Button variant={suspended ? 'primary' : 'danger'} onClick={() => setConfirmStatus(true)}>
                {suspended ? 'Mở khóa công ty' : 'Tạm khóa công ty'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmStatus}
        onClose={() => setConfirmStatus(false)}
        loading={saving === 'status'}
        tone={suspended ? 'primary' : 'danger'}
        title={suspended ? 'Mở khóa công ty?' : 'Tạm khóa công ty?'}
        description={
          suspended
            ? 'Người dùng của công ty đăng nhập và làm việc lại bình thường.'
            : 'Mọi người dùng của công ty bị đăng xuất và không đăng nhập được cho tới khi mở khóa. Dữ liệu vẫn giữ nguyên.'
        }
        confirmLabel={suspended ? 'Mở khóa' : 'Tạm khóa'}
        onConfirm={() =>
          apply(
            { status: suspended ? 'active' : 'suspended' },
            'status',
            suspended ? 'Đã mở khóa công ty.' : 'Đã tạm khóa công ty.',
          )
        }
      />
    </>
  );
}

export default function AdminConsole({ token }) {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(
    async (query = '') => {
      try {
        const [nextOverview, list] = await Promise.all([getAdminOverview(token), getAdminOrganizations(token, query)]);
        setOverview(nextOverview);
        setOrganizations(list.items);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [token, toast],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => load(search), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Công ty khách hàng"
        description="Gói dịch vụ, mức sử dụng và trạng thái của từng công ty. Trang này không hiển thị chứng từ của khách."
      />

      {overview && (
        <SummaryLine
          label="Tổng quan nền tảng"
          items={[
            {
              label: 'Doanh thu tháng này',
              value: formatVND(overview.revenue_this_month),
              hint: `Tổng ${formatVND(overview.revenue_total)}`,
              lead: true,
            },
            {
              label: 'Công ty',
              value: overview.organizations,
              hint: `${overview.suspended_organizations} tạm khóa · ${overview.signups_last_30_days} mới trong 30 ngày`,
            },
            {
              label: 'Đang dùng thử',
              value: overview.in_trial,
              hint: `Free ${overview.by_plan.free ?? 0} · Pro ${overview.by_plan.pro ?? 0} · Ultra ${overview.by_plan.ultra ?? 0}`,
            },
            { label: 'Người dùng', value: overview.users },
            { label: 'Bộ đối soát tháng này', value: overview.batches_this_month, hint: `${overview.files_this_month} file tải lên` },
          ]}
        />
      )}

      <Card>
        <div className="border-b border-line p-3 lg:p-4">
          <label className="relative block max-w-md">
            <span className="sr-only">Tìm công ty</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên công ty, mã số thuế, email"
              className="input-field pl-9"
            />
          </label>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-fg-muted">{vi.common.loading}</p>
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={search ? 'Không có công ty khớp' : 'Chưa có công ty nào'}
            description={search ? 'Thử tìm bằng tên khác, mã số thuế hoặc email kế toán trưởng.' : 'Công ty tự đăng ký sẽ xuất hiện ở đây.'}
          />
        ) : (
          <Table caption="Danh sách công ty khách hàng">
            <THead>
              <tr>
                <TH>Công ty</TH>
                <TH>Gói</TH>
                <TH numeric>Người dùng</TH>
                <TH numeric>Bộ tháng này</TH>
                <TH>Hoạt động gần nhất</TH>
                <TH>Trạng thái</TH>
              </tr>
            </THead>
            <TBody>
              {organizations.map((organization) => (
                <TR
                  key={organization.id}
                  interactive
                  tabIndex={0}
                  onClick={() => setSelectedId(organization.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(organization.id);
                    }
                  }}
                >
                  <TD>
                    <span className="block font-medium">{organization.name}</span>
                    <span className="block text-xs text-fg-muted">
                      {[organization.tax_id, organization.owner_email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ'}
                    </span>
                  </TD>
                  <TD><PlanBadge organization={organization} /></TD>
                  <TD numeric>{organization.user_count}</TD>
                  <TD numeric>{organization.batches_this_month}</TD>
                  <TD className="whitespace-nowrap text-fg-muted">
                    {organization.last_activity_at ? formatDate(organization.last_activity_at) : 'Chưa dùng'}
                  </TD>
                  <TD><StatusBadge status={organization.status} deletionScheduledFor={organization.deletion_scheduled_for} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <OrganizationModal
        token={token}
        organizationId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={() => load(search)}
      />
    </div>
  );
}
