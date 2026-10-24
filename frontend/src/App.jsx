import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppHeader from './components/AppHeader.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import AccountantOverview from './pages/AccountantOverview.jsx';
import ChiefOverview from './pages/ChiefOverview.jsx';
import UploadQueue from './pages/UploadQueue.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import ChiefAccountantBatches from './pages/ChiefAccountantBatches.jsx';
import ThresholdConfig from './pages/ThresholdConfig.jsx';
import UserManagement from './pages/UserManagement.jsx';
import StyleGuide from './pages/StyleGuide.jsx';
import { vi } from './i18n/vi.js';
import useMediaQuery from './lib/useMediaQuery.js';
import { ROUTES } from './routes.js';
import { invalidateBatchCache } from './services/batchCache.js';
import { repairTextDeep } from './text.js';
import { cn, useToast } from './ui/index.js';

const AUTH_STORAGE_KEY = 'docusync_auth';
const THEME_STORAGE_KEY = 'docusync_theme';
// Trang mẫu giao diện chỉ có khi chạy dev hoặc build với VITE_STYLEGUIDE=true.
const SHOW_STYLEGUIDE = import.meta.env.DEV || import.meta.env.VITE_STYLEGUIDE === 'true';

function getInitialAuth() {
  try {
    const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return storedAuth ? repairTextDeep(JSON.parse(storedAuth)) : null;
  } catch {
    return null;
  }
}

function getInitialTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  } catch {
    return 'light';
  }
}

function getHomePath() {
  return ROUTES.overview;
}

function RoleRoute({ allowedRole, currentRole, redirectTo, children }) {
  return currentRole === allowedRole ? children : <Navigate to={redirectTo} replace />;
}

export default function App() {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [auth, setAuth] = useState(getInitialAuth);
  const [theme, setTheme] = useState(getInitialTheme);

  // < 768px: menu trượt. 768–1023px: thanh bên chỉ icon. ≥ 1024px: mở rộng, người dùng có thể thu gọn.
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const useDrawer = !isTablet;
  const compactSidebar = isTablet && (!isDesktop || sidebarCollapsed);

  // Tự động logout khi token hết hạn
  useEffect(() => {
    function handleUnauthorized() {
      if (auth) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        invalidateBatchCache();
        setAuth(null);
        toast.warning(vi.shell.sessionExpired);
      }
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [auth, toast]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Trình duyệt chặn lưu trữ: giao diện vẫn đổi, chỉ không nhớ lần sau.
    }
  }, [theme]);

  // Đổi kích thước từ màn hình hẹp sang rộng thì đóng menu trượt còn mở.
  useEffect(() => {
    if (!useDrawer) setMobileMenuOpen(false);
  }, [useDrawer]);

  function handleToggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function handleLogin(nextAuth) {
    const repairedAuth = repairTextDeep(nextAuth);
    invalidateBatchCache();
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(repairedAuth));
    setAuth(repairedAuth);
  }

  function handleLogout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    invalidateBatchCache();
    setAuth(null);
  }

  function handleUserUpdate(nextUser) {
    setAuth((currentAuth) => {
      if (!currentAuth) {
        return currentAuth;
      }

      const nextAuth = repairTextDeep({ ...currentAuth, user: nextUser });
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      return nextAuth;
    });
  }

  if (!auth) {
    return (
      <Routes>
        <Route path={ROUTES.login} element={<Login onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to={ROUTES.login} replace />} />
      </Routes>
    );
  }

  const role = auth.user.role;
  const homePath = getHomePath(role);

  return (
    <div className="min-h-screen bg-canvas text-fg transition-colors duration-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-fg"
      >
        {vi.shell.skipToContent}
      </a>

      <Sidebar
        drawer={useDrawer}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        compact={compactSidebar}
        canToggle={isDesktop}
        onToggleCompact={() => setSidebarCollapsed((collapsed) => !collapsed)}
        token={auth.access_token}
        user={auth.user}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-col transition-[margin] duration-200',
          useDrawer ? 'ml-0' : compactSidebar ? 'ml-[68px]' : 'ml-[260px]',
        )}
      >
        {useDrawer && (
          <AppHeader token={auth.access_token} menuOpen={mobileMenuOpen} onOpenMenu={() => setMobileMenuOpen(true)} />
        )}
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 focus:outline-none md:px-6 md:py-6">
          <Routes>
            <Route path="/" element={<Navigate to={homePath} replace />} />
            <Route path={ROUTES.login} element={<Navigate to={homePath} replace />} />
            <Route
              path={ROUTES.overview}
              element={
                role === 'chief_accountant' ? (
                  <ChiefOverview token={auth.access_token} />
                ) : (
                  <AccountantOverview token={auth.access_token} role={role} />
                )
              }
            />
            <Route
              path={ROUTES.upload}
              element={
                <RoleRoute allowedRole="accountant" currentRole={role} redirectTo={homePath}>
                  <UploadQueue token={auth.access_token} />
                </RoleRoute>
              }
            />
            <Route
              path={ROUTES.batches}
              element={
                role === 'chief_accountant' ? (
                  <ChiefAccountantBatches token={auth.access_token} />
                ) : (
                  <AuditTrail token={auth.access_token} role={role} currentUser={auth.user} />
                )
              }
            />
            <Route
              path={ROUTES.users}
              element={
                <RoleRoute allowedRole="chief_accountant" currentRole={role} redirectTo={homePath}>
                  <UserManagement token={auth.access_token} currentUser={auth.user} />
                </RoleRoute>
              }
            />
            <Route
              path={ROUTES.settings}
              element={
                <RoleRoute allowedRole="chief_accountant" currentRole={role} redirectTo={homePath}>
                  <ThresholdConfig token={auth.access_token} />
                </RoleRoute>
              }
            />
            {SHOW_STYLEGUIDE && <Route path={ROUTES.styleguide} element={<StyleGuide />} />}
            <Route path="*" element={<Navigate to={homePath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
