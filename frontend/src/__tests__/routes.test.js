import { describe, expect, it } from 'vitest';
import { ROUTES, batchDetail, batchesWithStatus } from '../routes.js';
import { getNavItems } from '../lib/nav.js';

describe('routes', () => {
  it('builds deep links from the single source of truth', () => {
    expect(batchDetail(7)).toBe(`${ROUTES.batches}?batchId=7`);
    expect(batchesWithStatus('rejected')).toBe(`${ROUTES.batches}?status=rejected`);
  });

  it('gives each role the same menu paths the app defines', () => {
    expect(getNavItems('accountant').map((item) => item.to)).toEqual([ROUTES.overview, ROUTES.upload, ROUTES.batches]);
    expect(getNavItems('chief_accountant').map((item) => item.to)).toEqual([
      ROUTES.overview,
      ROUTES.batches,
      ROUTES.users,
      ROUTES.settings,
    ]);
  });
});
