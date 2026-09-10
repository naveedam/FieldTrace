import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, PackagePlus, LogOut, ScanLine, Building2, Users, PackageCheck, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { Spinner, SectionLabel } from '../../components/ui.jsx';
import SetupOrganization from './SetupOrganization.jsx';

// Grouped and ordered to match how a site actually moves through a fit-out:
// set the building up, provision assets during fit-out, hand it to the
// client at go-live, run day-to-day operations, then reconcile at exit.
const NAV_GROUPS = [
  {
    label: 'Setup',
    items: [
      { to: '/admin/sites', label: 'Sites & Spaces', icon: Building2 },
      { to: '/admin/personnel', label: 'Personnel', icon: Users }
    ]
  },
  {
    label: 'Fit-Out',
    items: [{ to: '/admin/provisioning', label: 'Asset Provisioning', icon: PackagePlus }]
  },
  {
    label: 'Handover',
    items: [{ to: '/admin/client-portal', label: 'Client Portal', icon: Share2 }]
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/admin/gate', label: 'Storekeeper Gate', icon: PackageCheck }
    ]
  },
  {
    label: 'Exit',
    items: [{ to: '/admin/reconciliation', label: 'Reconciliation', icon: ClipboardList }]
  }
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

export default function AdminLayout() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [orgName, setOrgName] = useState(undefined); // undefined = checking, null = no org yet, string = linked

  async function checkOrg() {
    const { data: orgId } = await supabase.rpc('ft_current_org_id');
    if (!orgId) {
      setOrgName(null);
      return;
    }
    const { data: org } = await supabase.from('ft_organizations').select('name').eq('org_id', orgId).maybeSingle();
    setOrgName(org?.name || 'Your organization');
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) checkOrg();
    else setOrgName(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner size={24} />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (orgName === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner size={24} />
      </div>
    );
  }

  if (orgName === null) return <SetupOrganization onLinked={checkOrg} />;

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between border-b-2 border-ink bg-ink px-6 py-4 text-paper">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center border-2 border-amber">
            <ScanLine size={16} className="text-amber" />
          </div>
          <span className="font-bold tracking-tight">FieldTrace</span>
          <span className="ml-1 hidden text-sm text-line sm:inline">{orgName}</span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="tap-target flex items-center gap-1.5 text-sm text-line hover:text-paper"
        >
          <LogOut size={15} /> Sign out
        </button>
      </header>

      {/* Mobile: horizontal scrollable strip, workflow order preserved */}
      <nav className="flex gap-1 overflow-x-auto border-b-2 border-line bg-white px-4 sm:hidden">
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

      <div className="flex flex-1 sm:flex-row">
        {/* Desktop/tablet: sidebar, grouped by fit-out phase */}
        <aside className="hidden w-60 shrink-0 border-r-2 border-line bg-white px-4 py-6 sm:block">
          <nav className="flex flex-col gap-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <SectionLabel>{group.label}</SectionLabel>
                <div className="flex flex-col gap-0.5">
                  {group.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm font-semibold ${
                          isActive ? 'border-amber bg-amber-100 text-ink' : 'border-transparent text-ink-600 hover:bg-paper'
                        }`
                      }
                    >
                      <Icon size={15} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
