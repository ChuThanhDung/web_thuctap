import React from 'react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeletionBanner from '../components/DeletionBanner.jsx';
import { LEGAL_DOCUMENTS, fillLegalText } from '../legal/content.js';
import LegalPage from '../pages/LegalPage.jsx';

const INFO = {
  terms_version: '2026-11-04',
  operator_name: 'Nhà cung cấp Thử',
  contact_email: 'lien-he@example.com',
  server_location: 'Google Cloud, Singapore',
  ai_providers: ['OpenAI (Hoa Kỳ)'],
};

afterEach(() => vitest.unstubAllGlobals());

describe('legal pages', () => {
  it('fills operator, contact, server and AI provider into the text', () => {
    const text = fillLegalText('{operator} · {email} · {server} · {ai}', INFO);
    expect(text).toBe('Nhà cung cấp Thử · lien-he@example.com · Google Cloud, Singapore · OpenAI (Hoa Kỳ)');
    // Không còn chỗ trống chưa thay trong văn bản.
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      const all = [doc.intro, ...doc.sections.flatMap((section) => [section.heading, ...section.items])].join(' ');
      expect(fillLegalText(all, INFO)).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('shows the privacy policy with the version and the cross-border disclosure', async () => {
    vitest.stubGlobal('fetch', vitest.fn(async () => ({ ok: true, status: 200, json: async () => INFO })));
    render(
      <MemoryRouter>
        <LegalPage document="privacy" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Chính sách bảo vệ dữ liệu cá nhân' })).toBeInTheDocument();
    expect(await screen.findByText('Phiên bản 04/11/2026')).toBeInTheDocument();
    expect(screen.getByText(/Máy chủ và cơ sở dữ liệu đặt tại Google Cloud, Singapore/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'lien-he@example.com' })).toHaveAttribute('href', 'mailto:lien-he@example.com');
  });

  it('warns the company before its data is deleted', () => {
    const { rerender } = render(
      <MemoryRouter>
        <DeletionBanner organization={{ deletion_scheduled_for: null }} canManage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <MemoryRouter>
        <DeletionBanner organization={{ deletion_scheduled_for: '2026-12-04T08:00:00Z' }} canManage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('04/12/2026');
    expect(screen.getByRole('link', { name: 'Tải dữ liệu hoặc hủy yêu cầu' })).toBeInTheDocument();
  });
});
