import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrialBanner, { trialDaysLeft } from '../components/TrialBanner.jsx';

const NOW = new Date('2026-11-04T08:00:00Z');
const inDays = (days) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

describe('trial banner', () => {
  it('counts the remaining trial days, rounding up', () => {
    expect(trialDaysLeft({ plan: 'free', effective_plan: 'pro', trial_ends_at: inDays(13.2) }, NOW)).toBe(14);
    expect(trialDaysLeft({ plan: 'free', effective_plan: 'pro', trial_ends_at: inDays(0.1) }, NOW)).toBe(1);
  });

  it('shows nothing once the trial is over or when the paid plan is already as high', () => {
    expect(trialDaysLeft({ plan: 'free', effective_plan: 'free', trial_ends_at: inDays(-1) }, NOW)).toBe(0);
    expect(trialDaysLeft({ plan: 'ultra', effective_plan: 'ultra', trial_ends_at: inDays(5) }, NOW)).toBe(0);
    expect(trialDaysLeft(null, NOW)).toBe(0);
    const { container } = render(<TrialBanner organization={{ plan: 'pro', effective_plan: 'pro' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells the company which plan it returns to', () => {
    render(<TrialBanner organization={{ plan: 'free', effective_plan: 'pro', trial_ends_at: inDays(400) }} />);
    expect(screen.getByText(/Đang dùng thử gói Pro/)).toBeInTheDocument();
    expect(screen.getByText(/chuyển về gói Free/)).toBeInTheDocument();
  });
});
