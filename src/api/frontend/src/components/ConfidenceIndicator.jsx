import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

/**
 * Hiển thị chỉ báo confidence bên cạnh trường dữ liệu.
 * - ≥ 0.90: xanh lá, check icon
 * - 0.70–0.89: cam, question icon
 * - < 0.70: đỏ, warning icon + nền khác biệt
 */
export default function ConfidenceIndicator({ value, showLabel = false }) {
  const percent = Math.round(value * 100);

  if (value >= 0.9) {
    return (
      <span
        className="inline-flex items-center gap-1 text-emerald-600"
        title={`Confidence: ${percent}%`}
      >
        <CheckCircle2 size={14} className="shrink-0" />
        {showLabel && <span className="text-[11px] font-medium">{percent}%</span>}
      </span>
    );
  }

  if (value >= 0.7) {
    return (
      <span
        className="inline-flex items-center gap-1 text-amber-600"
        title={`Confidence: ${percent}% — cần kiểm tra`}
      >
        <HelpCircle size={14} className="shrink-0" />
        {showLabel && <span className="text-[11px] font-medium">{percent}%</span>}
      </span>
    );
  }

  // Low confidence — visually distinct
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-rose-600 animate-pulse-subtle"
      title={`Confidence: ${percent}% — RỦI RO: dữ liệu có thể không chính xác`}
    >
      <AlertTriangle size={14} className="shrink-0" />
      {showLabel && (
        <span className="text-[11px] font-bold">{percent}%</span>
      )}
    </span>
  );
}

/**
 * Wrapper — áp dụng confidence styling cho toàn bộ cell content.
 * Dữ liệu confidence thấp sẽ có style khác hẳn dữ liệu chắc chắn.
 */
export function ConfidenceCell({ confidence, children }) {
  const cls =
    confidence >= 0.9
      ? '' // normal
      : confidence >= 0.7
        ? 'text-amber-900 bg-amber-50/50 rounded px-1'
        : 'text-rose-900 bg-rose-50 rounded px-1 italic opacity-80 border border-dashed border-rose-200';

  return (
    <span className={`inline-flex items-center gap-1.5 ${cls}`}>
      {children}
      <ConfidenceIndicator value={confidence} />
    </span>
  );
}
