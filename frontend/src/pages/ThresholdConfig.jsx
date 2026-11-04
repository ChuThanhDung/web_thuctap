import React, { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { formatDateTime, formatVND } from '../lib/format.js';
import { Button, Card, CardHeader, ConfirmDialog, Field, Input, PageHeader, useToast } from '../ui/index.js';
import { repairVietnameseText } from '../text.js';
import { getCachedThresholds, getThresholds, updateThreshold } from '../services/thresholds.js';

// Nhóm ngưỡng tiền (thành tiền, tiền thuế, tổng tiền). Số lượng không còn cấu hình được: luôn khớp tuyệt đối.
const AMOUNT_ALIASES = ['amount', 'price', 'money', 'default', 'khác', 'mặc định', 'đơn giá', 'tổng tiền', 'số tiền'];
// Mức làm tròn thông thường; cao hơn thì cảnh báo vì có thể che lệch thật.
const ROUNDING_HINT = 1000;

const FIXED_RULES = [
  'Mã số thuế và thuế suất VAT phải trùng nhau giữa các chứng từ.',
  'Đơn giá phải khớp tuyệt đối: là số đã thỏa thuận, không có làm tròn.',
  'Số lượng phải khớp tuyệt đối: là số đếm thật, lệch 1 đơn vị cũng là lệch lớn.',
];

function normalizeText(value) {
  return String(repairVietnameseText(value) || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function isAmountRule(item) {
  const category = normalizeText(item?.category);
  return AMOUNT_ALIASES.some((alias) => category.includes(normalizeText(alias)));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(toNumber(value))}%`;
}

export default function ThresholdConfig({ token }) {
  const toast = useToast();
  const cached = getCachedThresholds();
  const [configs, setConfigs] = useState(() => (Array.isArray(cached) ? cached : cached?.items || []));
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getThresholds(token)
      .then((data) => {
        if (!active) return;
        setConfigs(Array.isArray(data) ? data : data.items || []);
        setError('');
      })
      .catch((err) => {
        if (active && !getCachedThresholds()) setError(err.message || 'Không thể tải cấu hình ngưỡng.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const amountRule = useMemo(() => configs.find(isAmountRule) || null, [configs]);

  function startEdit() {
    setDraft({
      percent: String(amountRule.percent_threshold ?? 0),
      absolute: String(amountRule.absolute_threshold ?? 0),
    });
  }

  const draftAbsolute = draft ? toNumber(draft.absolute) : 0;
  const draftPercent = draft ? toNumber(draft.percent) : 0;
  const invalid = draft && (draftAbsolute < 0 || draftPercent < 0 || draftPercent > 100);
  const unchanged =
    draft && draftAbsolute === toNumber(amountRule?.absolute_threshold) && draftPercent === toNumber(amountRule?.percent_threshold);

  async function save() {
    setSaving(true);
    try {
      const updated = await updateThreshold(token, amountRule.id, {
        category: amountRule.category,
        percent_threshold: draftPercent,
        absolute_threshold: draftAbsolute,
      });
      setConfigs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDraft(null);
      toast.success('Đã lưu ngưỡng tiền. Áp dụng cho các lần đối soát từ bây giờ.');
    } catch (err) {
      toast.error(err.message || 'Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Đang tải">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tone-brand-line border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-card border border-tone-danger-line bg-tone-danger-bg px-5 py-4 text-sm font-medium text-tone-danger-fg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ngưỡng sai số"
        description="Chênh lệch tiền trong ngưỡng được xếp “Lệch nhỏ”, vượt ngưỡng là “Lệch lớn”. Các quy tắc còn lại cố định để kết quả luôn minh bạch."
      />

      <Card>
        <CardHeader title="Quy tắc cố định" description="Không cấu hình được, giống nhau ở mọi công ty." />
        <ul className="divide-y divide-line">
          {FIXED_RULES.map((rule) => (
            <li key={rule} className="flex items-start gap-3 px-5 py-3 text-sm text-fg">
              <Lock size={16} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              {rule}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Ngưỡng chênh lệch số tiền"
          description="Áp cho thành tiền, tiền thuế và tổng thanh toán, phần lệch do làm tròn. Mặc định tối đa 1.000 đ."
          action={!draft && amountRule && <Button onClick={startEdit}>Chỉnh sửa</Button>}
        />
        {!amountRule ? (
          <p className="px-5 py-4 text-sm text-fg-muted">Chưa có cấu hình ngưỡng tiền; hệ thống dùng mặc định 1.000 đ.</p>
        ) : !draft ? (
          <dl className="grid sm:grid-cols-2">
            <div className="px-5 py-4">
              <dt className="text-sm text-fg-muted">Lệch tuyệt đối tối đa</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-fg">{formatVND(amountRule.absolute_threshold)}</dd>
            </div>
            <div className="border-t border-line px-5 py-4 sm:border-l sm:border-t-0">
              <dt className="text-sm text-fg-muted">Lệch theo phần trăm tối đa</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-fg">
                {toNumber(amountRule.percent_threshold) ? formatPercent(amountRule.percent_threshold) : 'Không xét'}
              </dd>
            </div>
            <p className="px-5 pb-4 text-xs text-fg-subtle sm:col-span-2">Cập nhật: {formatDateTime(amountRule.updated_at) || 'Chưa có'}</p>
          </dl>
        ) : (
          <form
            className="space-y-4 px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!invalid && !unchanged) setConfirming(true);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Lệch tuyệt đối tối đa (đ)"
                hint={draftAbsolute > ROUNDING_HINT ? 'Cao hơn mức làm tròn thông thường (1.000 đ): có thể che mất chỗ lệch thật.' : 'Mặc định 1.000 đ.'}
              >
                <Input type="number" min="0" step="100" inputMode="numeric" value={draft.absolute} onChange={(event) => setDraft({ ...draft, absolute: event.target.value })} className="text-right tabular-nums" />
              </Field>
              <Field label="Lệch theo phần trăm tối đa (%)" hint="Để 0 nếu chỉ xét theo số đồng.">
                <Input type="number" min="0" max="100" step="0.1" value={draft.percent} onChange={(event) => setDraft({ ...draft, percent: event.target.value })} className="text-right tabular-nums" />
              </Field>
            </div>
            {invalid && <p role="alert" className="text-sm text-tone-danger-fg">Giá trị không hợp lệ: không âm, phần trăm tối đa 100.</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDraft(null)}>Hủy</Button>
              <Button type="submit" variant="primary" disabled={invalid || unchanged}>Lưu ngưỡng</Button>
            </div>
          </form>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={save}
        loading={saving}
        title="Đổi ngưỡng chênh lệch số tiền?"
        description={
          draft
            ? `Từ ${formatVND(amountRule?.absolute_threshold)} thành ${formatVND(draftAbsolute)}${draftPercent ? ` hoặc ${formatPercent(draftPercent)}` : ''}. Áp dụng cho các lần đối soát từ bây giờ, kể cả bộ đang chờ duyệt cấp 1 (được tính lại khi duyệt). Bộ đã duyệt giữ nguyên kết quả. Thay đổi được ghi vào nhật ký.`
            : ''
        }
        confirmLabel="Lưu ngưỡng"
      />
    </div>
  );
}
