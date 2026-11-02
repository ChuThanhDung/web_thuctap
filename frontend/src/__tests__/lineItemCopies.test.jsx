import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import LineItemCopies from '../components/LineItemCopies.jsx';

const matched = (sku) => ({
  sku, name: `Hàng ${sku}`, unit: 'Cái', severity: 'ok', qtySeverity: 'ok', priceSeverity: 'ok', amountSeverity: 'ok',
  poQty: '1', invoiceQty: '1', grnQty: '1', poPrice: '100', invoicePrice: '100', grnPrice: '100', poAmount: '100', invoiceAmount: '100', grnAmount: '100',
});
const onlyGrn = (sku) => ({
  sku, name: `GRN ${sku}`, unit: 'Cái', severity: 'warning', qtySeverity: 'warning', priceSeverity: 'warning', amountSeverity: 'warning',
  poQty: '-', invoiceQty: '-', grnQty: '2', poPrice: '-', invoicePrice: '-', grnPrice: '50', poAmount: '-', invoiceAmount: '-', grnAmount: '100',
});

describe('LineItemCopies', () => {
  it('collapses matched items into one expandable line', async () => {
    render(<LineItemCopies items={[matched('A'), matched('B')]} emptyText="" />);
    const toggle = screen.getByRole('button', { name: /2 mặt hàng khớp cả ba liên/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hàng A')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText('Hàng A')).toBeInTheDocument();
  });

  it('groups items present in only one copy and names that copy', () => {
    render(<LineItemCopies items={[onlyGrn('X'), onlyGrn('Y'), onlyGrn('Z')]} emptyText="" />);
    expect(screen.getByRole('button', { name: /3 mặt hàng chỉ có ở GRN/ })).toBeInTheDocument();
  });
});
