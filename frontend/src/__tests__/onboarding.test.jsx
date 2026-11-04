import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OnboardingChecklist from '../components/OnboardingChecklist.jsx';

const accountant = { role: 'accountant', organization: { id: 'org-test' } };

function renderChecklist(batches) {
  return render(
    <MemoryRouter>
      <OnboardingChecklist token="t" user={accountant} batches={batches} />
    </MemoryRouter>,
  );
}

describe('onboarding checklist', () => {
  it('offers the sample set to a new accountant and ticks steps from real data', () => {
    const { unmount } = renderChecklist([]);
    expect(screen.getByRole('heading', { name: 'Bắt đầu với DocuSync' })).toBeInTheDocument();
    expect(screen.getByText(/Còn 2 \/ 2 việc/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hóa đơn/ })).toHaveAttribute('href', '/bo-mau/3-hoa-don.xml');
    unmount();

    renderChecklist([{ id: 1, status: 'ready' }]);
    expect(screen.getByText(/Còn 1 \/ 2 việc/)).toBeInTheDocument();
  });

  it('disappears when everything is done or when dismissed', () => {
    const { container, unmount } = renderChecklist([{ id: 1, status: 'final_approved' }]);
    expect(container).toBeEmptyDOMElement();
    unmount();

    renderChecklist([]);
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn danh sách bắt đầu' }));
    expect(screen.queryByRole('heading', { name: 'Bắt đầu với DocuSync' })).toBeNull();
  });
});
