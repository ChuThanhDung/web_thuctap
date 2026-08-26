import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  History,
  PackageCheck,
  ShoppingCart,
  User,
} from 'lucide-react';
import {
  calculateMatchSummary,
  compareDocumentField,
  comparisonStatusToResult,
  compareValues as compareRawValues,
  getComparisonCellClass,
  getGrnTotalAdjustment,
  inferVatRate,
  toNumber,
} from '../reconciliationCompare.js';
import { repairTextDeep } from '../text.js';

const DOC_TYPES = [
  { key: 'po', short: 'PO', label: 'Đơn đặt hàng', icon: ShoppingCart },
  { key: 'invoice', short: 'Invoice', label: 'Hóa đơn', icon: FileText },
  { key: 'grn', short: 'GRN', label: 'Phiếu nhập kho', icon: PackageCheck },
];

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  return String(repairTextDeep(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round(numericValue <= 1 ? numericValue * 100 : numericValue);
}

function getExtractionData(file) {
  return file?.ai_extraction?.extracted_data || {};
}

function getDocumentNumber(data, docType) {
  if (!data) return null;
  if (data.document_number) return data.document_number;
  if (docType === 'po') return data.po_number;
  if (docType === 'invoice') return data.invoice_number;
  if (docType === 'grn') return data.grn_number;
  return null;
}

function getDocumentDate(data, docType) {
  if (!data) return null;
  if (data.document_date) return data.document_date;
  if (docType === 'po') return data.po_date;
  if (docType === 'invoice') return data.invoice_date;
  if (docType === 'grn') return data.grn_date;
  return null;
}

function getEmptyDocs() {
  return DOC_TYPES.reduce((acc, type) => {
    acc[type.key] = { filename: '', missing: true, fields: {} };
    return acc;
  }, {});
}

function mapFileToDocument(file, docType) {
  const extractedData = getExtractionData(file);
  const confidence = formatPercent(file?.ai_extraction?.confidence);
  const extractedAt = file?.ai_extraction?.created_at?.split(' ')[1] || file?.created_at?.split(' ')[1] || '-';

  return {
    filename: file.filename,
    extractedAt,
    confidence,
    fields: {
      'Số chứng từ': formatDisplayValue(getDocumentNumber(extractedData, docType)),
      'Nhà cung cấp': formatDisplayValue(extractedData.supplier_name),
      'Mã số thuế': formatDisplayValue(extractedData.supplier_tax_id),
      'Ngày chứng từ': formatDisplayValue(getDocumentDate(extractedData, docType)),
      'Tổng tiền': formatDisplayValue(extractedData.total_amount),
    },
    extractedData,
    file,
  };
}

function getComparableValue(doc, key) {
  if (!doc || doc.missing) return '-';
  const value = doc.extractedData?.[key];
  return formatDisplayValue(value);
}

function formatVatRate(value) {
  return value > 0 ? formatDisplayValue(value) : '-';
}

function compareValues(values) {
  const status = compareRawValues(values.map((value) => (value === '-' ? '' : value)));
  if (status === 'missing' && values.every((value) => value === '-')) {
    return { result: 'Chưa có dữ liệu', severity: 'warning' };
  }
  return comparisonStatusToResult(status);
}

function buildComparisons(docs) {
  const rows = [
    ['Nhà cung cấp', 'supplier_name'],
    ['Mã số thuế', 'supplier_tax_id'],
    ['Thuế suất VAT', 'vat_rate_pct'],
    ['Tổng tiền', 'total_amount'],
  ];

  return rows.map(([field, key]) => {
    const values = [
      getComparableValue(docs.po, key),
      getComparableValue(docs.invoice, key),
      getComparableValue(docs.grn, key),
    ];
    if (key === 'vat_rate_pct') {
      const poVatRate = inferVatRate(docs.po);
      const invoiceVatRate = inferVatRate(docs.invoice);
      const grnVatRate = inferVatRate(docs.grn);
      values[0] = formatVatRate(poVatRate);
      values[1] = formatVatRate(invoiceVatRate);
      values[2] = grnVatRate > 0 ? formatVatRate(grnVatRate) : formatVatRate(poVatRate);
    }
    if (key === 'total_amount') {
      const grnAdjustment = getGrnTotalAdjustment(docs);
      if (grnAdjustment) {
        values[2] = formatDisplayValue(grnAdjustment.adjustedTotal);
      }
    }
    const result = comparisonStatusToResult(compareDocumentField(docs, key));
    return {
      field,
      po: values[0],
      invoice: values[1],
      grn: values[2],
      ...result,
    };
  }).sort((a, b) => ({ danger: 0, warning: 1, ok: 2 }[a.severity] - ({ danger: 0, warning: 1, ok: 2 }[b.severity])));
}

function normalizeItemText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeItemSku(value) {
  return String(value || '').trim().toLowerCase();
}

function getItemIdentityKey(item) {
  const sku = normalizeItemSku(item?.sku);
  if (sku) return `sku:${sku}`;
  const name = normalizeItemText(item?.item_name);
  return name ? `name:${name}` : '';
}

function getItemNameKey(item) {
  const name = normalizeItemText(item?.item_name);
  return name ? `name:${name}` : '';
}

function collectLineItemBases(...itemGroups) {
  const byIdentity = new Map();
  const anonymous = [];

  itemGroups.forEach((items) => {
    items.forEach((item) => {
      const key = getItemIdentityKey(item);
      if (!key) {
        anonymous.push(item);
        return;
      }
      const nameKey = getItemNameKey(item);
      if (key.startsWith('sku:') && nameKey && byIdentity.has(nameKey)) {
        return;
      }
      if (key.startsWith('name:')) {
        const sameNameSkuKey = [...byIdentity.keys()].find((existingKey) => (
          existingKey.startsWith('sku:') && getItemNameKey(byIdentity.get(existingKey)) === key
        ));
        if (sameNameSkuKey) return;
      }
      if (!byIdentity.has(key)) byIdentity.set(key, item);
    });
  });

  return [...byIdentity.values(), ...anonymous];
}

function findItemByIdentity(items, sourceItem) {
  const sourceSku = normalizeItemSku(sourceItem?.sku);
  if (sourceSku) {
    const foundBySku = items.find((item) => normalizeItemSku(item?.sku) === sourceSku);
    if (foundBySku) return foundBySku;
  }

  const sourceName = normalizeItemText(sourceItem?.item_name);
  if (sourceName) {
    const foundByName = items.find((item) => normalizeItemText(item?.item_name) === sourceName);
    if (foundByName) return foundByName;
  }

  return {};
}

function getLineAmount(item) {
  const explicitAmount = toNumber(item?.amount ?? item?.line_total ?? item?.total_amount);
  if (explicitAmount !== null) return explicitAmount;

  const qty = toNumber(item?.qty);
  const price = toNumber(item?.price);
  if (qty === null || price === null) return null;
  return qty * price;
}

function buildLineItems(docs) {
  const poItems = docs.po?.extractedData?.line_items || [];
  const invoiceItems = docs.invoice?.extractedData?.line_items || [];
  const grnItems = docs.grn?.extractedData?.line_items || [];
  const baseItems = collectLineItemBases(poItems, invoiceItems, grnItems);

  return baseItems.map((baseItem, index) => {
    const poItem = findItemByIdentity(poItems, baseItem);
    const invoiceItem = findItemByIdentity(invoiceItems, baseItem);
    const grnItem = findItemByIdentity(grnItems, baseItem);
    const qtyResult = compareValues([
      formatDisplayValue(poItem.qty),
      formatDisplayValue(invoiceItem.qty),
      formatDisplayValue(grnItem.qty),
    ]);
    const priceResult = compareValues([
      formatDisplayValue(poItem.price),
      formatDisplayValue(invoiceItem.price),
      formatDisplayValue(grnItem.price),
    ]);
    const poAmount = getLineAmount(poItem);
    const invoiceAmount = getLineAmount(invoiceItem);
    const grnAmount = getLineAmount(grnItem);
    const amountResult = compareValues([
      formatDisplayValue(poAmount),
      formatDisplayValue(invoiceAmount),
      formatDisplayValue(grnAmount),
    ]);
    const severity = [qtyResult, priceResult, amountResult].some((item) => item.severity === 'danger')
      ? 'danger'
      : [qtyResult, priceResult, amountResult].some((item) => item.severity === 'warning')
        ? 'warning'
        : 'ok';

    return {
      sku: formatDisplayValue(baseItem.sku || `Dòng ${index + 1}`),
      name: formatDisplayValue(baseItem.item_name),
      unit: formatDisplayValue(baseItem.unit),
      poQty: formatDisplayValue(poItem.qty),
      invoiceQty: formatDisplayValue(invoiceItem.qty),
      grnQty: formatDisplayValue(grnItem.qty),
      poPrice: formatDisplayValue(poItem.price),
      invoicePrice: formatDisplayValue(invoiceItem.price),
      grnPrice: formatDisplayValue(grnItem.price),
      poAmount: formatDisplayValue(poAmount),
      invoiceAmount: formatDisplayValue(invoiceAmount),
      grnAmount: formatDisplayValue(grnAmount),
      result: severity === 'danger'
        ? 'Có chênh lệch'
        : severity === 'warning'
          ? 'Thiếu dữ liệu'
          : 'Khớp',
      severity,
      qtySeverity: qtyResult.severity,
      priceSeverity: priceResult.severity,
      amountSeverity: amountResult.severity,
    };
  }).sort((a, b) => ({ danger: 0, warning: 1, ok: 2 }[a.severity] - ({ danger: 0, warning: 1, ok: 2 }[b.severity])));
}

function ResultPill({ severity, text }) {
  const className = {
    ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  }[severity] || 'bg-slate-100 text-slate-700';

  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${className}`}>{text}</span>;
}

function HistoryRunCard({ run, index, total, onOpenFile }) {
  const { docs, docList, comparisons, lineItems } = useMemo(() => {
    const d = getEmptyDocs();
    const list = { po: [], invoice: [], grn: [] };

    (run.files || []).forEach((file) => {
      if (!file.doc_type || !list[file.doc_type]) return;
      const docObj = mapFileToDocument(file, file.doc_type);
      list[file.doc_type].push(docObj);
    });

    DOC_TYPES.forEach((type) => {
      const filesOfType = (run.files || []).filter((f) => f.doc_type === type.key);
      if (filesOfType.length === 0) {
        d[type.key] = { filename: '', missing: true, fields: {} };
      } else {
        d[type.key] = list[type.key][0];
      }
    });

    return {
      docs: d,
      docList: list,
      comparisons: buildComparisons(d),
      lineItems: buildLineItems(d),
    };
  }, [run.files]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/50 space-y-4">
      {/* Header of this historical run */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3.5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <Clock size={13} />
            Lần đối chiếu #{run.version || (total - index)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle size={12} />
            Đã từng bị từ chối
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {run.rejected_by_name && (
            <span className="flex items-center gap-1">
              <User size={13} />
              Từ chối bởi: <strong className="text-slate-700 dark:text-slate-200">{run.rejected_by_name}</strong>
            </span>
          )}
          {run.rejected_at && (
            <span>· {run.rejected_at}</span>
          )}
        </div>
      </div>

      {/* Rejection Note Alert */}
      {run.rejection_note && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="min-w-0">
            <span className="font-bold">Lí do từ chối: </span>
            <span className="font-medium whitespace-pre-wrap break-words">{run.rejection_note}</span>
          </div>
        </div>
      )}

      {/* Document Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_TYPES.map((type) => {
          const doc = docs[type.key];
          const Icon = type.icon;
          const isMissing = !doc || doc.missing;

          return (
            <div
              key={`${run.id}-${type.key}`}
              className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isMissing ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{type.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {isMissing ? 'Chưa có chứng từ' : '1 chứng từ'}
                    </p>
                  </div>
                </div>
              </div>

              {!isMissing && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
                  <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-300" title={doc.filename}>
                    {doc.filename}
                  </span>
                  {doc.file && (
                    <button
                      type="button"
                      onClick={() => onOpenFile?.(doc.file)}
                      className="btn-ghost h-7 w-7 shrink-0 rounded p-0 text-slate-500 hover:text-brand-600"
                      title="Xem chứng từ gốc"
                    >
                      <Eye size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Chi tiết hàng hóa */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Chi tiết hàng hóa (Phiên bản cũ)</h4>
          <span className="text-[11px] text-slate-400">{lineItems.length} mặt hàng</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50">
                <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">Tên hàng / Mã</th>
                <th className="px-2 py-2 text-center font-bold text-slate-500 dark:text-slate-400">ĐVT</th>
                <th className="border-l border-dashed border-slate-300 px-2 py-2 text-right font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">SL PO</th>
                <th className="px-2 py-2 text-right font-bold text-slate-500 dark:text-slate-400">SL Invoice</th>
                <th className="px-2 py-2 text-right font-bold text-slate-500 dark:text-slate-400">SL GRN</th>
                <th className="border-l border-dashed border-slate-300 px-2 py-2 text-right font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">Giá PO</th>
                <th className="px-2 py-2 text-right font-bold text-slate-500 dark:text-slate-400">Giá Invoice</th>
                <th className="px-2 py-2 text-right font-bold text-slate-500 dark:text-slate-400">Giá GRN</th>
                <th className="border-l border-dashed border-slate-300 px-2 py-2 text-right font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">Tiền PO</th>
                <th className="px-2 py-2 text-right font-bold text-slate-500 dark:text-slate-400">Tiền Invoice</th>
                <th className="px-2 py-2 text-right font-bold text-slate-500 dark:text-slate-400">Tiền GRN</th>
                <th className="px-3 py-2 text-center font-bold text-slate-500 dark:text-slate-400">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lineItems.length > 0 ? (
                lineItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-3 py-2 max-w-[200px]">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{item.name || item.sku}</p>
                      <p className="text-[10px] font-mono text-slate-400">{item.sku}</p>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.unit}</td>
                    <td className={`border-l border-dashed border-slate-300 px-2 py-2 text-right tabular-nums dark:border-slate-700 ${getComparisonCellClass(item.qtySeverity, item.poQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.poQty}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.invoiceQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.invoiceQty}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${getComparisonCellClass(item.qtySeverity, item.grnQty, [item.poQty, item.invoiceQty, item.grnQty])}`}>{item.grnQty}</td>
                    <td className={`border-l border-dashed border-slate-300 px-2 py-2 text-right tabular-nums dark:border-slate-700 whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.poPrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.poPrice}</td>
                    <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.invoicePrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.invoicePrice}</td>
                    <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.priceSeverity, item.grnPrice, [item.poPrice, item.invoicePrice, item.grnPrice])}`}>{item.grnPrice || '-'}</td>
                    <td className={`border-l border-dashed border-slate-300 px-2 py-2 text-right tabular-nums dark:border-slate-700 whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.poAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.poAmount || '-'}</td>
                    <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.invoiceAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.invoiceAmount}</td>
                    <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${getComparisonCellClass(item.amountSeverity, item.grnAmount, [item.poAmount, item.invoiceAmount, item.grnAmount])}`}>{item.grnAmount || '-'}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap"><ResultPill severity={item.severity} text={item.result} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-xs text-slate-500">
                    Chưa có dữ liệu hàng hóa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bảng đối chiếu thông tin */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Bảng đối chiếu thông tin (Phiên bản cũ)</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50">
                <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">Trường</th>
                <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">PO</th>
                <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">Invoice</th>
                <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">GRN</th>
                <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {comparisons.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{item.field}</td>
                  <td className={`px-3 py-2 tabular-nums ${getComparisonCellClass(item.severity, item.po, [item.po, item.invoice, item.grn])}`}>{item.po}</td>
                  <td className={`px-3 py-2 tabular-nums ${getComparisonCellClass(item.severity, item.invoice, [item.po, item.invoice, item.grn])}`}>{item.invoice}</td>
                  <td className={`px-3 py-2 tabular-nums ${getComparisonCellClass(item.severity, item.grn, [item.po, item.invoice, item.grn])}`}>{item.grn}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><ResultPill severity={item.severity} text={item.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ReconciliationHistorySection({ history = [], onOpenFile, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between bg-slate-50/90 px-5 py-4 transition-colors hover:bg-slate-100/80 dark:bg-slate-900/80 dark:hover:bg-slate-800/80"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 text-left">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
            <History size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Lịch sử đối chiếu
              </h3>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {history.length} lần đối chiếu trước
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Nhấn để xem lại chứng từ và bảng kết quả đối chiếu ở các phiên bản trước khi bổ sung
            </p>
          </div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-transform dark:bg-slate-800 dark:text-slate-400">
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {isOpen && (
        <div className="space-y-6 border-t border-slate-200 p-4 sm:p-5 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/30">
          {history.map((run, index) => (
            <HistoryRunCard
              key={run.id || index}
              run={run}
              index={index}
              total={history.length}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
