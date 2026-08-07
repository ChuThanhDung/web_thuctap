import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  ShoppingCart,
  PackageCheck,
  Info,
  MessageSquare,
} from 'lucide-react';
import StatusBadge, { RiskBadge } from '../components/StatusBadge.jsx';
import ConfidenceIndicator, { ConfidenceCell } from '../components/ConfidenceIndicator.jsx';
import { getReconciliationDetail as getReconciliation, decideCase } from '../services/reconciliations.js';
import { formatVND, formatNumber, formatDate } from '../text.js';

export default function CaseDetail({ token, role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError('');
        const data = await getReconciliation(token, id);
        setCaseData(data);
      } catch (err) {
        setError(err.message || 'Không thể tải chi tiết hồ sơ.');
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchData();
  }, [id, token]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"></div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText size={48} className="text-slate-300 mb-4" />
        <p className="text-slate-500 text-lg">{error || `Không tìm thấy case ${id}`}</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-4">
          <ArrowLeft size={16} /> Quay lại
        </button>
      </div>
    );
  }

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      await decideCase(token, id, { decision: 'approved' });
      setCaseData({ ...caseData, decision: 'approved' });
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      alert(err.message || 'Lỗi khi duyệt');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    try {
      setActionLoading(true);
      await decideCase(token, id, { decision: 'rejected', note: rejectReason });
      setCaseData({ ...caseData, decision: 'rejected', rejection_note: rejectReason });
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      alert(err.message || 'Lỗi khi từ chối');
    } finally {
      setActionLoading(false);
    }
  };

  const approved = caseData.decision === 'approved';
  const rejected = caseData.decision === 'rejected';
  
  const canMakeDecision = !caseData.decision;

  return (
    <div className="space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="mt-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">
                {caseData.invoice_number || caseData.case_number}
              </h1>
              <StatusBadge status={caseData.status} />
              <RiskBadge level={caseData.risk_level} />
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
              <span>{caseData.partner_name}</span>
              <span>·</span>
              <span>{formatDate(caseData.case_date)}</span>
              <span>·</span>
              <span className="font-medium text-slate-700">
                {formatVND(caseData.total_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Overall confidence */}
        {caseData.confidence !== null && (
          <div className="card-compact px-4 py-3 text-center shrink-0">
            <p className="text-xs text-slate-500 mb-1">Confidence tổng</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900">
                {Number(caseData.confidence)}%
              </span>
              <ConfidenceIndicator value={Number(caseData.confidence) / 100} />
            </div>
          </div>
        )}
      </div>

      {/* AI Note */}
      {caseData.ai_note && (
        <div className="flex gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <Info size={18} className="shrink-0 text-brand-600 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-brand-700 mb-1">Phân tích AI</p>
            <p className="text-sm text-brand-900">{caseData.ai_note}</p>
          </div>
        </div>
      )}

      {/* 3-Column Comparison */}
      {caseData.line_items && caseData.line_items.length > 0 ? (
        <>
          {/* Column Headers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card-compact flex items-center gap-2 px-4 py-3 bg-blue-50/50 border-blue-200">
              <FileText size={18} className="text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Hóa đơn</p>
                <p className="text-xs text-blue-600">{caseData.invoice_number}</p>
              </div>
            </div>
            <div className="card-compact flex items-center gap-2 px-4 py-3 bg-violet-50/50 border-violet-200">
              <ShoppingCart size={18} className="text-violet-600" />
              <div>
                <p className="text-sm font-semibold text-violet-900">Đơn đặt hàng (PO)</p>
                <p className="text-xs text-violet-600">{caseData.po_number}</p>
              </div>
            </div>
            <div className="card-compact flex items-center gap-2 px-4 py-3 bg-teal-50/50 border-teal-200">
              <PackageCheck size={18} className="text-teal-600" />
              <div>
                <p className="text-sm font-semibold text-teal-900">Phiếu nhập kho</p>
                <p className="text-xs text-teal-600">{caseData.grn_number}</p>
              </div>
            </div>
          </div>

          {/* Line Items — Row by Row Comparison */}
          {caseData.line_items.map((item) => {
            const qtyMismatch = Number(item.inv_qty) !== Number(item.grn_qty);
            const priceMismatch = Number(item.inv_unit_price) !== Number(item.po_unit_price);
            const hasDiff = qtyMismatch || priceMismatch || item.diff_type;

            return (
              <div key={item.id} className="space-y-2">
                {/* Item header */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-mono text-slate-400">
                    #{item.row_index}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {item.item_sku} — {item.item_name}
                  </span>
                  {hasDiff && (
                    <AlertTriangle size={14} className="text-rose-500" />
                  )}
                </div>

                {/* 3-column data grid */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Invoice */}
                  <ComparisonCard
                    qty={item.inv_qty}
                    unitPrice={item.inv_unit_price}
                    taxRate={item.vat_rate_pct || 0}
                    qtyHighlight={qtyMismatch}
                    priceHighlight={priceMismatch && item.inv_unit_price !== item.po_unit_price}
                  />
                  {/* PO */}
                  <ComparisonCard
                    qty={item.po_qty}
                    unitPrice={item.po_unit_price}
                    taxRate={item.vat_rate_pct || 0}
                    qtyHighlight={false}
                    priceHighlight={false}
                  />
                  {/* GRN */}
                  <ComparisonCard
                    qty={item.grn_qty}
                    unitPrice={item.inv_unit_price} // Usually GRN doesn't have price, display invoice price for calc
                    taxRate={item.vat_rate_pct || 0}
                    qtyHighlight={qtyMismatch}
                    priceHighlight={priceMismatch && item.inv_unit_price !== item.po_unit_price}
                  />
                </div>

                {/* Diff explanations */}
                {item.diff_note && (
                  <div
                    className={`ml-1 flex gap-2 rounded-lg p-3 text-sm ${
                      item.diff_type === 'major'
                        ? 'bg-rose-50 border border-rose-200 text-rose-800'
                        : item.diff_type === 'minor'
                          ? 'bg-amber-50 border border-amber-200 text-amber-800'
                          : 'bg-slate-50 border border-slate-200 text-slate-700'
                    }`}
                  >
                    <MessageSquare size={16} className="shrink-0 mt-0.5" />
                    <p>{item.diff_note}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Totals comparison */}
          {caseData.diff_amount && Number(caseData.diff_amount) > 0 && (
             <div className="mt-6 space-y-2">
               <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-rose-800">
                      Chênh lệch tổng: {formatVND(caseData.diff_amount)}
                    </p>
                    <p className="text-xs text-rose-700 mt-1">{caseData.ai_summary || 'Có sai lệch tổng tiền so với thực tế nhập.'}</p>
                  </div>
                </div>
             </div>
          )}
        </>
      ) : (
        /* Simple case without detailed comparison */
        <div className="card p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-emerald-500 mb-3" />
          <p className="text-lg font-semibold text-slate-900">
            {caseData.status === 'matched'
              ? 'Hóa đơn khớp hoàn toàn'
              : 'Chi tiết đối soát'}
          </p>
          <p className="text-sm text-slate-500 mt-1">Hóa đơn này không có danh sách chi tiết mặt hàng.</p>
        </div>
      )}

      {/* ── Sticky Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="text-sm text-slate-500">
            {approved ? (
              <span className="flex items-center gap-2 text-emerald-600 font-semibold">
                <CheckCircle size={18} /> Đã duyệt bởi {caseData.processed_by_name}
              </span>
            ) : rejected ? (
              <span className="flex items-center gap-2 text-rose-600 font-semibold">
                <XCircle size={18} /> Đã từ chối ({caseData.rejection_note})
              </span>
            ) : (
              <>
                Hành động cho <span className="font-medium text-slate-700">{caseData.invoice_number}</span>
              </>
            )}
          </div>

          {canMakeDecision && (
            <div className="flex items-center gap-3">
              {rejectMode ? (
                <>
                  <input
                    type="text"
                    placeholder="Nhập lý do từ chối..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="input-field w-72"
                    autoFocus
                    disabled={actionLoading}
                  />
                  <button
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || actionLoading}
                    className="btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle size={16} />
                    Xác nhận từ chối
                  </button>
                  <button
                    onClick={() => {
                      setRejectMode(false);
                      setRejectReason('');
                    }}
                    className="btn-ghost"
                    disabled={actionLoading}
                  >
                    Hủy
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setRejectMode(true)}
                    className="btn-secondary"
                    disabled={actionLoading}
                  >
                    <XCircle size={16} />
                    Từ chối
                  </button>
                  <button
                    onClick={handleApprove}
                    className="btn-primary"
                    disabled={actionLoading}
                  >
                    <CheckCircle size={16} />
                    Duyệt
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ComparisonCard({ qty, unitPrice, taxRate, qtyHighlight, priceHighlight }) {
  const lineTotal = Number(qty || 0) * Number(unitPrice || 0) * (1 + (Number(taxRate || 0) / 100));

  return (
    <div className="card-compact divide-y divide-slate-100 text-sm overflow-hidden">
      {/* Quantity */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${qtyHighlight ? 'diff-highlight' : ''}`}>
        <span className="text-slate-500">Số lượng</span>
        <span className={`font-medium ${qtyHighlight ? 'text-rose-700 font-bold' : 'text-slate-900'}`}>
          {formatNumber(qty)}
        </span>
      </div>

      {/* Unit Price */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${priceHighlight ? 'diff-highlight' : ''}`}>
        <span className="text-slate-500">Đơn giá</span>
        <span className={`font-medium ${priceHighlight ? 'text-rose-700 font-bold' : 'text-slate-900'}`}>
          {formatVND(unitPrice)}
        </span>
      </div>

      {/* Tax Rate */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-slate-500">Thuế VAT</span>
        <span className="font-medium text-slate-900">{taxRate}%</span>
      </div>

      {/* Line Total */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50/50">
        <span className="text-slate-500 font-medium">Thành tiền</span>
        <span className="font-semibold text-slate-900">
          {formatVND(lineTotal)}
        </span>
      </div>
    </div>
  );
}
