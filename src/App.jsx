import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Scan from './pages/Scan.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';
import ClientPortalView from './pages/ClientPortalView.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import Reconciliation from './pages/admin/Reconciliation.jsx';
import Provisioning from './pages/admin/Provisioning.jsx';
import Sites from './pages/admin/Sites.jsx';
import Personnel from './pages/admin/Personnel.jsx';
import Gate from './pages/admin/Gate.jsx';
import ClientPortal from './pages/admin/ClientPortal.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/portal/:token" element={<ClientPortalView />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="provisioning" element={<Provisioning />} />
        <Route path="sites" element={<Sites />} />
        <Route path="personnel" element={<Personnel />} />
        <Route path="gate" element={<Gate />} />
        <Route path="client-portal" element={<ClientPortal />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
