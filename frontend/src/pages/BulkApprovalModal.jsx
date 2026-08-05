import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, X, Shield } from 'lucide-react';
import { formatVND } from '../mockData.js';

export default function BulkApprovalModal({ cases, onConfirm, onCancel }) {
  const [confirmed, setConfirmed] = useState(false);
  const totalValue = cases.reduce((sum, c) => sum + c.totalAmount, 0);
  const hasRisky = cases.some((c) => c.status !== 'matched');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
              <Shield size={20} className="text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Xác nhận duyệt hàng loạt</h2>
              <p className="text-sm text-slate-500">Hành động này không thể hoàn tác</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{cases.length}</p>
              <p className="text-xs text-slate-500 mt-1">Hóa đơn được chọn</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-lg font-bold text-slate-900">{formatVND(totalValue)}</p>
              <p className="text-xs text-slate-500 mt-1">Tổng giá trị</p>
            </div>
          </div>

          {/* Warning for risky cases */}
          {hasRisky && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle size={20} className="shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Có hóa đơn chưa khớp hoàn toàn
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {cases.filter((c) => c.status !== 'matched').length} hóa đơn có chênh lệch
                  hoặc confidence thấp. Vui lòng xác nhận đã kiểm tra kỹ trước khi duyệt.
                </p>
              </div>
            </div>
          )}

          {/* Case list preview */}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Số HĐ</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Đối tác</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{c.invoiceNumber}</td>
                    <td className="px-3 py-2 text-slate-600 truncate max-w-[160px]">{c.partner}</td>
                    <td className="px-3 py-2 text-right text-slate-900 whitespace-nowrap">
                      {formatVND(c.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700">
              Tôi xác nhận đã kiểm tra {cases.length} hóa đơn trên và đồng ý duyệt
              với tổng giá trị {formatVND(totalValue)}.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onCancel} className="btn-secondary">
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle size={16} />
            Xác nhận duyệt {cases.length} hóa đơn
          </button>
        </div>
      </div>
    </div>
  );
}
