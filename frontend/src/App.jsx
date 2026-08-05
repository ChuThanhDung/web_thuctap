import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import ReconciliationList from './pages/ReconciliationList.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import UploadQueue from './pages/UploadQueue.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import ThresholdConfig from './pages/ThresholdConfig.jsx';

const AUTH_STORAGE_KEY = 'docusync_auth';

function getInitialAuth() {
  try {
    const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return storedAuth ? JSON.parse(storedAuth) : null;
  } catch {
    return null;
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
  const [auth, setAuth] = useState(getInitialAuth);

  function handleLogin(nextAuth) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
    setAuth(nextAuth);
  }

  function handleLogout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuth(null);
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
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={auth.user}
        onLogout={handleLogout}
      />

      <main
        className={`flex-1 transition-all duration-200 ${
          sidebarCollapsed ? 'ml-[68px]' : 'ml-[240px]'
        }`}
      >
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Routes>
            <Route path="/" element={<Navigate to={homePath} replace />} />
            <Route path="/login" element={<Navigate to={homePath} replace />} />
            <Route path="/accountant" element={<ReconciliationList />} />
            <Route
              path="/manager"
              element={
                <RoleRoute allowedRole="chief_accountant" currentRole={role} redirectTo={homePath}>
                  <Dashboard />
                </RoleRoute>
              }
            />
            <Route path="/case/:id" element={<CaseDetail />} />
            <Route
              path="/upload"
              element={
                <RoleRoute allowedRole="accountant" currentRole={role} redirectTo={homePath}>
                  <UploadQueue />
                </RoleRoute>
              }
            />
            <Route path="/audit-trail" element={<AuditTrail />} />
            <Route
              path="/settings"
              element={
                <RoleRoute allowedRole="chief_accountant" currentRole={role} redirectTo={homePath}>
                  <ThresholdConfig />
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
