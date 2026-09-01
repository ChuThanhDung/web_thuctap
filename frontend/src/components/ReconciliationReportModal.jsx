import React, { useState } from 'react';
import {
  CalendarDays,
  Printer,
  X,
  FileCheck2,
  Table,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { repairVietnameseText } from '../text.js';

const PERIOD_OPTIONS = [
  { value: 'current', label: 'Dữ liệu đang lọc' },
  { value: 'month', label: 'Theo tháng' },
  { value: 'quarter', label: 'Theo quý' },
  { value: 'year', label: 'Theo năm' },
  { value: 'custom', label: 'Tùy chọn ngày' },
];

function toDateInputValue(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseReportDate(value) {
  if (!value) return null;
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateInput(value, boundary = 'start') {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return boundary === 'end' ? endOfDay(date) : startOfDay(date);
}

function getBatchReportDate(batch) {
  return parseReportDate(batch?.updatedAt || batch?.createdAt || batch?.created_at);
}

function isWithinRange(batch, range) {
  if (!range?.start && !range?.end) return true;
  const date = getBatchReportDate(batch);
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function formatShortDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getRangeLabel(range) {
  if (!range?.start && !range?.end) return 'Tất cả dữ liệu đang lọc';
  const start = range.start ? formatShortDate(range.start) : 'đầu dữ liệu';
  const end = range.end ? formatShortDate(range.end) : 'hiện tại';
  return `${start} - ${end}`;
}

function getQuarterLabel(quarterValue) {
  const [year, quarter] = quarterValue.split('-Q');
  if (!year || !quarter) return 'Quý hiện tại';
  return `Quý ${quarter}/${year}`;
}

function getPeriodRange(periodType, values) {
  if (periodType === 'month') {
    const [year, month] = values.month.split('-').map(Number);
    if (!year || !month) return { start: null, end: null };
    return {
      start: new Date(year, month - 1, 1),
      end: endOfDay(new Date(year, month, 0)),
    };
  }

  if (periodType === 'quarter') {
    const [yearRaw, quarterRaw] = values.quarter.split('-Q');
    const year = Number(yearRaw);
    const quarter = Number(quarterRaw);
    if (!year || !quarter) return { start: null, end: null };
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end: endOfDay(new Date(year, startMonth + 3, 0)),
    };
  }

  if (periodType === 'year') {
    const year = Number(values.year);
    if (!year) return { start: null, end: null };
    return {
      start: new Date(year, 0, 1),
      end: endOfDay(new Date(year, 11, 31)),
    };
  }

  if (periodType === 'custom') {
    return {
      start: parseDateInput(values.customStart, 'start'),
      end: parseDateInput(values.customEnd, 'end'),
    };
  }

  return { start: null, end: null };
}

function getMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-');
  if (!year || !month) return 'Tháng hiện tại';
  return `Tháng ${month}/${year}`;
}

function getInitialQuarter(date = new Date()) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function getYearOptions(batches) {
  const years = new Set([new Date().getFullYear()]);
  batches.forEach((batch) => {
    const date = getBatchReportDate(batch);
    if (date) years.add(date.getFullYear());
  });
  return Array.from(years).sort((a, b) => b - a);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDocInfo(batch, key) {
  const doc = batch.docs?.[key];
  if (!doc || doc.missing) return { label: 'Chưa có', present: false };
  return { label: doc.filename || 'Có', present: true };
}

function getSupplierName(batch) {
  const poDoc = batch.docs?.po;
  const invDoc = batch.docs?.invoice;
  return (
    batch.supplierName ||
    invDoc?.extractedData?.supplier_name ||
    invDoc?.fields?.['Nhà cung cấp'] ||
    poDoc?.extractedData?.supplier_name ||
    poDoc?.fields?.['Nhà cung cấp'] ||
    '-'
  );
}

function buildReportSummary(batches) {
  const total = batches.length;
  const matched = batches.filter((batch) => batch.status === 'matched').length;
  const approved = batches.filter((batch) => batch.status === 'approved' || batch.status === 'final_approved').length;
  const rejected = batches.filter((batch) => batch.status === 'rejected').length;
  const mismatch = batches.filter((batch) => batch.status === 'mismatch').length;
  const missing = batches.filter((batch) => batch.status === 'missing').length;
  const needsAction = batches.filter((batch) => ['mismatch', 'missing', 'rejected'].includes(batch.status)).length;
  const avgMatchRate = total
    ? Math.round(batches.reduce((acc, batch) => acc + (Number(batch.matchRate) || 0), 0) / total)
    : 0;
  const missingFields = batches.reduce((acc, batch) => acc + (Number(batch.missingFields) || 0), 0);
  const mismatchFields = batches.reduce((acc, batch) => acc + (Number(batch.mismatchFields) || 0), 0);

  return {
    total,
    matched,
    approved,
    rejected,
    mismatch,
    missing,
    needsAction,
    avgMatchRate,
    missingFields,
    mismatchFields,
  };
}

function buildIssueStats(batches) {
  const counts = new Map();
  batches.forEach((batch) => {
    const issues = batch.issues?.length
      ? batch.issues
      : batch.status === 'missing'
        ? ['Thiếu chứng từ hoặc thiếu dữ liệu trích xuất']
        : [];

    issues.forEach((issue) => {
      const label = repairVietnameseText(String(issue).split(':')[0] || issue);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildSupplierStats(batches) {
  const stats = new Map();
  batches.forEach((batch) => {
    const supplier = repairVietnameseText(getSupplierName(batch));
    const current = stats.get(supplier) || { supplier, total: 0, matched: 0, needsAction: 0, avg: 0 };
    current.total += 1;
    current.avg += Number(batch.matchRate) || 0;
    if (['matched', 'approved', 'final_approved'].includes(batch.status)) current.matched += 1;
    if (['mismatch', 'missing', 'rejected'].includes(batch.status)) current.needsAction += 1;
    stats.set(supplier, current);
  });

  return Array.from(stats.values())
    .map((item) => ({ ...item, avg: item.total ? Math.round(item.avg / item.total) : 0 }))
    .sort((a, b) => b.needsAction - a.needsAction || b.total - a.total)
    .slice(0, 8);
}

function formatReportDate(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    dateStr: `Ngày ${day} tháng ${month} năm ${year}`,
    timeStr: `${hours}:${minutes}, ${day}/${month}/${year}`,
    exportFileName: `Bao_cao_doi_soat_${year}${month}${day}_${hours}${minutes}.csv`,
  };
}

function cleanPersonName(name) {
  if (!name) return 'Người lập biểu';
  return repairVietnameseText(name)
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
}

function getStatusBadgeText(status) {
  switch (status) {
    case 'matched':
      return { label: 'Khớp hoàn toàn', color: 'text-emerald-700 bg-emerald-50 border-emerald-300' };
    case 'approved':
    case 'final_approved':
      return { label: 'Đã duyệt', color: 'text-blue-700 bg-blue-50 border-blue-300' };
    case 'rejected':
      return { label: 'Đã từ chối', color: 'text-rose-700 bg-rose-50 border-rose-300' };
    case 'mismatch':
      return { label: 'Lệch dữ liệu', color: 'text-rose-700 bg-rose-50 border-rose-300' };
    case 'missing':
      return { label: 'Thiếu chứng từ', color: 'text-amber-700 bg-amber-50 border-amber-300' };
    default:
      return { label: 'Đang xử lý', color: 'text-slate-700 bg-slate-50 border-slate-300' };
  }
}

function generatePrintHTML({
  batches,
  summary,
  overviewFilterLabel,
  periodLabel,
  accountantName,
  timeStr,
  dateStr,
  totalBatches,
  issueStats,
  supplierStats,
}) {
  const tableRows = batches.map((batch, index) => {
    const poDoc = getDocInfo(batch, 'po');
    const invDoc = getDocInfo(batch, 'invoice');
    const grnDoc = getDocInfo(batch, 'grn');
    const supplier = getSupplierName(batch);
    const docsPresent = [
      poDoc.present ? 'PO' : null,
      invDoc.present ? 'Inv' : null,
      grnDoc.present ? 'GRN' : null,
    ].filter(Boolean).join(' · ') || 'Chưa đủ';
    const statusMeta = getStatusBadgeText(batch.status);
    const issuesHtml = batch.issues && batch.issues.length > 0
      ? `<ul style="margin: 0; padding-left: 14px; color: #dc2626; font-size: 10px;">${batch.issues.map((i) => `<li>${escapeHtml(repairVietnameseText(i))}</li>`).join('')}</ul>`
      : batch.status === 'matched'
        ? `<span style="color: #16a34a; font-size: 10px;">Khớp 100% các trường</span>`
        : batch.status === 'missing'
          ? `<span style="color: #d97706; font-size: 10px;">Thiếu chứng từ</span>`
          : `<span style="color: #9ca3af; font-size: 10px;">-</span>`;

    return `
      <tr style="page-break-inside: avoid;">
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 500;">${index + 1}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1; font-weight: bold; white-space: nowrap;">${escapeHtml(batch.batchNumber)}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${escapeHtml(repairVietnameseText(supplier))}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; white-space: nowrap;">${escapeHtml(docsPresent)}</td>
        <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">${batch.matchRate}%</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; white-space: nowrap;">
          <span style="display: inline-block; padding: 2px 5px; border-radius: 3px; font-size: 9.5px; font-weight: 600; border: 1px solid #cbd5e1;">${escapeHtml(statusMeta.label)}</span>
        </td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${issuesHtml}</td>
      </tr>
    `;
  }).join('');

  const issueRows = issueStats.map((item, index) => `
    <tr>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1;">${index + 1}</td>
      <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${escapeHtml(item.label)}</td>
      <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">${item.count}</td>
    </tr>
  `).join('');

  const supplierRows = supplierStats.map((item, index) => `
    <tr>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1;">${index + 1}</td>
      <td style="padding: 5px 6px; border: 1px solid #cbd5e1; font-weight: bold;">${escapeHtml(item.supplier)}</td>
      <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1;">${item.total}</td>
      <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; color: #16a34a;">${item.matched}</td>
      <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; color: #dc2626;">${item.needsAction}</td>
      <td style="padding: 5px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">${item.avg}%</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo Cáo Tổng Hợp Đối Soát Chứng Từ</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #000;
      background: #fff;
      font-size: 11px;
      line-height: 1.4;
      padding: 0;
    }
    .report-header {
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .header-top .left {
      text-align: left;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 11px;
    }
    .header-top .left .sub {
      font-size: 10px;
      font-weight: normal;
      color: #4b5563;
    }
    .header-top .right {
      text-align: right;
      font-size: 10px;
    }
    .header-top .right .title {
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-top .right .motto {
      font-style: italic;
    }
    .header-top .right .form-no {
      color: #6b7280;
      font-size: 9px;
      margin-top: 2px;
    }
    .main-title {
      text-align: center;
      font-size: 17px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.2px;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .meta-line {
      text-align: center;
      font-size: 10px;
      color: #4b5563;
      margin-top: 4px;
      display: flex;
      justify-content: center;
      gap: 20px;
    }
    .section-title {
      font-size: 11.5px;
      font-weight: bold;
      text-transform: uppercase;
      border-left: 3px solid #000;
      padding-left: 6px;
      margin-top: 12px;
      margin-bottom: 8px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .summary-card {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      padding: 6px 8px;
      border-radius: 4px;
      text-align: center;
    }
    .summary-card .label {
      font-size: 9.5px;
      color: #64748b;
      font-weight: 500;
    }
    .summary-card .val {
      font-size: 15px;
      font-weight: bold;
      color: #0f172a;
      margin-top: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 14px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #f1f5f9;
      border: 1px solid #94a3b8;
      padding: 5px 6px;
      font-weight: bold;
      text-align: left;
    }
    td {
      border: 1px solid #cbd5e1;
    }
    .signatures {
      margin-top: 20px;
      page-break-inside: avoid;
    }
    .date-signed {
      text-align: right;
      font-style: italic;
      font-size: 10.5px;
      color: #374151;
      margin-bottom: 10px;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      text-align: center;
      gap: 40px;
    }
    .sig-box .role {
      font-weight: bold;
      text-transform: uppercase;
      font-size: 10.5px;
    }
    .sig-box .sub {
      font-style: italic;
      color: #6b7280;
      font-size: 9px;
    }
    .sig-box .space {
      height: 55px;
    }
    .sig-box .name {
      font-weight: bold;
      font-size: 10.5px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="header-top">
      <div class="left">
        <div>CÔNG TY CP CÔNG NGHỆ DOCUSYNC</div>
        <div class="sub">Hệ thống Tự động Đối soát Chứng từ</div>
      </div>
      <div class="right">
        <div class="title">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div class="motto">Độc lập - Tự do - Hạnh phúc</div>
        <div class="form-no">Mẫu số: 03-DS/KT-2026</div>
      </div>
    </div>

    <div class="main-title">BÁO CÁO TỔNG HỢP ĐỐI SOÁT CHỨNG TỪ</div>

    <div class="meta-line">
      <div>Thời điểm xuất: <strong>${timeStr}</strong></div>
      <div>Người lập biểu: <strong>${accountantName}</strong></div>
      <div>Kỳ báo cáo: <strong>${escapeHtml(periodLabel)}</strong></div>
      ${overviewFilterLabel ? `<div>Nhóm dữ liệu: <strong>${escapeHtml(overviewFilterLabel)}</strong></div>` : ''}
    </div>
  </div>

  <div class="section-title">I. Tổng hợp chỉ số</div>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Tổng số batch</div>
      <div class="val">${totalBatches}</div>
    </div>
    <div class="summary-card">
      <div class="label">Khớp hoàn toàn</div>
      <div class="val" style="color: #16a34a;">${summary.matched || 0}</div>
    </div>
    <div class="summary-card">
      <div class="label">Có sai lệch</div>
      <div class="val" style="color: #dc2626;">${summary.mismatch || 0}</div>
    </div>
    <div class="summary-card">
      <div class="label">Tỉ lệ khớp TB</div>
      <div class="val" style="color: #1d4ed8;">${summary.avgMatchRate}%</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Thiếu dữ liệu</div>
      <div class="val" style="color: #d97706;">${summary.missing || 0}</div>
    </div>
    <div class="summary-card">
      <div class="label">Đã duyệt</div>
      <div class="val" style="color: #2563eb;">${summary.approved || 0}</div>
    </div>
    <div class="summary-card">
      <div class="label">Cần xử lý</div>
      <div class="val" style="color: #dc2626;">${summary.needsAction || 0}</div>
    </div>
    <div class="summary-card">
      <div class="label">Trường lệch / thiếu</div>
      <div class="val" style="color: #0f172a;">${summary.mismatchFields || 0}/${summary.missingFields || 0}</div>
    </div>
  </div>

  <div class="section-title">II. Lỗi đối soát nổi bật</div>
  <table>
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">STT</th>
        <th>Nhóm lỗi</th>
        <th style="width: 80px; text-align: right;">Số batch</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows || '<tr><td colspan="3" style="text-align: center; padding: 14px; color: #64748b;">Không phát sinh lỗi trong phạm vi báo cáo.</td></tr>'}
    </tbody>
  </table>

  <div class="section-title">III. Tổng hợp theo nhà cung cấp</div>
  <table>
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">STT</th>
        <th>Nhà cung cấp</th>
        <th style="width: 60px; text-align: right;">Batch</th>
        <th style="width: 70px; text-align: right;">Khớp</th>
        <th style="width: 70px; text-align: right;">Cần xử lý</th>
        <th style="width: 70px; text-align: right;">Match TB</th>
      </tr>
    </thead>
    <tbody>
      ${supplierRows || '<tr><td colspan="6" style="text-align: center; padding: 14px; color: #64748b;">Không có dữ liệu nhà cung cấp.</td></tr>'}
    </tbody>
  </table>

  <div class="section-title">IV. Chi tiết đối soát</div>
  <table>
    <thead>
      <tr style="text-align: center;">
        <th style="width: 26px; text-align: center;">STT</th>
        <th style="width: 85px; text-align: left;">Mã Batch</th>
        <th style="text-align: left;">Nhà cung cấp</th>
        <th style="width: 80px; text-align: center;">Bộ chứng từ</th>
        <th style="width: 60px; text-align: right;">Tỷ lệ khớp</th>
        <th style="width: 80px; text-align: center;">Trạng thái</th>
        <th style="text-align: left;">Ghi chú / Sai lệch</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">Không có dữ liệu batch nào.</td></tr>'}
    </tbody>
  </table>

  <div class="signatures">
    <div class="date-signed">${dateStr}</div>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="role">Người Lập Biểu</div>
        <div class="sub">(Ký, họ tên)</div>
        <div class="space"></div>
        <div class="name">${accountantName}</div>
      </div>
      <div class="sig-box">
        <div class="role">Kế Toán Trưởng</div>
        <div class="sub">(Ký, họ tên, đóng dấu)</div>
        <div class="space"></div>
        <div class="name">....................................................</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function exportBatchesToCSV(batches, filename) {
  const headers = [
    'STT',
    'Mã Batch',
    'Ngày cập nhật',
    'Nhà cung cấp',
    'Người tạo / xử lý',
    'PO',
    'Invoice',
    'GRN',
    'Tỷ lệ khớp (%)',
    'Trạng thái',
    'Số trường lệch',
    'Số trường thiếu dữ liệu',
    'Ghi chú / Sai lệch',
  ];

  const rows = batches.map((batch, index) => {
    const poStatus = getDocInfo(batch, 'po').label;
    const invStatus = getDocInfo(batch, 'invoice').label;
    const grnStatus = getDocInfo(batch, 'grn').label;
    const supplier = getSupplierName(batch);
    const statusLabel = getStatusBadgeText(batch.status).label;
    const issues = (batch.issues || []).join('; ') || (batch.status === 'matched' ? 'Khớp 100%' : '-');

    return [
      index + 1,
      `"${batch.batchNumber || ''}"`,
      `"${batch.updatedAt || ''}"`,
      `"${supplier.replace(/"/g, '""')}"`,
      `"${(batch.owner || '').replace(/"/g, '""')}"`,
      `"${poStatus.replace(/"/g, '""')}"`,
      `"${invStatus.replace(/"/g, '""')}"`,
      `"${grnStatus.replace(/"/g, '""')}"`,
      batch.matchRate || 0,
      `"${statusLabel}"`,
      batch.mismatchFields || 0,
      batch.missingFields || 0,
      `"${issues.replace(/"/g, '""')}"`,
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ReconciliationReportModal({
  isOpen,
  onClose,
  batches = [],
  summary = {},
  overviewFilterLabel = '',
  overviewDateRange = {},
  currentUser = null,
}) {
  const [zoomScale, setZoomScale] = useState(1);
  const now = new Date();
  const [periodType, setPeriodType] = useState('current');
  const [periodValues, setPeriodValues] = useState({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    quarter: getInitialQuarter(now),
    year: String(now.getFullYear()),
    customStart: overviewDateRange?.start ? toDateInputValue(overviewDateRange.start) : '',
    customEnd: overviewDateRange?.end ? toDateInputValue(overviewDateRange.end) : '',
  });

  if (!isOpen) return null;

  const { dateStr, timeStr, exportFileName } = formatReportDate();
  const selectedPeriodRange = periodType === 'current'
    ? { start: null, end: null }
    : getPeriodRange(periodType, periodValues);
  const reportBatches = periodType === 'current'
    ? batches
    : batches.filter((batch) => isWithinRange(batch, selectedPeriodRange));
  const totalBatches = reportBatches.length;
  const reportSummary = buildReportSummary(reportBatches);
  const issueStats = buildIssueStats(reportBatches);
  const supplierStats = buildSupplierStats(reportBatches);
  const periodLabel = periodType === 'current'
    ? getRangeLabel(overviewDateRange)
    : periodType === 'month'
      ? getMonthLabel(periodValues.month)
      : periodType === 'quarter'
        ? getQuarterLabel(periodValues.quarter)
        : periodType === 'year'
          ? periodValues.year ? `Năm ${periodValues.year}` : 'Năm hiện tại'
          : getRangeLabel(selectedPeriodRange);
  const yearOptions = getYearOptions(batches);
  const accountantName = cleanPersonName(currentUser?.full_name);

  const handlePrint = () => {
    const reportHtml = generatePrintHTML({
      batches: reportBatches,
      summary: reportSummary,
      overviewFilterLabel,
      periodLabel,
      accountantName,
      timeStr,
      dateStr,
      totalBatches,
      issueStats,
      supplierStats,
    });

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(reportHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 250);
  };

  const handleExportCSV = () => {
    const safePeriod = periodLabel
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
    const filename = safePeriod
      ? exportFileName.replace('.csv', `_${safePeriod}.csv`)
      : exportFileName;
    exportBatchesToCSV(reportBatches, filename);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-slate-950/75 p-0 backdrop-blur-sm print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      {/* Top Fixed Toolbar */}
      <header className="sticky top-0 z-20 flex w-full items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 shadow-md backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow">
            <FileCheck2 size={19} />
          </div>
          <div>
            <h2 id="report-modal-title" className="text-sm font-bold text-white sm:text-base">
              Báo Cáo Tổng Hợp Đối Soát
            </h2>
            <p className="text-xs text-slate-400">
              {periodLabel} · {totalBatches} batch
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Zoom controls for preview */}
          <div className="hidden items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-slate-300 md:flex">
            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.max(0.6, s - 0.1))}
              className="p-1 hover:text-white"
              title="Thu nhỏ"
            >
              <ZoomOut size={14} />
            </button>
            <span className="min-w-[42px] text-center text-xs font-semibold">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.min(1.4, s + 0.1))}
              className="p-1 hover:text-white"
              title="Phóng to"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoomScale(1)}
              className="p-1 hover:text-white ml-1 border-l border-slate-700 pl-1.5"
              title="Đặt lại 100%"
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Export CSV / Excel Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 shadow-sm transition-colors hover:bg-slate-700 hover:text-white"
            title="Tải file Excel / CSV"
          >
            <Table size={14} className="text-emerald-400" />
            <span className="hidden sm:inline">Xuất Excel / CSV</span>
            <span className="sm:hidden">Excel</span>
          </button>

          {/* Print & PDF Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-500 active:scale-95"
            title="In ra giấy hoặc Lưu dưới dạng file PDF"
          >
            <Printer size={15} />
            <span>In / Lưu PDF</span>
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="Đóng"
            aria-label="Đóng cửa sổ xem trước"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <section className="w-full border-b border-slate-800 bg-slate-900/95 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-slate-300">
            <CalendarDays size={16} className="text-brand-300" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">Kỳ báo cáo</p>
              <p className="truncate text-xs text-slate-400">
                {overviewFilterLabel ? `${overviewFilterLabel} · ` : ''}{periodLabel}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(150px,180px)_minmax(140px,170px)_minmax(120px,150px)_minmax(120px,150px)] lg:w-auto">
            <select
              value={periodType}
              onChange={(event) => setPeriodType(event.target.value)}
              className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 outline-none transition-colors focus:border-brand-400"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {periodType === 'month' && (
              <input
                type="month"
                value={periodValues.month}
                onChange={(event) => setPeriodValues((values) => ({ ...values, month: event.target.value }))}
                className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 outline-none transition-colors focus:border-brand-400"
              />
            )}

            {periodType === 'quarter' && (
              <select
                value={periodValues.quarter}
                onChange={(event) => setPeriodValues((values) => ({ ...values, quarter: event.target.value }))}
                className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 outline-none transition-colors focus:border-brand-400"
              >
                {yearOptions.map((year) => (
                  [1, 2, 3, 4].map((quarter) => (
                    <option key={`${year}-Q${quarter}`} value={`${year}-Q${quarter}`}>
                      Quý {quarter}/{year}
                    </option>
                  ))
                ))}
              </select>
            )}

            {periodType === 'year' && (
              <select
                value={periodValues.year}
                onChange={(event) => setPeriodValues((values) => ({ ...values, year: event.target.value }))}
                className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 outline-none transition-colors focus:border-brand-400"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    Năm {year}
                  </option>
                ))}
              </select>
            )}

            {periodType === 'custom' && (
              <>
                <input
                  type="date"
                  value={periodValues.customStart}
                  onChange={(event) => setPeriodValues((values) => ({ ...values, customStart: event.target.value }))}
                  max={periodValues.customEnd || undefined}
                  className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 outline-none transition-colors focus:border-brand-400"
                  aria-label="Từ ngày"
                />
                <input
                  type="date"
                  value={periodValues.customEnd}
                  onChange={(event) => setPeriodValues((values) => ({ ...values, customEnd: event.target.value }))}
                  min={periodValues.customStart || undefined}
                  className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 outline-none transition-colors focus:border-brand-400"
                  aria-label="Đến ngày"
                />
              </>
            )}

            {periodType !== 'custom' && (
              <div className="hidden h-9 rounded-lg border border-slate-800 bg-slate-950/40 px-3 text-xs font-semibold text-slate-400 sm:flex sm:items-center">
                {reportBatches.length}/{batches.length} batch
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Preview Container with A4 Sheet Display */}
      <div className="flex-1 w-full overflow-y-auto bg-slate-300/80 p-3 sm:p-8 dark:bg-slate-950/80">
        
        {/* Physical A4 Sheet Container */}
        <div
          id="preview-sheet"
          style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}
          className="mx-auto min-h-[297mm] w-full max-w-[210mm] rounded-sm bg-white p-[15mm] text-black shadow-2xl transition-transform duration-150"
        >
          {/* Header Tiêu ngữ & Đơn vị (Luôn ở trên đầu trang) */}
          <div className="border-b-2 border-black pb-4 text-center">
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row sm:items-start text-xs">
              <div className="text-center sm:text-left font-bold uppercase leading-snug text-slate-900">
                <p>CÔNG TY CP CÔNG NGHỆ DOCUSYNC</p>
                <p className="text-[11px] font-normal text-slate-600">Hệ thống Tự động Đối soát Chứng từ</p>
              </div>
              <div className="text-center sm:text-right text-[11px] text-slate-900">
                <p className="font-bold uppercase tracking-wide">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                <p className="italic font-medium">Độc lập - Tự do - Hạnh phúc</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Mẫu số: 03-DS/KT-2026</p>
              </div>
            </div>

            <div className="my-4 text-center">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-black">
                Báo Cáo Tổng Hợp Đối Soát Chứng Từ
              </h1>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-slate-600">
              <span>Thời điểm xuất: <strong>{timeStr}</strong></span>
              <span>Người lập biểu: <strong>{accountantName}</strong></span>
              <span>Kỳ báo cáo: <strong>{periodLabel}</strong></span>
              {overviewFilterLabel && (
                <span>Nhóm dữ liệu: <strong>{overviewFilterLabel}</strong></span>
              )}
            </div>
          </div>

          {/* Section I: Thống kê chỉ số */}
          <div className="mt-5">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black border-l-4 border-black pl-2.5 mb-2.5">
              I. Tổng hợp chỉ số
            </h2>

            <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Tổng số batch</p>
                <p className="mt-0.5 text-lg font-bold text-black tabular-nums">{totalBatches}</p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Khớp hoàn toàn</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-700 tabular-nums">
                  {reportSummary.matched || 0}
                </p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Có sai lệch</p>
                <p className="mt-0.5 text-lg font-bold text-rose-700 tabular-nums">
                  {reportSummary.mismatch || 0}
                </p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Tỉ lệ khớp TB</p>
                <p className="mt-0.5 text-lg font-bold text-blue-800 tabular-nums">
                  {reportSummary.avgMatchRate}%
                </p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2 sm:gap-3 text-center">
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Thiếu dữ liệu</p>
                <p className="mt-0.5 text-lg font-bold text-amber-700 tabular-nums">
                  {reportSummary.missing || 0}
                </p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Đã duyệt</p>
                <p className="mt-0.5 text-lg font-bold text-blue-700 tabular-nums">
                  {reportSummary.approved || 0}
                </p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Cần xử lý</p>
                <p className="mt-0.5 text-lg font-bold text-rose-700 tabular-nums">
                  {reportSummary.needsAction || 0}
                </p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-50 p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Lệch / thiếu</p>
                <p className="mt-0.5 text-lg font-bold text-black tabular-nums">
                  {reportSummary.mismatchFields}/{reportSummary.missingFields}
                </p>
              </div>
            </div>
          </div>

          {/* Section II: Lỗi nổi bật */}
          <div className="mt-5">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black border-l-4 border-black pl-2.5 mb-2.5">
              II. Lỗi đối soát nổi bật
            </h2>

            <div className="rounded border border-gray-400 overflow-hidden">
              <table className="w-full table-auto border-collapse text-left text-[11px] leading-tight">
                <thead>
                  <tr className="border-b border-gray-400 bg-gray-100 font-bold text-black">
                    <th className="px-2 py-2 w-8 border-r border-gray-300 text-center">STT</th>
                    <th className="px-2.5 py-2 border-r border-gray-300">Nhóm lỗi</th>
                    <th className="px-2.5 py-2 w-20 text-right">Số batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {issueStats.length > 0 ? (
                    issueStats.map((item, index) => (
                      <tr key={item.label}>
                        <td className="px-2 py-1.5 text-center font-medium text-gray-700 border-r border-gray-300">{index + 1}</td>
                        <td className="px-2.5 py-1.5 font-medium text-gray-900 border-r border-gray-300">{item.label}</td>
                        <td className="px-2.5 py-1.5 text-right font-bold tabular-nums text-black">{item.count}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-5 text-center text-gray-500 italic">
                        Không phát sinh lỗi trong phạm vi báo cáo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section III: Nhà cung cấp */}
          <div className="mt-5">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black border-l-4 border-black pl-2.5 mb-2.5">
              III. Tổng hợp theo nhà cung cấp
            </h2>

            <div className="rounded border border-gray-400 overflow-hidden">
              <table className="w-full table-auto border-collapse text-left text-[11px] leading-tight">
                <thead>
                  <tr className="border-b border-gray-400 bg-gray-100 font-bold text-black text-center">
                    <th className="px-2 py-2 w-8 border-r border-gray-300">STT</th>
                    <th className="px-2.5 py-2 text-left border-r border-gray-300">Nhà cung cấp</th>
                    <th className="px-2.5 py-2 w-16 text-right border-r border-gray-300">Batch</th>
                    <th className="px-2.5 py-2 w-16 text-right border-r border-gray-300">Khớp</th>
                    <th className="px-2.5 py-2 w-20 text-right border-r border-gray-300">Cần xử lý</th>
                    <th className="px-2.5 py-2 w-20 text-right">Match TB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {supplierStats.length > 0 ? (
                    supplierStats.map((item, index) => (
                      <tr key={item.supplier}>
                        <td className="px-2 py-1.5 text-center font-medium text-gray-700 border-r border-gray-300">{index + 1}</td>
                        <td className="px-2.5 py-1.5 font-bold text-black border-r border-gray-300">{item.supplier}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums border-r border-gray-300">{item.total}</td>
                        <td className="px-2.5 py-1.5 text-right font-bold text-emerald-700 tabular-nums border-r border-gray-300">{item.matched}</td>
                        <td className="px-2.5 py-1.5 text-right font-bold text-rose-700 tabular-nums border-r border-gray-300">{item.needsAction}</td>
                        <td className="px-2.5 py-1.5 text-right font-bold text-black tabular-nums">{item.avg}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-5 text-center text-gray-500 italic">
                        Không có dữ liệu nhà cung cấp trong phạm vi báo cáo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section IV: Bảng chi tiết */}
          <div className="mt-5">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black border-l-4 border-black pl-2.5 mb-2.5">
              IV. Chi tiết đối soát
            </h2>

            <div className="rounded border border-gray-400 overflow-hidden">
              <table className="w-full table-fixed border-collapse text-left text-[11px] leading-tight">
                <thead>
                  <tr className="border-b border-gray-400 bg-gray-100 font-bold text-black text-center">
                    <th className="w-[6%] px-1.5 py-2 border-r border-gray-300">STT</th>
                    <th className="w-[24%] px-2 py-2 text-left border-r border-gray-300">Mã Batch</th>
                    <th className="w-[22%] px-2 py-2 text-left border-r border-gray-300">Nhà cung cấp</th>
                    <th className="w-[15%] px-1.5 py-2 border-r border-gray-300">Bộ chứng từ</th>
                    <th className="w-[8%] px-1.5 py-2 text-right border-r border-gray-300">Tỷ lệ khớp</th>
                    <th className="w-[14%] px-1.5 py-2 text-center border-r border-gray-300">Trạng thái</th>
                    <th className="w-[11%] px-1.5 py-2 text-left">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {reportBatches.length > 0 ? (
                    reportBatches.map((batch, index) => {
                      const statusMeta = getStatusBadgeText(batch.status);
                      const poDoc = getDocInfo(batch, 'po');
                      const invDoc = getDocInfo(batch, 'invoice');
                      const grnDoc = getDocInfo(batch, 'grn');
                      const supplier = getSupplierName(batch);
                      const docsPresent = [
                        poDoc.present ? 'PO' : null,
                        invDoc.present ? 'Inv' : null,
                        grnDoc.present ? 'GRN' : null,
                      ].filter(Boolean).join(' · ') || 'Chưa đủ';

                      return (
                        <tr key={batch.id} className="hover:bg-gray-50/80">
                          <td className="px-1.5 py-1.5 text-center font-medium text-gray-700 border-r border-gray-300">
                            {index + 1}
                          </td>
                          <td className="break-words px-2 py-1.5 font-bold text-black border-r border-gray-300">
                            {batch.batchNumber}
                          </td>
                          <td className="whitespace-normal break-words px-2 py-1.5 font-medium leading-snug text-gray-900 border-r border-gray-300">
                            {repairVietnameseText(supplier)}
                          </td>
                          <td className="px-1.5 py-1.5 text-center border-r border-gray-300 text-gray-700">
                            {docsPresent}
                          </td>
                          <td className="px-1.5 py-1.5 text-right font-bold tabular-nums border-r border-gray-300 text-black">
                            {batch.matchRate}%
                          </td>
                          <td className="px-1.5 py-1.5 text-center border-r border-gray-300">
                            <span className={`inline-flex max-w-full items-center justify-center rounded px-1 py-0.5 text-[9px] font-semibold leading-tight border ${statusMeta.color}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="break-words px-1.5 py-1.5 text-gray-800">
                            {batch.issues && batch.issues.length > 0 ? (
                              <ul className="list-disc pl-3 text-[10px] text-rose-700 space-y-0.5">
                                {batch.issues.map((issue, i) => (
                                  <li key={i}>{repairVietnameseText(issue)}</li>
                                ))}
                              </ul>
                            ) : batch.status === 'matched' ? (
                              <span className="text-emerald-700 text-[10px]">Khớp 100% các trường</span>
                            ) : batch.status === 'missing' ? (
                              <span className="text-amber-700 text-[10px]">Thiếu chứng từ</span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500 italic">
                        Không có dữ liệu batch nào trong phạm vi báo cáo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section III: Chữ ký & Phê duyệt */}
          <div className="mt-8 pt-4">
            <div className="flex justify-end text-xs italic text-gray-700 mb-3">
              {dateStr}
            </div>

            <div className="grid grid-cols-2 text-center gap-10">
              <div className="flex flex-col items-center">
                <p className="text-xs font-bold uppercase tracking-wider text-black">
                  Người Lập Biểu
                </p>
                <p className="text-[10px] italic text-gray-600">
                  (Ký, họ tên)
                </p>
                <div className="h-16" />
                <p className="text-xs font-bold text-black">
                  {accountantName}
                </p>
              </div>

              <div className="flex flex-col items-center">
                <p className="text-xs font-bold uppercase tracking-wider text-black">
                  Kế Toán Trưởng
                </p>
                <p className="text-[10px] italic text-gray-600">
                  (Ký, họ tên, đóng dấu)
                </p>
                <div className="h-16" />
                <p className="text-xs font-bold text-black">
                  ....................................................
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
