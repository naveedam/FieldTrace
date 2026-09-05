import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, QrCode, LogOut, ScanLine } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { Spinner, PrimaryButton, Field, inputClass } from '../../components/ui.jsx';
import { useToast } from '../../lib/toast.jsx';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/reconciliation', label: 'Reconciliation', icon: ClipboardList },
  { to: '/admin/qr-batch', label: 'QR batch', icon: QrCode }
];

export default function AdminLayout() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner size={24} />
      </div>
    );
  }

  if (!session) return <LoginGate />;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex items-center justify-between border-b-2 border-ink bg-ink px-6 py-4 text-paper">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center border-2 border-amber">
            <ScanLine size={16} className="text-amber" />
          </div>
          <span className="font-bold tracking-tight">FieldTrace</span>
          <span className="ml-1 hidden text-sm text-line sm:inline">Facility ops</span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="tap-target flex items-center gap-1.5 text-sm text-line hover:text-paper"
        >
          <LogOut size={15} /> Sign out
        </button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b-2 border-line bg-white px-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${
                isActive ? 'border-amber text-ink' : 'border-transparent text-ink-600'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function LoginGate() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-6">
      <form onSubmit={handleLogin} className="w-full max-w-sm border-2 border-line bg-paper p-6">
        <h1 className="text-lg font-bold text-ink">Facility manager sign-in</h1>
        <p className="mt-1 mb-6 text-sm text-ink-600">
          Field techs never see this screen — scanning a QR tag takes them straight to the work form.
        </p>
        <div className="flex flex-col gap-4">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <PrimaryButton type="submit" loading={loading}>
            Sign in
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
