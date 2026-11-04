import { vi } from '../i18n/vi.js';
import { ROUTES } from '../routes.js';

const ITEMS = {
  overview: { to: ROUTES.overview, icon: 'overview', label: vi.nav.overview },
  upload: { to: ROUTES.upload, icon: 'upload', label: vi.nav.upload },
  batches: { to: ROUTES.batches, icon: 'batches', label: vi.nav.batches },
  users: { to: ROUTES.users, icon: 'users', label: vi.nav.users },
  settings: { to: ROUTES.settings, icon: 'settings', label: vi.nav.settings },
  admin: { to: ROUTES.admin, icon: 'admin', label: vi.nav.admin },
  billing: { to: ROUTES.billing, icon: 'billing', label: vi.nav.billing },
  privacy: { to: ROUTES.privacy, icon: 'privacy', label: vi.nav.privacy },
  guide: { to: ROUTES.guide, icon: 'guide', label: vi.nav.guide },
};

const MENUS = {
  accountant: ['overview', 'upload', 'batches', 'guide'],
  chief_accountant: ['overview', 'batches', 'users', 'settings', 'billing', 'privacy', 'guide'],
  platform_admin: ['admin'],
};

/** Mục menu của một vai trò, theo đúng thứ tự hiển thị. */
export function getNavItems(role) {
  return (MENUS[role] || MENUS.accountant).map((key) => ITEMS[key]);
}
