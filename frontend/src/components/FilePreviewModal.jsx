import React, { useEffect, useState } from 'react';
import { FileText, Minus, Plus, RotateCcw, X } from 'lucide-react';

function getFileExt(filename = '') {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getPreviewKind(filename = '') {
  const ext = getFileExt(filename);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (ext === 'xml') return 'xml';
  if (['pdf', 'txt', 'csv', 'json'].includes(ext)) return 'iframe';
  return 'unsupported';
}

function getChildrenByName(node, name) {
  return Array.from(node?.children || []).filter((child) => child.localName === name || child.nodeName === name);
}

function findFirst(node, name) {
  if (!node) return null;
  if (node.localName === name || node.nodeName === name) return node;
  for (const child of Array.from(node.children || [])) {
    const found = findFirst(child, name);
    if (found) return found;
  }
  return null;
}

function getText(node, name) {
  return findFirst(node, name)?.textContent?.trim() || '';
}

function formatDate(value) {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  return value;
}

function formatNumber(value) {
  if (!value) return '-';
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(number);
}

function formatMaybeNumber(value) {
  if (!value) return '-';
  if (String(value).includes('/')) return value;
  return formatNumber(value);
}

function parseInvoiceXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText || '', 'application/xml');
  if (doc.querySelector('parsererror')) {
    return { error: 'Không thể đọc XML này.' };
  }

  const root = doc.documentElement;
  const rootName = root?.localName || root?.nodeName || '';

  if (rootName === 'DonDatHang') {
    const buyer = findFirst(root, 'BenMua');
    const seller = findFirst(root, 'BenBan');
    const itemList = findFirst(root, 'ChiTietDonHang');
    const items = getChildrenByName(itemList, 'DongHang').map((item, index) => ({
      index: getText(item, 'STT') || String(index + 1),
      code: getText(item, 'MaHang'),
      name: getText(item, 'TenHang'),
      unit: getText(item, 'DonViTinh'),
      quantity: getText(item, 'SoLuong'),
      price: getText(item, 'DonGia'),
      amount: getText(item, 'ThanhTien'),
      taxRate: getText(root, 'ThueSuatGTGT'),
    }));

    return {
      title: 'Đơn đặt hàng',
      formNo: '',
      serial: '',
      invoiceNo: getText(root, 'SoDon'),
      date: getText(root, 'NgayLap'),
      currency: 'VND',
      seller: {
        name: getText(seller, 'Ten'),
        taxId: getText(seller, 'MST'),
        address: getText(seller, 'DiaChi'),
      },
      buyer: {
        name: getText(buyer, 'Ten'),
        taxId: getText(buyer, 'MST'),
        address: getText(buyer, 'DiaChi'),
        phone: getText(buyer, 'DienThoai'),
        paymentMethod: getText(root, 'PhuongThucThanhToan'),
      },
      extraInfo: [
        ['Người đại diện', getText(buyer, 'NguoiDaiDien')],
        ['Địa điểm giao hàng', getText(root, 'DiaDiemGiaoHang')],
      ].filter(([, value]) => value),
      totals: {
        beforeTax: getText(root, 'TongTienHang'),
        tax: getText(root, 'TienThueGTGT'),
        total: getText(root, 'TongTienThanhToan') || getText(root, 'TongTienHang'),
        totalText: getText(root, 'BangChu'),
      },
      items,
    };
  }

  if (rootName === 'PhieuNhapKho') {
    const unit = findFirst(root, 'DonVi');
    const itemList = findFirst(root, 'ChiTiet');
    const items = getChildrenByName(itemList, 'DongHang').map((item, index) => {
      const docQty = getText(item, 'SoLuongTheoChungTu');
      const actualQty = getText(item, 'SoLuongThucNhap');
      return {
        index: getText(item, 'STT') || String(index + 1),
        code: getText(item, 'MaHang'),
        name: getText(item, 'TenHang'),
        unit: getText(item, 'DonViTinh'),
        quantity: docQty && actualQty ? `${formatNumber(docQty)} / ${formatNumber(actualQty)}` : actualQty || docQty,
        price: getText(item, 'DonGia'),
        amount: getText(item, 'ThanhTien'),
        taxRate: '',
      };
    });

    return {
      title: 'Phiếu nhập kho',
      formNo: getText(root, 'MauSo'),
      serial: '',
      invoiceNo: getText(root, 'SoPhieu'),
      date: getText(root, 'NgayLap'),
      currency: 'VND',
      seller: {
        name: getText(root, 'NguoiGiaoHang'),
        taxId: '',
        address: '',
      },
      buyer: {
        name: getText(unit, 'Ten'),
        taxId: getText(unit, 'MST'),
        address: getText(root, 'NhapTaiKho'),
        paymentMethod: '',
      },
      extraInfo: [
        ['Bộ phận', getText(unit, 'BoPhan')],
        ['Căn cứ', getText(root, 'CanCu')],
        ['Chứng từ gốc kèm theo', getText(root, 'SoChungTuGocKemTheo')],
      ].filter(([, value]) => value),
      quantityLabel: 'SL chứng từ / thực nhập',
      totals: {
        beforeTax: getText(root, 'TongTien'),
        tax: '',
        total: getText(root, 'TongTien'),
        totalText: getText(root, 'BangChu'),
      },
      items,
    };
  }

  const invoice = findFirst(doc, 'DLHDon') || root;
  const general = findFirst(invoice, 'TTChung') || invoice;
  const seller = findFirst(invoice, 'NBan') || null;
  const buyer = findFirst(invoice, 'NMua') || null;
  const totals = findFirst(invoice, 'TToan') || null;
  const itemList = findFirst(invoice, 'DSHHDVu') || null;
  const items = getChildrenByName(itemList, 'HHDVu').map((item, index) => ({
    index: getText(item, 'STT') || String(index + 1),
    code: getText(item, 'MHHDVu'),
    name: getText(item, 'THHDVu') || getText(item, 'Ten'),
    unit: getText(item, 'DVTinh'),
    quantity: getText(item, 'SLuong'),
    price: getText(item, 'DGia'),
    amount: getText(item, 'ThTien'),
    taxRate: getText(item, 'TSuat') || getText(item, 'TSThue'),
    taxAmount: getText(item, 'TThue'),
  }));

  return {
    title: getText(general, 'THDon') || 'Hóa đơn điện tử',
    formNo: getText(general, 'KHMSHDon'),
    serial: getText(general, 'KHHDon'),
    invoiceNo: getText(general, 'SHDon'),
    date: getText(general, 'NLap'),
    currency: getText(general, 'DVTTe'),
    seller: {
      name: getText(seller, 'Ten'),
      taxId: getText(seller, 'MST'),
      address: getText(seller, 'DChi'),
      phone: getText(seller, 'SDThoai'),
      bankAccount: getText(seller, 'STKNHang'),
      bankName: getText(seller, 'TNHang'),
    },
    buyer: {
      name: getText(buyer, 'Ten'),
      taxId: getText(buyer, 'MST'),
      address: getText(buyer, 'DChi'),
      phone: getText(buyer, 'SDThoai'),
      paymentMethod: getText(buyer, 'HTTToan') || getText(general, 'HTTToan'),
    },
    totals: {
      beforeTax: getText(totals, 'TgTCThue') || getText(totals, 'TgTThue'),
      tax: getText(totals, 'TgTThue'),
      total: getText(totals, 'TgTTTBSo') || getText(totals, 'TgTToan'),
      totalText: getText(totals, 'TgTTTBChu'),
    },
    extraInfo: [],
    quantityLabel: 'Số lượng',
    items,
  };
}

function XmlSourceView({ xmlText }) {
  return (
    <div className="h-full overflow-auto bg-slate-50 p-4 dark:bg-slate-950">
      <pre className="min-h-full rounded-lg border border-slate-200 bg-white p-4 font-mono text-sm leading-7 text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        {xmlText}
      </pre>
    </div>
  );
}

function XmlVisualView({ xmlText }) {
  const data = parseInvoiceXml(xmlText);
  if (data.error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm font-semibold text-rose-700">
        {data.error}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl rounded-sm bg-white p-8 text-slate-950 shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-5 border-b-2 border-slate-900 pb-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <p className="text-sm font-bold uppercase">{data.seller.name || 'Đơn vị bán hàng'}</p>
            <p className="mt-1 text-xs">Mã số thuế: {data.seller.taxId || '-'}</p>
            <p className="mt-1 text-xs">Địa chỉ: {data.seller.address || '-'}</p>
            {data.seller.phone && <p className="mt-1 text-xs">Điện thoại: {data.seller.phone}</p>}
            {(data.seller.bankAccount || data.seller.bankName) && (
              <p className="mt-1 text-xs">Tài khoản: {data.seller.bankAccount || '-'} {data.seller.bankName || ''}</p>
            )}
          </div>
          <div className="text-xs md:text-right">
            <p>Mẫu số: <span className="font-bold">{data.formNo || '-'}</span></p>
            <p>Ký hiệu: <span className="font-bold">{data.serial || '-'}</span></p>
            <p>Số: <span className="font-bold">{data.invoiceNo || '-'}</span></p>
          </div>
        </div>

        <div className="py-6 text-center">
          <h3 className="text-2xl font-bold uppercase tracking-wide">{data.title}</h3>
          <p className="mt-2 text-sm">Ngày {formatDate(data.date)}</p>
        </div>

        <div className="grid gap-2 border-y border-slate-300 py-4 text-sm">
          <p><span className="font-semibold">Tên người mua hàng:</span> {data.buyer.name || '-'}</p>
          <p><span className="font-semibold">Mã số thuế:</span> {data.buyer.taxId || '-'}</p>
          <p><span className="font-semibold">Địa chỉ:</span> {data.buyer.address || '-'}</p>
          <p><span className="font-semibold">Hình thức thanh toán:</span> {data.buyer.paymentMethod || '-'} <span className="ml-4 font-semibold">Đồng tiền:</span> {data.currency || 'VND'}</p>
          {data.extraInfo?.map(([label, value]) => (
            <p key={label}><span className="font-semibold">{label}:</span> {value}</p>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-900 px-2 py-2">STT</th>
                <th className="border border-slate-900 px-2 py-2">Tên hàng hóa, dịch vụ</th>
                <th className="border border-slate-900 px-2 py-2">Đơn vị</th>
                <th className="border border-slate-900 px-2 py-2">{data.quantityLabel || 'Số lượng'}</th>
                <th className="border border-slate-900 px-2 py-2">Đơn giá</th>
                <th className="border border-slate-900 px-2 py-2">Thành tiền</th>
                <th className="border border-slate-900 px-2 py-2">Thuế</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length > 0 ? data.items.map((item) => (
                <tr key={`${item.index}-${item.name}`}>
                  <td className="border border-slate-900 px-2 py-2 text-center">{item.index}</td>
                  <td className="border border-slate-900 px-2 py-2">
                    <p className="font-semibold">{item.name || '-'}</p>
                    {item.code && <p className="mt-0.5 text-xs text-slate-500">{item.code}</p>}
                  </td>
                  <td className="border border-slate-900 px-2 py-2 text-center">{item.unit || '-'}</td>
                  <td className="border border-slate-900 px-2 py-2 text-right">{formatMaybeNumber(item.quantity)}</td>
                  <td className="border border-slate-900 px-2 py-2 text-right">{formatNumber(item.price)}</td>
                  <td className="border border-slate-900 px-2 py-2 text-right">{formatNumber(item.amount)}</td>
                  <td className="border border-slate-900 px-2 py-2 text-center">{item.taxRate || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="border border-slate-900 px-2 py-8 text-center text-slate-500">Không có dòng hàng hóa.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-5 max-w-md space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span>Cộng tiền hàng:</span><span className="font-bold">{formatNumber(data.totals.beforeTax)}</span></div>
          <div className="flex justify-between gap-4"><span>Tiền thuế:</span><span className="font-bold">{formatNumber(data.totals.tax)}</span></div>
          <div className="flex justify-between gap-4 border-t border-slate-300 pt-2 text-base"><span>Tổng thanh toán:</span><span className="font-bold">{formatNumber(data.totals.total)}</span></div>
        </div>
        {data.totals.totalText && (
          <p className="mt-5 border-t border-slate-300 pt-3 text-sm"><span className="font-semibold">Số tiền bằng chữ:</span> {data.totals.totalText}</p>
        )}
      </div>
    </div>
  );
}

export default function FilePreviewModal({ filePreview, onClose }) {
  const [imageZoom, setImageZoom] = useState(1);
  const [xmlMode, setXmlMode] = useState('source');
  const kind = filePreview ? getPreviewKind(filePreview.filename) : null;

  useEffect(() => {
    setImageZoom(1);
    setXmlMode('source');
  }, [filePreview?.previewUrl]);

  if (!filePreview) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
      onClick={onClose}
    >
      <div
        className="flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 sm:h-[92vh] sm:rounded-xl sm:border sm:border-slate-200 sm:dark:border-slate-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800 sm:px-4">
          <div className="min-w-0">
            <h2 id="file-preview-title" className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
              {filePreview.filename}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {kind === 'xml' && (
              <div className="flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {[
                  ['source', 'Mã nguồn'],
                  ['view', 'View'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setXmlMode(value)}
                    className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                      xmlMode === value
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {kind === 'image' && (
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setImageZoom((zoom) => Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Thu nhỏ"
                  aria-label="Thu nhỏ ảnh"
                >
                  <Minus size={15} />
                </button>
                <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  {Math.round(imageZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setImageZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Phóng to"
                  aria-label="Phóng to ảnh"
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom(1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Về 100%"
                  aria-label="Đưa ảnh về 100%"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Đóng xem file"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-white dark:bg-slate-950">
          {kind === 'image' && (
            <div className="h-full overflow-auto bg-slate-950 p-4">
              <div className="flex min-h-full items-center justify-center">
                <img
                  src={filePreview.previewUrl}
                  alt={filePreview.filename}
                  className="max-w-none object-contain shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
                  style={{
                    width: `${imageZoom * 100}%`,
                    maxHeight: imageZoom <= 1 ? '100%' : 'none',
                  }}
                />
              </div>
            </div>
          )}
          {kind === 'xml' && (
            xmlMode === 'source'
              ? <XmlSourceView xmlText={filePreview.xmlText || ''} />
              : <XmlVisualView xmlText={filePreview.xmlText || ''} />
          )}
          {kind === 'iframe' && (
            <iframe
              src={filePreview.previewUrl}
              title={filePreview.filename}
              className="h-full w-full border-0 bg-white"
            />
          )}
          {kind === 'unsupported' && (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <FileText size={32} className="mx-auto text-slate-400" />
                <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">Không thể xem trước định dạng này</p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Trình duyệt không hỗ trợ xem trực tiếp file này trong popup. Bạn vẫn có thể tải file gốc để kiểm tra.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
