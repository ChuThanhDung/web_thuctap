import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Check,
  CircleDollarSign,
  PackageCheck,
  Save,
} from 'lucide-react';
import { formatDateTime } from '../lib/format.js';
import { Badge, PageHeader } from '../ui/index.js';
import { repairVietnameseText } from '../text.js';
import { getCachedThresholds, getThresholds, updateThreshold } from '../services/thresholds.js';
import { useToast } from '../ui/Toast.jsx';

const RULE_META = [
  {
    key: 'amount',
    aliases: ['amount', 'price', 'money', 'default', 'khác', 'mặc định', 'đơn giá', 'tổng tiền', 'số tiền'],
    title: 'Ngưỡng chênh lệch Số tiền',
    shortTitle: 'Số tiền',
    subtitle: 'Áp cho thành tiền, tiền thuế, tổng tiền (lệch do làm tròn). Đơn giá luôn phải khớp tuyệt đối.',
    icon: CircleDollarSign,
    percentLabel: 'Ngưỡng % tối đa (0 = không xét)',
    absoluteLabel: 'Ngưỡng tuyệt đối tối đa',
    absoluteSuffix: 'VND',
    percentStep: '0.1',
    absoluteStep: '1000',
    tone: 'brand',
  },
  {
    key: 'quantity',
    aliases: ['quantity', 'qty', 'số lượng', 'so luong'],
    title: 'Ngưỡng chênh lệch Số lượng',
    shortTitle: 'Số lượng',
    subtitle: 'Dùng khi số lượng trên PO, hóa đơn và phiếu nhập kho chênh nhau. Đặt 0 nghĩa là số lượng phải khớp tuyệt đối.',
    icon: PackageCheck,
    percentLabel: 'Tỷ lệ thiếu/thừa cho phép (0 = không xét)',
    absoluteLabel: 'Số lượng tuyệt đối cho phép',
    absoluteSuffix: 'đơn vị',
    percentStep: '0.1',
    absoluteStep: '1',
    tone: 'brand',
  },
];

function normalizeText(value) {
  return String(repairVietnameseText(value) || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getRuleMeta(item) {
  const category = normalizeText(item?.category);
  return RULE_META.find((meta) => meta.aliases.some((alias) => category.includes(normalizeText(alias)))) || null;
}

function decimalValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPlainNumber(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(decimalValue(value));
}

function formatAbsoluteValue(value, meta) {
  return meta.key === 'amount' ? `${formatPlainNumber(value)} đ` : `${formatPlainNumber(value)} ${meta.absoluteSuffix}`;
}

function getToneClasses(tone) {
  if (tone === 'amber') {
    return {
      shell: 'border-line',
      icon: 'bg-tone-warning-bg text-tone-warning-fg ring-tone-warning-line',
      badge: 'bg-tone-warning-bg text-tone-warning-fg ring-tone-warning-line',
    };
  }

  if (tone === 'brand') {
    return {
      shell: 'border-line',
      icon: 'bg-tone-brand-bg text-tone-brand-fg ring-focus',
      badge: 'bg-tone-brand-bg text-tone-brand-fg ring-focus',
    };
  }

  return {
    shell: 'border-line',
    icon: 'bg-tone-success-bg text-tone-success-fg ring-tone-success-line',
    badge: 'bg-tone-success-bg text-tone-success-fg ring-tone-success-line',
  };
}

function RuleInput({ label, suffix, value, step, onChange, helper }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-fg-subtle">{label}</span>
      <div className="mt-2 flex min-h-12 items-center rounded-control border border-tone-neutral-line bg-surface shadow-card transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-focus">
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3.5 py-3 text-right text-base font-bold tabular-nums text-fg outline-none sm:text-sm"
        />
        <span className="flex h-12 min-w-20 items-center justify-center border-l border-line px-3 text-xs font-semibold text-fg-subtle">
          {suffix}
        </span>
      </div>
      {helper && <p className="mt-1.5 text-xs text-fg-subtle">{helper}</p>}
    </label>
  );
}

function RuleCard({
  item,
  meta,
  draft,
  saving,
  expanded,
  onToggleExpand,
  onCollapse,
  onDraftChange,
  onSave,
}) {
  const Icon = meta.icon;
  const tone = getToneClasses(meta.tone);
  const cardRef = useRef(null);
  const detailsRef = useRef(null);

  useEffect(() => {
    if (!expanded) return undefined;

    function handlePointerDown(event) {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        onCollapse();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [expanded, onCollapse]);

  useEffect(() => {
    if (!expanded || meta.key !== 'quantity') return;

    const scrollTimer = window.setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [expanded, meta.key]);

  return (
    <section ref={cardRef} className={`rounded-card border bg-surface shadow-card ${tone.shell}`}>
      <div className="p-5">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-control ring-1 ${tone.icon}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-fg sm:text-base">{meta.title}</h2>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-fg-muted">{meta.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-fg-muted shadow-card transition hover:bg-surface-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-focus"
                  aria-label={expanded ? 'Ẩn phần chỉnh sửa' : 'Mở phần chỉnh sửa'}
                  aria-expanded={expanded}
                >
                  <ChevronDown size={20} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          <dl className="mt-4 grid border-t border-line sm:grid-cols-2">
            <div className="py-3 sm:pr-4">
              <dt className="text-sm text-fg-muted">{meta.percentLabel}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-fg">{formatPlainNumber(item.percent_threshold)}%</dd>
            </div>
            <div className="border-t border-line py-3 sm:border-l sm:border-t-0 sm:pl-4">
              <dt className="text-sm text-fg-muted">{meta.absoluteLabel}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-fg">{formatAbsoluteValue(item.absolute_threshold, meta)}</dd>
            </div>
          </dl>

        </div>

        {expanded && (
        <div ref={detailsRef} className="mt-5 rounded-card border border-line bg-surface-muted p-4">
          <div className="grid gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-fg-subtle">Tên nhóm cấu hình</span>
              <input
                type="text"
                value={draft.category}
                onChange={(event) => onDraftChange(item.id, 'category', event.target.value)}
                className="input-field mt-2 bg-surface"
                placeholder="Ví dụ: Đơn giá & Tổng tiền"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <RuleInput
                label={meta.percentLabel}
                suffix="%"
                step={meta.percentStep}
                value={draft.percent_threshold}
                helper={meta.key === 'amount' ? 'Ví dụ: 1%' : 'Ví dụ: 2%'}
                onChange={(value) => onDraftChange(item.id, 'percent_threshold', value)}
              />
              <RuleInput
                label={meta.absoluteLabel}
                suffix={meta.absoluteSuffix}
                step={meta.absoluteStep}
                value={draft.absolute_threshold}
                helper={meta.key === 'amount' ? 'Ví dụ: 100.000 VND' : 'Ví dụ: 5 đơn vị'}
                onChange={(value) => onDraftChange(item.id, 'absolute_threshold', value)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-fg-subtle">Cập nhật: {formatDateTime(item.updated_at) || 'Chưa có'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onSave} disabled={saving} className="btn-primary w-full sm:min-w-32 sm:w-auto">
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-white" /> : <Save size={16} />}
                Lưu
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

    </section>
  );
}

export default function ThresholdConfig({ token }) {
  const toast = useToast();
  const cached = getCachedThresholds();
  const initialItems = Array.isArray(cached) ? cached : cached?.items || [];
  const [configs, setConfigs] = useState(() => initialItems);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      initialItems.map((item) => [
        item.id,
        {
          category: repairVietnameseText(item.category || ''),
          percent_threshold: String(item.percent_threshold ?? 0),
          absolute_threshold: String(item.absolute_threshold ?? 0),
        },
      ])
    )
  );
  const [loading, setLoading] = useState(() => !cached);
  const [savingId, setSavingId] = useState(null);
  const [expandedRuleId, setExpandedRuleId] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchConfigs() {
      try {
        if (!getCachedThresholds()) {
          setLoading(true);
        }
        setError('');
        const data = await getThresholds(token);
        const items = Array.isArray(data) ? data : data.items || [];
        if (!isMounted) return;
        setConfigs(items);
        setDrafts(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              {
                category: repairVietnameseText(item.category || ''),
                percent_threshold: String(item.percent_threshold ?? 0),
                absolute_threshold: String(item.absolute_threshold ?? 0),
              },
            ])
          )
        );
      } catch (err) {
        if (isMounted && !getCachedThresholds()) {
          setError(err.message || 'Không thể tải cấu hình ngưỡng.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchConfigs();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const groupedConfigs = useMemo(() => {
    const mapped = configs.map((item) => ({ item, meta: getRuleMeta(item) }));
    const focus = RULE_META.map((ruleMeta) => mapped.find(({ meta }) => meta?.key === ruleMeta.key)).filter(Boolean);
    return { focus };
  }, [configs]);

  function showSavedSignal() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function updateDraft(id, field, value) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  async function saveRule(item) {
    const draft = drafts[item.id];
    if (!draft) return;

    const category = draft.category.trim();
    if (!category) {
      toast.error('Vui lòng nhập tên quy tắc.');
      return;
    }

    try {
      setSavingId(item.id);
      const updated = await updateThreshold(token, item.id, {
        category,
        percent_threshold: decimalValue(draft.percent_threshold),
        absolute_threshold: decimalValue(draft.absolute_threshold),
      });
      setConfigs((current) => current.map((config) => (config.id === item.id ? updated : config)));
      setDrafts((current) => ({
        ...current,
        [item.id]: {
          category: repairVietnameseText(updated.category || ''),
          percent_threshold: String(updated.percent_threshold ?? 0),
          absolute_threshold: String(updated.absolute_threshold ?? 0),
        },
      }));
      showSavedSignal();
    } catch (err) {
      toast.error(err.message || 'Không thể lưu cấu hình.');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tone-brand-line border-t-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-tone-danger-line bg-tone-danger-bg px-5 py-4 text-sm font-medium text-tone-danger-fg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ngưỡng sai số"
        description="Mức chênh lệch được chấp nhận cho số tiền và số lượng. Chênh lệch trong ngưỡng được xếp “Lệch nhỏ”, vượt ngưỡng là “Lệch lớn”."
        actions={
          saved && (
            <Badge tone="success" icon={Check}>
              Đã lưu cấu hình
            </Badge>
          )
        }
      />

      <div className="rounded-card border border-line bg-surface-muted px-4 py-3 text-sm text-fg">
        <p className="font-medium">Quy tắc cố định, không cấu hình được</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-muted">
          <li>Mã số thuế, thuế suất VAT và đơn giá phải khớp tuyệt đối giữa các chứng từ.</li>
        </ul>
        <p className="mt-3 font-medium">Cấu hình được ở bên dưới</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-muted">
          <li>Số tiền (thành tiền, tiền thuế, tổng tiền): mặc định được lệch tối đa 1.000 đ do làm tròn.</li>
          <li>Số lượng: mặc định 0, tức phải khớp tuyệt đối.</li>
          <li>Ngưỡng % bằng 0 nghĩa là không xét theo phần trăm, chỉ xét theo số tuyệt đối.</li>
        </ul>
      </div>

      <div className="space-y-4">
        {groupedConfigs.focus.length === 0 && (
          <div className="rounded-card border border-dashed border-tone-neutral-line bg-surface px-5 py-8 text-center text-sm text-fg-subtle">
            Chưa có hai cấu hình chính. Hãy tạo nhóm “Đơn giá & Tổng tiền” và “Số lượng” ở phần bên dưới.
          </div>
        )}
        {groupedConfigs.focus.map(({ item, meta }) => (
          <RuleCard
            key={item.id}
            item={item}
            meta={meta}
            draft={drafts[item.id] || { category: repairVietnameseText(item.category || ''), percent_threshold: '0', absolute_threshold: '0' }}
            saving={savingId === item.id}
            expanded={expandedRuleId === item.id}
            onToggleExpand={() => setExpandedRuleId((current) => (current === item.id ? null : item.id))}
            onCollapse={() => setExpandedRuleId(null)}
            onDraftChange={updateDraft}
            onSave={() => saveRule(item)}
          />
        ))}
      </div>

    </div>
  );
}
