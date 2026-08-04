import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ReconciliationList from './pages/ReconciliationList';
import CaseDetail from './pages/CaseDetail';
import Dashboard from './pages/Dashboard';
import UploadQueue from './pages/UploadQueue';
import AuditTrail from './pages/AuditTrail';
import ThresholdConfig from './pages/ThresholdConfig';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [role, setRole] = useState('accountant'); // 'accountant' | 'manager'

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        role={role}
        onRoleChange={setRole}
      />

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-200 ${
          sidebarCollapsed ? 'ml-[68px]' : 'ml-[240px]'
        }`}
      >
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Routes>
            <Route path="/" element={<ReconciliationList />} />
            <Route path="/case/:id" element={<CaseDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<UploadQueue />} />
            <Route path="/audit-trail" element={<AuditTrail />} />
            <Route path="/settings" element={<ThresholdConfig />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
