import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Check,
  CircleDollarSign,
  Info,
  PackageCheck,
  Save,
} from 'lucide-react';
import { formatDate, formatVND, repairVietnameseText } from '../text.js';
import { getCachedThresholds, getThresholds, updateThreshold } from '../services/thresholds.js';

const RULE_META = [
  {
    key: 'amount',
    aliases: ['amount', 'price', 'money', 'default', 'khác', 'mặc định', 'đơn giá', 'tổng tiền', 'số tiền'],
    title: 'Ngưỡng chênh lệch Số tiền / Đơn giá',
    shortTitle: 'Số tiền / Đơn giá',
    subtitle: 'Dùng khi hóa đơn lệch đơn giá, tổng tiền, tiền hàng hoặc làm tròn số.',
    icon: CircleDollarSign,
    percentLabel: 'Ngưỡng % tối đa',
    absoluteLabel: 'Ngưỡng tuyệt đối tối đa',
    absoluteSuffix: 'VND',
    percentStep: '0.1',
    absoluteStep: '1000',
    tone: 'emerald',
  },
  {
    key: 'quantity',
    aliases: ['quantity', 'qty', 'số lượng', 'so luong'],
    title: 'Ngưỡng chênh lệch Số lượng',
    shortTitle: 'Số lượng',
    subtitle: 'Dùng khi số lượng trên PO, hóa đơn và phiếu nhận hàng bị thiếu hoặc thừa.',
    icon: PackageCheck,
    percentLabel: 'Tỷ lệ thiếu/thừa cho phép',
    absoluteLabel: 'Số lượng tuyệt đối cho phép',
    absoluteSuffix: 'đơn vị',
    percentStep: '0.1',
    absoluteStep: '1',
    tone: 'emerald',
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
  return meta.key === 'amount' ? formatVND(value) : `${formatPlainNumber(value)} ${meta.absoluteSuffix}`;
}

function getToneClasses(tone) {
  if (tone === 'amber') {
    return {
      shell: 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20',
      icon: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
      badge: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900',
    };
  }

  if (tone === 'brand') {
    return {
      shell: 'border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/20',
      icon: 'bg-brand-100 text-brand-700 ring-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-900',
      badge: 'bg-brand-100 text-brand-800 ring-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-900',
    };
  }

  return {
    shell: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20',
    icon: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900',
  };
}

function RuleInput({ label, suffix, value, step, onChange, helper }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</span>
      <div className="mt-2 flex min-h-12 items-center rounded-lg border border-slate-300 bg-white shadow-sm transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950">
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3.5 py-3 text-right text-base font-bold tabular-nums text-slate-900 outline-none dark:text-slate-100 sm:text-sm"
        />
        <span className="flex h-12 min-w-20 items-center justify-center border-l border-slate-200 px-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {suffix}
        </span>
      </div>
      {helper && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{helper}</p>}
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
    <section ref={cardRef} className={`rounded-xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:bg-slate-900 ${tone.shell}`}>
      <div className="p-5">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ring-1 ${tone.icon}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{meta.title}</h2>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tone.badge}`}>
                      Đang áp dụng
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{meta.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={expanded ? 'Ẩn phần chỉnh sửa' : 'Mở phần chỉnh sửa'}
                  aria-expanded={expanded}
                >
                  <ChevronDown size={20} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Giá trị hiện tại</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatPlainNumber(item.percent_threshold)}%
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta.percentLabel}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Giá trị hiện tại</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatAbsoluteValue(item.absolute_threshold, meta)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta.absoluteLabel}</p>
            </div>
          </div>

        </div>

        {expanded && (
        <div ref={detailsRef} className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="grid gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Tên nhóm cấu hình</span>
              <input
                type="text"
                value={draft.category}
                onChange={(event) => onDraftChange(item.id, 'category', event.target.value)}
                className="input-field mt-2 bg-white dark:bg-slate-950"
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Cập nhật: {formatDate(item.updated_at) || 'Chưa có'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onSave} disabled={saving} className="btn-primary min-w-32">
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save size={16} />}
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
      alert('Vui lòng nhập tên quy tắc.');
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
      alert(err.message || 'Không thể lưu cấu hình.');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-300">Rule kế toán trưởng</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Cấu hình ngưỡng đối soát</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            Tập trung vào hai nhóm quan trọng nhất: số tiền/đơn giá và số lượng. Mỗi nhóm chỉ cần chỉnh hai giá trị, hệ thống sẽ dùng để phân loại xanh, vàng hoặc đỏ.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {saved && (
            <span className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
              <Check size={14} /> Đã lưu cấu hình
            </span>
          )}
          <span className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Info size={14} /> OR Rule
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {groupedConfigs.focus.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
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
