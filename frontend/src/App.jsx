import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Bot, Menu } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import ReconciliationList from './pages/ReconciliationList.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import UploadQueue from './pages/UploadQueue.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import ThresholdConfig from './pages/ThresholdConfig.jsx';
import { repairTextDeep } from './text.js';

const AUTH_STORAGE_KEY = 'docusync_auth';
const THEME_STORAGE_KEY = 'docusync_theme';

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

function getHomePath(role) {
  return role === 'chief_accountant' ? '/manager' : '/accountant';
}

function RoleRoute({ allowedRole, currentRole, redirectTo, children }) {
  return currentRole === allowedRole ? children : <Navigate to={redirectTo} replace />;
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [auth, setAuth] = useState(getInitialAuth);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleToggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function handleLogin(nextAuth) {
    const repairedAuth = repairTextDeep(nextAuth);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(repairedAuth));
    setAuth(repairedAuth);
  }

  function handleLogout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
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
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const role = auth.user.role;
  const homePath = getHomePath(role);

  return (
    <div className="flex min-h-screen bg-slate-50 transition-colors duration-200 dark:bg-[#0b0f19] dark:text-slate-100">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">Docusyncai</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">AI Đối soát chứng từ</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSidebarCollapsed(false);
            setMobileMenuOpen(true);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Mở menu điều hướng"
          aria-expanded={mobileMenuOpen}
        >
          <Menu size={24} />
        </button>
      </header>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        token={auth.access_token}
        user={auth.user}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main
        className={`min-w-0 flex-1 pt-16 transition-all duration-200 sm:ml-[68px] sm:pt-0 ${
          sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[260px]'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <Routes>
            <Route path="/" element={<Navigate to={homePath} replace />} />
            <Route path="/login" element={<Navigate to={homePath} replace />} />
            <Route path="/accountant" element={<ReconciliationList token={auth.access_token} />} />
            <Route
              path="/manager"
              element={
                <RoleRoute allowedRole="chief_accountant" currentRole={role} redirectTo={homePath}>
                  <Dashboard token={auth.access_token} />
                </RoleRoute>
              }
            />
            <Route path="/case/:id" element={<CaseDetail token={auth.access_token} role={role} />} />
            <Route
              path="/upload"
              element={
                <RoleRoute allowedRole="accountant" currentRole={role} redirectTo={homePath}>
                  <UploadQueue token={auth.access_token} />
                </RoleRoute>
              }
            />
            <Route path="/audit-trail" element={<AuditTrail token={auth.access_token} role={role} />} />
            <Route
              path="/settings"
              element={
                <RoleRoute allowedRole="chief_accountant" currentRole={role} redirectTo={homePath}>
                  <ThresholdConfig token={auth.access_token} />
                </RoleRoute>
              }
            />
            <Route path="*" element={<Navigate to={homePath} replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
