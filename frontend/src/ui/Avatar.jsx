import React from 'react';
import { getDisplayName, getInitials } from '../lib/people.js';
import { cn } from './cn.js';

const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

const TONES = [
  'bg-tone-brand-bg text-tone-brand-fg',
  'bg-tone-info-bg text-tone-info-fg',
  'bg-tone-success-bg text-tone-success-fg',
  'bg-tone-warning-bg text-tone-warning-fg',
  'bg-tone-neutral-bg text-tone-neutral-fg',
];

function toneFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/**
 * Ảnh đại diện: dùng ảnh nếu có, ngược lại hiện chữ viết tắt lấy từ họ tên thật
 * (phần vai trò trong ngoặc không tính). Màu nền cố định theo tên.
 */
export default function Avatar({ name, src, size = 'md', className }) {
  const displayName = getDisplayName(name);

  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} />;
  }

  return (
    <span
      role="img"
      aria-label={displayName || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        SIZES[size],
        toneFor(displayName),
        className,
      )}
    >
      <span aria-hidden="true">{getInitials(name)}</span>
    </span>
  );
}
