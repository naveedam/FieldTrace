import React from 'react';
import { Link } from 'react-router-dom';
import {
  QrCode, Armchair, Smartphone, Cloud, BarChart3, LayoutDashboard, Building2,
  PackagePlus, PackageCheck, ShieldCheck, Zap, ArrowRight
} from 'lucide-react';

const MODULES = [
  { icon: LayoutDashboard, title: 'Dashboard', desc: 'Burn alerts, live inventory, and tickets at a glance.' },
  { icon: Building2, title: 'Sites & Spaces', desc: 'Your building modeled as a real digital twin.' },
  { icon: PackagePlus, title: 'Asset Provisioning', desc: 'Floor plan in, registered assets and QR labels out.' },
  { icon: PackageCheck, title: 'Storekeeper Gate', desc: 'Nothing leaves the shelf without a verified approval.' }
];

const FLOW = [
  { icon: Armchair, label: 'Physical Asset' },
  { icon: QrCode, label: 'QR Code' },
  { icon: Smartphone, label: 'Mobile Scan' },
  { icon: Cloud, label: 'Cloud Record' },
  { icon: BarChart3, label: 'Live Insight' }
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-ink text-paper">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-amber/10 blur-3xl" />
      </div>

      <header className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center border-2 border-amber">
            <QrCode size={16} className="text-amber" />
          </div>
          <span className="font-bold tracking-tight">FieldTrace</span>
        </div>
        <Link
          to="/login"
          className="tap-target flex items-center gap-2 border-2 border-line px-4 py-2 text-sm font-semibold hover:border-amber hover:text-amber transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <span className="mb-5 inline-flex items-center gap-1.5 border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber">
          <Zap size={12} /> Digital handover, done right
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Digital Handover &amp; Facility Operations
        </h1>
        <p className="mt-5 max-w-xl text-base text-line sm:text-lg">
          Transforming commercial workspaces into living digital twins — every asset gets a QR code, a real
          record, and a full history from install to exit.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/login"
            className="tap-target group flex items-center justify-center gap-2 border-2 border-amber bg-amber px-7 py-3 font-semibold text-ink transition-transform hover:scale-[1.02]"
          >
            Get started
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how-it-works"
            className="tap-target flex items-center justify-center gap-2 border-2 border-line px-7 py-3 font-semibold text-paper hover:border-line/70"
          >
            See how it works
          </a>
        </div>

        <div className="mt-14 flex items-center gap-2 text-xs text-line/70">
          <ShieldCheck size={14} /> No app to install for field staff — scan a QR code and go.
        </div>
      </main>

      <section id="how-it-works" className="border-t-2 border-ink-600 bg-paper px-6 py-16 text-ink sm:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="mb-10 text-center text-xs font-semibold uppercase tracking-widest text-amber-600">
            How it works
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-5">
            {FLOW.map(({ icon: Icon, label }, i) => (
              <div key={label} className="relative flex flex-col items-center gap-3 text-center">
                {i < FLOW.length - 1 && (
                  <div className="absolute left-[calc(50%+2rem)] top-7 hidden h-px w-[calc(100%-2rem)] bg-line sm:block" />
                )}
                <div className="relative z-10 flex h-14 w-14 items-center justify-center border-2 border-ink bg-amber">
                  <Icon size={24} className="text-ink" />
                </div>
                <p className="text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-16 text-ink sm:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="mb-10 text-center text-xs font-semibold uppercase tracking-widest text-amber-600">
            One operational loop
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="border-2 border-line bg-paper p-5 transition-colors hover:border-ink">
                <div className="mb-3 flex h-10 w-10 items-center justify-center border-2 border-ink bg-amber">
                  <Icon size={18} className="text-ink" />
                </div>
                <h3 className="font-bold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t-2 border-line bg-ink px-6 py-16 text-center text-paper sm:px-10">
        <h2 className="text-2xl font-bold sm:text-3xl">Ready to see it on your own floor plan?</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-line">
          Sign in to provision a site, or create a new organization for your company in a couple of minutes.
        </p>
        <Link
          to="/login"
          className="tap-target mt-7 inline-flex items-center gap-2 border-2 border-amber bg-amber px-7 py-3 font-semibold text-ink"
        >
          Get started <ArrowRight size={16} />
        </Link>
      </section>

      <footer className="bg-ink px-6 py-8 text-center text-xs text-line/70">
        This app also runs from QR anchors on-site — scan a zone or asset tag to get started in the field.
      </footer>
    </div>
  );
}
