import React from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-signal-red px-4 py-2 text-sm font-medium text-paper">
      <WifiOff size={16} />
      No connection — submissions will fail until you're back online.
    </div>
  );
}

export function StatusPill({ status }) {
  const map = {
    Active: 'bg-signal-green/15 text-signal-green border-signal-green/40',
    Maintenance: 'bg-amber/15 text-amber-600 border-amber/50',
    Scrapped: 'bg-ink-600/10 text-ink-600 border-ink-600/30',
    Missing: 'bg-signal-red/15 text-signal-red border-signal-red/40',
    Open: 'bg-signal-red/15 text-signal-red border-signal-red/40',
    'In Progress': 'bg-amber/15 text-amber-600 border-amber/50',
    Resolved: 'bg-signal-green/15 text-signal-green border-signal-green/40'
  };
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold ${map[status] || 'border-line text-ink-600'}`}>
      {status}
    </span>
  );
}

export function SectionLabel({ children }) {
  return <p className="mb-2 text-xs font-semibold tracking-wide text-ink-600">{children}</p>;
}

export function PrimaryButton({ children, loading, className = '', ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`tap-target flex w-full items-center justify-center gap-2 border-2 border-ink bg-ink px-5 py-3 font-semibold text-paper transition active:scale-[0.99] disabled:opacity-50 ${className}`}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function AmberButton({ children, loading, className = '', ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`tap-target flex w-full items-center justify-center gap-2 border-2 border-amber bg-amber px-5 py-3 font-semibold text-ink transition active:scale-[0.99] disabled:opacity-50 ${className}`}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-600">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full border-2 border-line bg-white px-3.5 py-3 text-base text-ink outline-none focus:border-ink';
