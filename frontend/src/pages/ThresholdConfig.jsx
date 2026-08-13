import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Info,
  PackageCheck,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { formatDate, formatVND } from '../text.js';
import { createThreshold, deleteThreshold, getThresholds, updateThreshold } from '../services/thresholds.js';

const RULE_META = [
  {
    key: 'amount',
    aliases: ['amount', 'price', 'money', 'default', 'khác', 'mặc định', 'đơn giá', 'tổng tiền', 'số tiền'],
    title: 'Chênh lệch Đơn giá & Tổng tiền',
    subtitle: 'Áp dụng cho sai lệch tiền hàng, đơn giá, tổng thanh toán hoặc làm tròn số.',
    icon: CircleDollarSign,
    percentLabel: 'Tỷ lệ lệch tối đa',
    absoluteLabel: 'Số tiền lệch tối đa',
    absoluteSuffix: 'VNĐ',
    percentStep: '0.1',
    absoluteStep: '1000',
    tone: 'emerald',
  },
  {
    key: 'quantity',
    aliases: ['quantity', 'qty', 'số lượng', 'so luong'],
    title: 'Chênh lệch Số lượng',
    subtitle: 'Áp dụng cho thiếu/thừa số lượng khi đối chiếu PO, Invoice và GRN.',
    icon: PackageCheck,
    percentLabel: 'Tỷ lệ lệch số lượng',
    absoluteLabel: 'Số lượng lệch tối đa',
    absoluteSuffix: 'đơn vị',
    percentStep: '0.1',
    absoluteStep: '1',
    tone: 'amber',
  },
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getRuleMeta(item, index) {
  const category = normalizeText(item?.category);
  const matchedMeta = RULE_META.find((meta) =>
    meta.aliases.some((alias) => category.includes(normalizeText(alias)))
  );
  return matchedMeta || RULE_META[index] || RULE_META[0];
}

function decimalValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPlainNumber(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(decimalValue(value));
}

function RuleInput({ label, suffix, value, step, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</span>
      <div className="mt-2 flex min-h-11 items-center rounded-lg border border-slate-300 bg-white shadow-sm transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950">
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3.5 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none dark:text-slate-100"
        />
        <span className="flex h-11 min-w-16 items-center justify-center border-l border-slate-200 px-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {suffix}
        </span>
      </div>
    </label>
  );
}

function RuleCard({ item, meta, draft, saving, deleting, onDraftChange, onSave, onDelete }) {
  const Icon = meta.icon;
  const toneClass =
    meta.tone === 'amber'
      ? 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900';

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-slate-800 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClass}`}>
            <Icon size={21} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{meta.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-primary w-full md:w-auto"
        >
          {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save size={16} />}
          Lưu nhóm này
        </button>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1fr_1.1fr]">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Tên quy tắc</span>
          <input
            type="text"
            value={draft.category}
            onChange={(event) => onDraftChange(item.id, 'category', event.target.value)}
            className="input-field mt-2"
            placeholder="Ví dụ: Đơn giá & Tổng tiền"
          />
        </label>
        <RuleInput
          label={meta.percentLabel}
          suffix="%"
          step={meta.percentStep}
          value={draft.percent_threshold}
          onChange={(value) => onDraftChange(item.id, 'percent_threshold', value)}
        />
        <RuleInput
          label={meta.absoluteLabel}
          suffix={meta.absoluteSuffix}
          step={meta.absoluteStep}
          value={draft.absolute_threshold}
          onChange={(value) => onDraftChange(item.id, 'absolute_threshold', value)}
        />
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Quy tắc phân loại</p>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
            Báo đỏ nếu vượt <strong>một trong hai</strong> ngưỡng. Nếu cả hai nằm trong giới hạn, hệ thống đánh dấu chênh lệch nhẹ.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Giá trị hiện tại: {formatPlainNumber(item.percent_threshold)}% · {meta.key === 'amount' ? formatVND(item.absolute_threshold) : `${formatPlainNumber(item.absolute_threshold)} ${meta.absoluteSuffix}`}</span>
        <div className="flex items-center gap-3">
          <span>Cập nhật: {formatDate(item.updated_at)}</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            <Trash2 size={14} /> Xóa
          </button>
        </div>
      </div>
    </section>
  );
}

export default function ThresholdConfig({ token }) {
  const [configs, setConfigs] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [newRule, setNewRule] = useState({
    category: '',
    percent_threshold: '1',
    absolute_threshold: '100000',
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchConfigs() {
      try {
        setLoading(true);
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
                category: item.category || '',
                percent_threshold: String(item.percent_threshold ?? 0),
                absolute_threshold: String(item.absolute_threshold ?? 0),
              },
            ])
          )
        );
      } catch (err) {
        if (isMounted) setError(err.message || 'Không thể tải cấu hình ngưỡng.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchConfigs();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const orderedConfigs = useMemo(
    () =>
      configs
        .map((item, index) => ({ item, meta: getRuleMeta(item, index) }))
        .sort((a, b) => RULE_META.findIndex((meta) => meta.key === a.meta.key) - RULE_META.findIndex((meta) => meta.key === b.meta.key)),
    [configs]
  );

  function updateDraft(id, field, value) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  async function addRule() {
    const category = newRule.category.trim();
    if (!category) {
      alert('Vui lòng nhập tên quy tắc.');
      return;
    }

    try {
      setCreating(true);
      const created = await createThreshold(token, {
        category,
        percent_threshold: decimalValue(newRule.percent_threshold),
        absolute_threshold: decimalValue(newRule.absolute_threshold),
      });
      setConfigs((current) => [...current, created]);
      setDrafts((current) => ({
        ...current,
        [created.id]: {
          category: created.category || '',
          percent_threshold: String(created.percent_threshold ?? 0),
          absolute_threshold: String(created.absolute_threshold ?? 0),
        },
      }));
      setNewRule({ category: '', percent_threshold: '1', absolute_threshold: '100000' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      alert(err.message || 'Không thể tạo quy tắc.');
    } finally {
      setCreating(false);
    }
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
          category: updated.category || '',
          percent_threshold: String(updated.percent_threshold ?? 0),
          absolute_threshold: String(updated.absolute_threshold ?? 0),
        },
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      alert(err.message || 'Không thể lưu cấu hình.');
    } finally {
      setSavingId(null);
    }
  }

  async function removeRule(item) {
    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa quy tắc "${item.category}" không?`);
    if (!confirmed) return;

    try {
      setDeletingId(item.id);
      await deleteThreshold(token, item.id);
      setConfigs((current) => current.filter((config) => config.id !== item.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      alert(err.message || 'Không thể xóa quy tắc.');
    } finally {
      setDeletingId(null);
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Cấu hình Business Rules</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Thiết lập dung sai để AI phân loại sai lệch thành khớp, chênh lệch nhẹ hoặc cần xem xét.
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            <Check size={14} /> Đã lưu cấu hình
          </span>
        )}
      </div>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
            <BadgeCheck size={18} /> Green
          </div>
          <p className="mt-2 text-sm text-emerald-800/80 dark:text-emerald-200/80">Khớp 100%, không có sai lệch.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
            <AlertTriangle size={18} /> Yellow
          </div>
          <p className="mt-2 text-sm text-amber-800/80 dark:text-amber-200/80">Có lệch nhưng vẫn nằm trong ngưỡng cho phép.</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-800 dark:text-rose-300">
            <ShieldAlert size={18} /> Red
          </div>
          <p className="mt-2 text-sm text-rose-800/80 dark:text-rose-200/80">Vượt ngưỡng, cần kiểm tra và xử lý lại.</p>
        </div>
      </section>

      <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950/30 dark:text-brand-200">
        <div className="flex gap-3">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            Hệ thống dùng quy tắc OR: nếu lệch vượt ngưỡng tuyệt đối hoặc vượt ngưỡng phần trăm thì chuyển sang Red. Chỉ khi cả hai cùng nằm trong giới hạn mới là Yellow.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Quy tắc dung sai</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Thêm, sửa hoặc xóa các ngưỡng AI dùng để phân loại sai lệch.</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Tên quy tắc</span>
            <input
              type="text"
              value={newRule.category}
              onChange={(event) => setNewRule((current) => ({ ...current, category: event.target.value }))}
              className="input-field mt-2"
              placeholder="Ví dụ: Chi phí vận chuyển"
            />
          </label>
          <RuleInput
            label="Ngưỡng phần trăm"
            suffix="%"
            step="0.1"
            value={newRule.percent_threshold}
            onChange={(value) => setNewRule((current) => ({ ...current, percent_threshold: value }))}
          />
          <RuleInput
            label="Ngưỡng tuyệt đối"
            suffix="VNĐ / đơn vị"
            step="1000"
            value={newRule.absolute_threshold}
            onChange={(value) => setNewRule((current) => ({ ...current, absolute_threshold: value }))}
          />
          <button type="button" onClick={addRule} disabled={creating} className="btn-primary w-full lg:w-auto">
            {creating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Plus size={16} />}
            Thêm
          </button>
        </div>
      </section>

      <div className="space-y-4">
        {orderedConfigs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Chưa có quy tắc dung sai nào. Hãy thêm quy tắc đầu tiên ở phía trên.
          </div>
        )}
        {orderedConfigs.map(({ item, meta }) => (
          <RuleCard
            key={item.id}
            item={item}
            meta={meta}
            draft={drafts[item.id] || { category: item.category || '', percent_threshold: '0', absolute_threshold: '0' }}
            saving={savingId === item.id}
            deleting={deletingId === item.id}
            onDraftChange={updateDraft}
            onSave={() => saveRule(item)}
            onDelete={() => removeRule(item)}
          />
        ))}
      </div>

    </div>
  );
}
