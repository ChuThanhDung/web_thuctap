// Tìm liên nào khác các liên còn lại, không mặc định liên nào đúng.
// Giao diện không biết bản nào đọc sai (PO và GRN cũng có thể sai), nên chỉ nêu sự thật: liên nào khác.

export const COPY_LABELS = { po: 'PO', invoice: 'HĐ', grn: 'GRN' };

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '' || String(value).trim() === '-';

/**
 * values: { po, invoice, grn } (đã chuẩn hóa để so sánh). Trả về danh sách khóa cần tô:
 * - hai liên khớp nhau, một liên khác: chỉ liên khác;
 * - không có cặp nào khớp: mọi liên có giá trị.
 */
export function findOddCopies(values) {
  const present = Object.keys(COPY_LABELS).filter((key) => !isEmpty(values[key]));
  const groups = new Map();
  present.forEach((key) => {
    const value = String(values[key]);
    groups.set(value, [...(groups.get(value) || []), key]);
  });
  if (groups.size <= 1) return [];
  const sizes = [...groups.values()].map((keys) => keys.length);
  const largest = Math.max(...sizes);
  if (largest >= 2 && sizes.filter((size) => size === largest).length === 1) {
    return present.filter((key) => groups.get(String(values[key])).length < largest);
  }
  return present;
}

/** Câu trung tính: "HĐ khác PO và GRN", "PO và HĐ khác nhau", "Ba liên khác nhau". */
export function describeOdd(odd, values) {
  const present = Object.keys(COPY_LABELS).filter((key) => !isEmpty(values[key]));
  if (odd.length === 1) {
    const others = present.filter((key) => key !== odd[0]).map((key) => COPY_LABELS[key]);
    return `${COPY_LABELS[odd[0]]} khác ${others.join(' và ')}`;
  }
  if (present.length === 3) return 'Ba liên khác nhau';
  return `${present.map((key) => COPY_LABELS[key]).join(' và ')} khác nhau`;
}
