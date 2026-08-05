import React, { useState } from 'react';
import { Save, Settings, Edit2, Check, X, Info } from 'lucide-react';
import { thresholdConfig, formatVND } from '../mockData.js';

export default function ThresholdConfig() {
  const [configs, setConfigs] = useState(thresholdConfig);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saved, setSaved] = useState(false);

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValues({
      percentThreshold: item.percentThreshold,
      absoluteThreshold: item.absoluteThreshold,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = (id) => {
    setConfigs((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              percentThreshold: parseFloat(editValues.percentThreshold) || c.percentThreshold,
              absoluteThreshold: parseInt(editValues.absoluteThreshold) || c.absoluteThreshold,
              lastUpdated: new Date().toISOString().split('T')[0],
              updatedBy: 'Nguyễn Thị Lan',
            }
          : c
      )
    );
    setEditingId(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cấu hình ngưỡng chênh lệch</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Thiết lập ngưỡng chênh lệch cho phép theo từng nhóm hàng hóa
          </p>
        </div>
        {saved && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 animate-fade-in">
            <Check size={14} /> Đã lưu
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <Info size={18} className="shrink-0 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Cách hoạt động</p>
          <p className="text-xs text-blue-700">
            Khi chênh lệch giữa hóa đơn và PO/phiếu nhập kho{' '}
            <strong>nằm trong ngưỡng cho phép</strong>, case sẽ được đánh dấu{' '}
            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              Chênh lệch nhẹ
            </span>{' '}
            (vàng) thay vì{' '}
            <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
              Cần xem xét
            </span>{' '}
            (đỏ). Chênh lệch được tính theo cả % và giá trị tuyệt đối — chỉ cần vượt 1 trong 2
            ngưỡng sẽ được escalate.
          </p>
        </div>
      </div>

      {/* Config table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Nhóm hàng hóa
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  Ngưỡng %
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  Ngưỡng tuyệt đối (VND)
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">
                  Cập nhật
                </th>
                <th className="w-20 px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {configs.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id} className="table-row-hover">
                    <td className="px-5 py-3">
                      <span className="font-medium text-slate-900">{item.category}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.5"
                          value={editValues.percentThreshold}
                          onChange={(e) =>
                            setEditValues((v) => ({ ...v, percentThreshold: e.target.value }))
                          }
                          className="input-field w-24 text-right ml-auto"
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono text-slate-900">{item.percentThreshold}%</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="1000000"
                          value={editValues.absoluteThreshold}
                          onChange={(e) =>
                            setEditValues((v) => ({ ...v, absoluteThreshold: e.target.value }))
                          }
                          className="input-field w-40 text-right ml-auto"
                        />
                      ) : (
                        <span className="font-mono text-slate-900">
                          {formatVND(item.absoluteThreshold)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {item.lastUpdated} · {item.updatedBy}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveEdit(item.id)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                            title="Lưu"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                            title="Hủy"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
