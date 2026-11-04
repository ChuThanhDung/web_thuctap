import React from 'react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { canInvestigate } from '../components/AgentInvestigate.jsx';
import { canDraftSupplierEmail } from '../components/SupplierEmailComposer.jsx';
import AssistantPanel from '../components/AssistantPanel.jsx';

afterEach(() => vitest.unstubAllGlobals());

describe('assistant entry points', () => {
  it('offers investigation only on unapproved batches that look wrong', () => {
    expect(canInvestigate({ rawStatus: 'ready', reconciliationStatus: 'major_diff' })).toBe(true);
    expect(canInvestigate({ rawStatus: 'ready', foreignCopy: { copy: 'grn' } })).toBe(true);
    expect(canInvestigate({ rawStatus: 'ready', reconciliationStatus: 'matched' })).toBe(false);
    expect(canInvestigate({ rawStatus: 'approved', reconciliationStatus: 'major_diff' })).toBe(false);
  });

  it('offers a supplier letter for real differences, not for a misfiled copy', () => {
    expect(canDraftSupplierEmail({ reconciliationStatus: 'minor_diff' })).toBe(true);
    expect(canDraftSupplierEmail({ reconciliationStatus: 'major_diff', foreignCopy: { copy: 'grn' } })).toBe(false);
    expect(canDraftSupplierEmail({ reconciliationStatus: 'matched' })).toBe(false);
  });
});

describe('AssistantPanel', () => {
  it('asks a suggested question and links batch numbers in the answer', async () => {
    const fetchMock = vitest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ answer: 'Bộ BATCH_01 chờ lâu nhất.', batches: [{ batch_number: 'BATCH_01', id: 7 }] }),
    }));
    vitest.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AssistantPanel token="t" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hỏi trợ lý' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bộ nào đang chờ duyệt lâu nhất?' }));
    const link = await screen.findByRole('link', { name: 'BATCH_01' });
    expect(link).toHaveAttribute('href', '/audit-trail?batchId=7');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: 'user', content: 'Bộ nào đang chờ duyệt lâu nhất?' }]);
  });
});
