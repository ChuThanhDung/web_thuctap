import { describe, expect, it } from 'vitest';
import { describeOdd, findOddCopies } from '../components/copyDiff.js';

describe('findOddCopies', () => {
  it('tô liên khác khi hai liên còn lại khớp nhau, kể cả khi liên khác là PO', () => {
    expect(findOddCopies({ po: '57510', invoice: '57510000', grn: '57510' })).toEqual(['invoice']);
    expect(findOddCopies({ po: '32', invoice: '32000', grn: '32000' })).toEqual(['po']);
  });

  it('tô mọi liên có giá trị khi không có cặp nào khớp', () => {
    expect(findOddCopies({ po: '1', invoice: '2', grn: '3' })).toEqual(['po', 'invoice', 'grn']);
    expect(findOddCopies({ po: '4750000', invoice: '4900000', grn: '' })).toEqual(['po', 'invoice']);
  });

  it('không tô gì khi các liên có giá trị đều khớp', () => {
    expect(findOddCopies({ po: '20', invoice: '20', grn: '' })).toEqual([]);
  });
});

describe('describeOdd', () => {
  it('nói trung tính liên nào khác, không quy lỗi', () => {
    expect(describeOdd(['invoice'], { po: 'a', invoice: 'b', grn: 'a' })).toBe('HĐ khác PO và GRN');
    expect(describeOdd(['po', 'invoice', 'grn'], { po: 'a', invoice: 'b', grn: 'c' })).toBe('Ba liên khác nhau');
    expect(describeOdd(['po', 'invoice'], { po: 'a', invoice: 'b', grn: '' })).toBe('PO và HĐ khác nhau');
  });
});
