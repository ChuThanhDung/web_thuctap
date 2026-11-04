import React from 'react';
import { Files } from 'lucide-react';
import { cn } from '../ui/index.js';

const SIZES = {
  sm: ['h-8 w-8', 18],
  md: ['h-9 w-9', 20],
  lg: ['h-11 w-11', 22],
};

/** Logo DocuSync AI: biểu tượng xấp chứng từ trên ô màu đồng (seal brass). Dùng chung cho mọi trang. */
export default function BrandMark({ size = 'sm', className }) {
  const [box, icon] = SIZES[size];
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-control bg-sidebar-accent text-sidebar', box, className)} aria-hidden="true">
      <Files size={icon} />
    </span>
  );
}
