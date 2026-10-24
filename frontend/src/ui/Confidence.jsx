import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { formatPercent } from '../lib/format.js';
import Badge from './Badge.jsx';

export const CONFIDENCE_HIGH = 0.9;
export const CONFIDENCE_MEDIUM = 0.7;

/** Mức tin cậy theo ngưỡng: >= 0,9 cao; 0,7–0,9 cần kiểm tra; dưới 0,7 thấp. Nhận thang 0–1 hoặc 0–100. */
export function getConfidenceLevel(value) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(number)) return null;
  const normalized = number > 1 ? number / 100 : number;
  if (normalized >= CONFIDENCE_HIGH) return 'high';
  if (normalized >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}

const LEVELS = {
  high: { tone: 'success', icon: CheckCircle2, label: 'Tin cậy cao' },
  medium: { tone: 'warning', icon: HelpCircle, label: 'Cần kiểm tra' },
  low: { tone: 'danger', icon: AlertTriangle, label: 'Tin cậy thấp' },
};

/**
 * Độ tin cậy AI của một chứng từ (API hiện chỉ trả độ tin cậy theo từng file, không theo từng trường).
 * Luôn có icon + chữ + phần trăm; không có giá trị thì không hiển thị gì.
 */
export default function Confidence({ value, size = 'sm', className }) {
  const level = getConfidenceLevel(value);
  if (!level) return null;

  const { tone, icon, label } = LEVELS[level];
  return (
    <Badge tone={tone} icon={icon} size={size} className={className}>
      {label} · {formatPercent(value)}
    </Badge>
  );
}
