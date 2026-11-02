import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ApprovalConfirmBody from '../components/ApprovalConfirmBody.jsx';

const batch = (overrides = {}) => ({
  batchNumber: 'BATCH_01',
  supplierName: 'NCC A',
  rawStatus: 'ready',
  matchRate: 100,
  mismatchFields: 0,
  minorFields: 0,
  ...overrides,
});

describe('ApprovalConfirmBody', () => {
  it('says the batch is accepted with a rounding difference when it is a minor difference', () => {
    render(<ApprovalConfirmBody batch={batch({ minorFields: 1 })} />);
    expect(screen.getByText('Lệch nhỏ (làm tròn)')).toBeInTheDocument();
    expect(screen.getByText(/trong ngưỡng làm tròn 1.000 đ/)).toBeInTheDocument();
  });

  it('trusts the backend minor_diff verdict', () => {
    render(<ApprovalConfirmBody batch={batch({ reconciliationStatus: 'minor_diff' })} />);
    expect(screen.getByText(/Duyệt nghĩa là chấp nhận chênh lệch này/)).toBeInTheDocument();
  });

  it('shows no rounding note for a fully matched batch', () => {
    render(<ApprovalConfirmBody batch={batch()} />);
    expect(screen.getByText('Ba liên khớp')).toBeInTheDocument();
    expect(screen.queryByText(/Duyệt nghĩa là chấp nhận chênh lệch này/)).not.toBeInTheDocument();
  });
});
