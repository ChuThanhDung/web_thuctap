import React, { useState } from 'react';
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
import StatusBadge, { RiskBadge } from '../components/StatusBadge';
import ConfidenceIndicator, { ConfidenceCell } from '../components/ConfidenceIndicator';
import {
  caseDetails,
  reconciliationCases,
  formatVND,
  formatNumber,
  formatDate,
} from '../mockData';

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approved, setApproved] = useState(false);

  // Lấy thông tin tổng quan từ danh sách
  const caseSummary = reconciliationCases.find((c) => c.id === id);
  // Lấy chi tiết 3-way comparison
  const detail = caseDetails[id];

  if (!caseSummary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText size={48} className="text-slate-300 mb-4" />
        <p className="text-slate-500 text-lg">Không tìm thấy case {id}</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-4">
          <ArrowLeft size={16} /> Quay lại
        </button>
      </div>
    );
  }

  const handleApprove = () => {
    setApproved(true);
    setTimeout(() => {
      alert('Đã duyệt hóa đơn ' + caseSummary.invoiceNumber);
      navigate('/');
    }, 600);
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    alert(`Từ chối ${caseSummary.invoiceNumber}.\nLý do: ${rejectReason}`);
    navigate('/');
  };

  // Nếu không có chi tiết 3-way (case đơn giản), hiển thị summary
  const hasDetail = !!detail;

  return (
    <div className="space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/')}
            className="mt-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">
                {caseSummary.invoiceNumber}
              </h1>
              <StatusBadge status={caseSummary.status} />
              <RiskBadge level={caseSummary.riskLevel} />
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
              <span>{caseSummary.partner}</span>
              <span>·</span>
              <span>{formatDate(caseSummary.date)}</span>
              <span>·</span>
              <span className="font-medium text-slate-700">
                {formatVND(caseSummary.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Overall confidence */}
        {hasDetail && (
          <div className="card-compact px-4 py-3 text-center shrink-0">
            <p className="text-xs text-slate-500 mb-1">Confidence tổng</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900">
                {Math.round(detail.overallConfidence * 100)}%
              </span>
              <ConfidenceIndicator value={detail.overallConfidence} />
            </div>
          </div>
        )}
      </div>

      {/* AI Note */}
      <div className="flex gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <Info size={18} className="shrink-0 text-brand-600 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-brand-700 mb-1">Phân tích AI</p>
          <p className="text-sm text-brand-900">{caseSummary.aiNote}</p>
        </div>
      </div>

      {/* 3-Column Comparison */}
      {hasDetail ? (
        <>
          {/* Column Headers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card-compact flex items-center gap-2 px-4 py-3 bg-blue-50/50 border-blue-200">
              <FileText size={18} className="text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Hóa đơn</p>
                <p className="text-xs text-blue-600">{detail.invoiceNumber}</p>
              </div>
            </div>
            <div className="card-compact flex items-center gap-2 px-4 py-3 bg-violet-50/50 border-violet-200">
              <ShoppingCart size={18} className="text-violet-600" />
              <div>
                <p className="text-sm font-semibold text-violet-900">Đơn đặt hàng (PO)</p>
                <p className="text-xs text-violet-600">{detail.poNumber}</p>
              </div>
            </div>
            <div className="card-compact flex items-center gap-2 px-4 py-3 bg-teal-50/50 border-teal-200">
              <PackageCheck size={18} className="text-teal-600" />
              <div>
                <p className="text-sm font-semibold text-teal-900">Phiếu nhập kho</p>
                <p className="text-xs text-teal-600">{detail.grnNumber}</p>
              </div>
            </div>
          </div>

          {/* Line Items — Row by Row Comparison */}
          {detail.lineItems.map((item) => {
            const hasDiff = item.diffs.length > 0;
            const qtyMismatch = item.diffs.some((d) => d.field === 'qty');
            const priceMismatch = item.diffs.some((d) => d.field === 'unitPrice');
            const hasLowConf = item.diffs.some((d) => d.type === 'low_confidence');

            return (
              <div key={item.rowId} className="space-y-2">
                {/* Item header */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-mono text-slate-400">
                    #{item.rowId}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {item.itemCode} — {item.itemName}
                  </span>
                  {hasDiff && (
                    <AlertTriangle size={14} className="text-rose-500" />
                  )}
                </div>

                {/* 3-column data grid */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Invoice */}
                  <ComparisonCard
                    data={item.invoice}
                    qtyHighlight={qtyMismatch && item.invoice.qty !== item.grn.qty}
                    priceHighlight={priceMismatch && item.invoice.unitPrice !== item.po.unitPrice}
                    isLowConf={hasLowConf}
                    label="invoice"
                  />
                  {/* PO */}
                  <ComparisonCard
                    data={item.po}
                    qtyHighlight={false}
                    priceHighlight={false}
                    isLowConf={false}
                    label="po"
                  />
                  {/* GRN */}
                  <ComparisonCard
                    data={item.grn}
                    qtyHighlight={qtyMismatch && item.invoice.qty !== item.grn.qty}
                    priceHighlight={priceMismatch && item.grn.unitPrice !== item.invoice.unitPrice}
                    isLowConf={hasLowConf}
                    label="grn"
                  />
                </div>

                {/* Diff explanations — positioned right next to the highlight */}
                {item.diffs.map((diff, idx) => (
                  <div
                    key={idx}
                    className={`ml-1 flex gap-2 rounded-lg p-3 text-sm ${
                      diff.severity === 'high'
                        ? 'bg-rose-50 border border-rose-200 text-rose-800'
                        : diff.severity === 'medium'
                          ? 'bg-amber-50 border border-amber-200 text-amber-800'
                          : 'bg-slate-50 border border-slate-200 text-slate-700'
                    }`}
                  >
                    <MessageSquare size={16} className="shrink-0 mt-0.5" />
                    <p>{diff.description}</p>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Totals comparison */}
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 px-1">Tổng hợp</h3>
            <div className="grid grid-cols-3 gap-3">
              <TotalCard
                label="Hóa đơn"
                totals={detail.totals.invoice}
                highlight={detail.totalDiff.amount > 0}
              />
              <TotalCard
                label="Đơn đặt hàng"
                totals={detail.totals.po}
                highlight={false}
              />
              <TotalCard
                label="Phiếu nhập kho"
                totals={detail.totals.grn}
                highlight={detail.totalDiff.amount > 0}
              />
            </div>

            {/* Total diff summary */}
            {detail.totalDiff.amount > 0 && (
              <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-rose-800">
                    Chênh lệch: {formatVND(detail.totalDiff.amount)} ({detail.totalDiff.percentage}%)
                  </p>
                  <p className="text-xs text-rose-700 mt-1">{detail.totalDiff.description}</p>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Simple case without detailed comparison */
        <div className="card p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-emerald-500 mb-3" />
          <p className="text-lg font-semibold text-slate-900">
            {caseSummary.status === 'matched'
              ? 'Hóa đơn khớp hoàn toàn'
              : 'Chi tiết đối soát'}
          </p>
          <p className="text-sm text-slate-500 mt-1">{caseSummary.aiNote}</p>
          <p className="text-xs text-slate-400 mt-3">
            (Dữ liệu chi tiết 3 cột chỉ có cho case RC-003 và RC-007 trong bản demo)
          </p>
        </div>
      )}

      {/* ── Sticky Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="text-sm text-slate-500">
            {approved ? (
              <span className="flex items-center gap-2 text-emerald-600 font-semibold">
                <CheckCircle size={18} /> Đã duyệt
              </span>
            ) : (
              <>
                Hành động cho <span className="font-medium text-slate-700">{caseSummary.invoiceNumber}</span>
              </>
            )}
          </div>

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
                />
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim()}
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
                >
                  Hủy
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setRejectMode(true)}
                  className="btn-secondary"
                  disabled={approved}
                >
                  <XCircle size={16} />
                  Từ chối
                </button>
                <button
                  onClick={handleApprove}
                  className="btn-primary"
                  disabled={approved}
                >
                  <CheckCircle size={16} />
                  Duyệt
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ComparisonCard({ data, qtyHighlight, priceHighlight, isLowConf, label }) {
  return (
    <div className="card-compact divide-y divide-slate-100 text-sm overflow-hidden">
      {/* Quantity */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${qtyHighlight ? 'diff-highlight' : ''}`}>
        <span className="text-slate-500">Số lượng</span>
        <ConfidenceCell confidence={data.confidence}>
          <span className={`font-medium ${qtyHighlight ? 'text-rose-700 font-bold' : 'text-slate-900'}`}>
            {formatNumber(data.qty)}
          </span>
        </ConfidenceCell>
      </div>

      {/* Unit Price */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${priceHighlight ? 'diff-highlight' : ''}`}>
        <span className="text-slate-500">Đơn giá</span>
        <ConfidenceCell confidence={data.confidence}>
          <span className={`font-medium ${priceHighlight ? 'text-rose-700 font-bold' : 'text-slate-900'}`}>
            {formatVND(data.unitPrice)}
          </span>
        </ConfidenceCell>
      </div>

      {/* Tax Rate */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-slate-500">Thuế VAT</span>
        <span className="font-medium text-slate-900">{data.taxRate}%</span>
      </div>

      {/* Line Total */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50/50">
        <span className="text-slate-500 font-medium">Thành tiền</span>
        <span className="font-semibold text-slate-900">
          {formatVND(data.qty * data.unitPrice * (1 + data.taxRate / 100))}
        </span>
      </div>
    </div>
  );
}

function TotalCard({ label, totals, highlight }) {
  return (
    <div className={`card-compact p-4 space-y-2 ${highlight ? 'border-rose-200 bg-rose-50/30' : ''}`}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Tạm tính</span>
          <ConfidenceCell confidence={totals.confidence}>
            <span className="font-medium text-slate-900">{formatVND(totals.subtotal)}</span>
          </ConfidenceCell>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Thuế</span>
          <span className="font-medium text-slate-900">{formatVND(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5">
          <span className="font-semibold text-slate-700">Tổng cộng</span>
          <span className="font-bold text-slate-900">{formatVND(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
