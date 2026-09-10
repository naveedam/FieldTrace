import React from 'react';
import { Link } from 'react-router-dom';
import { QrCode, Armchair, Smartphone, Cloud, LayoutDashboard } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-dvh bg-ink text-paper safe-top safe-bottom">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center border-2 border-amber">
            <QrCode size={16} className="text-amber" />
          </div>
          <span className="font-bold tracking-tight">FieldTrace</span>
        </div>
        <Link
          to="/login"
          className="tap-target flex items-center gap-2 border-2 border-line px-4 py-2 text-sm font-semibold"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Digital Handover &amp; Facility Operations
        </h1>
        <p className="mt-4 max-w-xl text-base text-line sm:text-lg">
          Transforming commercial workspaces into living digital twins &mdash; every asset gets a QR code, a real
          record, and a full history from install to exit.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/login"
            className="tap-target flex items-center justify-center gap-2 border-2 border-amber bg-amber px-6 py-3 font-semibold text-ink"
          >
            Get started
          </Link>
          <a
            href="#how-it-works"
            className="tap-target flex items-center justify-center gap-2 border-2 border-line px-6 py-3 font-semibold text-paper"
          >
            How it works
          </a>
        </div>
      </main>

      <section id="how-it-works" className="border-t-2 border-ink-600 bg-paper px-6 py-14 text-ink sm:px-10">
        <div className="mx-auto max-w-4xl">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-amber-600">
            How it works
          </p>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {[
              { icon: Armchair, label: 'Physical Asset' },
              { icon: QrCode, label: 'QR Code' },
              { icon: Smartphone, label: 'Mobile Scan' },
              { icon: Cloud, label: 'Cloud Record' }
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center border-2 border-ink bg-amber">
                  <Icon size={24} className="text-ink" />
                </div>
                <p className="text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-12 text-center text-ink sm:px-10">
        <LayoutDashboard size={24} className="mx-auto mb-3 text-amber-600" />
        <p className="mx-auto max-w-md text-sm text-ink-600">
          Field staff scan and go &mdash; no login, no app to install. Facility teams get a dashboard, provisioning,
          and a storekeeper gate that keeps every parts exchange auditable.
        </p>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-line">
        This app runs from QR anchors on-site &mdash; scan a zone or asset tag to get started in the field.
      </footer>
    </div>
  );
}
