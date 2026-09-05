import React from 'react';
import { Link } from 'react-router-dom';
import { QrCode, LayoutDashboard } from 'lucide-react';

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink px-6 text-center text-paper safe-top safe-bottom">
      <div className="flex h-16 w-16 items-center justify-center border-2 border-amber">
        <QrCode size={32} className="text-amber" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">FieldTrace</h1>
        <p className="mt-2 max-w-xs text-sm text-line">
          This app runs from QR anchors on-site. Scan a zone or asset tag to log work — there's nothing to browse here.
        </p>
      </div>
      <Link
        to="/admin/dashboard"
        className="tap-target flex items-center gap-2 border-2 border-line px-5 py-2.5 text-sm font-semibold text-paper"
      >
        <LayoutDashboard size={16} />
        Facility manager dashboard
      </Link>
    </div>
  );
}
