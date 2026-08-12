import React from 'react';
import { CheckCircle, X } from 'lucide-react';

/**
 * Thanh hành động nổi lên từ dưới khi có dòng được chọn.
 * Primary action cho batch operations.
 */
export default function FloatingActionBar({
  selectedCount,
  totalValue,
  onApprove,
  onClear,
  formatValue,
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="mx-auto max-w-5xl px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl ring-1 ring-black/5 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4">
          {/* Info */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <span className="text-sm font-bold">{selectedCount}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                Đã chọn {selectedCount} hóa đơn
              </p>
              {totalValue > 0 && (
                <p className="text-xs text-slate-500">
                  Tổng giá trị: {formatValue ? formatValue(totalValue) : totalValue}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <button
              onClick={onClear}
              className="btn-ghost"
            >
              <X size={16} />
              Bỏ chọn
            </button>
            <button
              onClick={onApprove}
              className="btn-primary"
            >
              <CheckCircle size={16} />
              Duyệt hàng loạt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
