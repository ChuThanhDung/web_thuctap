import { vi } from '../i18n/vi.js';
import { ROUTES } from '../routes.js';

const ITEMS = {
  overview: { to: ROUTES.overview, icon: 'overview', label: vi.nav.overview },
  upload: { to: ROUTES.upload, icon: 'upload', label: vi.nav.upload },
  batches: { to: ROUTES.batches, icon: 'batches', label: vi.nav.batches },
  users: { to: ROUTES.users, icon: 'users', label: vi.nav.users },
  settings: { to: ROUTES.settings, icon: 'settings', label: vi.nav.settings },
};

const MENUS = {
  accountant: ['overview', 'upload', 'batches'],
  chief_accountant: ['overview', 'batches', 'users', 'settings'],
};

/** Mục menu của một vai trò, theo đúng thứ tự hiển thị. */
export function getNavItems(role) {
  return (MENUS[role] || MENUS.accountant).map((key) => ITEMS[key]);
}
