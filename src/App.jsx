import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Scan from './pages/Scan.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import Reconciliation from './pages/admin/Reconciliation.jsx';
import QRGenerator from './pages/admin/QRGenerator.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/scan" element={<Scan />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="qr-batch" element={<QRGenerator />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
