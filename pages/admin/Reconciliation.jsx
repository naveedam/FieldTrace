import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { Spinner, StatusPill, inputClass } from '../../components/ui.jsx';

export default function Reconciliation() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [zones, setZones] = useState([]);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: assetRows }, { data: zoneRows }] = await Promise.all([
        supabase.from('ft_assets').select('*').order('category'),
        supabase.from('ft_zones').select('*')
      ]);
      setAssets(assetRows || []);
      setZones(zoneRows || []);
      setLoading(false);
    }
    load();
  }, []);

  const tenants = useMemo(() => {
    const set = new Set(zones.map((z) => z.tenant_name).filter(Boolean));
    return Array.from(set).sort();
  }, [zones]);

  const zoneById = useMemo(() => Object.fromEntries(zones.map((z) => [z.zone_id, z])), [zones]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const z = zoneById[a.current_zone_id];
      if (zoneFilter !== 'all' && a.current_zone_id !== zoneFilter) return false;
      if (tenantFilter !== 'all' && z?.tenant_name !== tenantFilter) return false;
      return true;
    });
  }, [assets, zoneById, zoneFilter, tenantFilter]);

  const summary = useMemo(() => {
    const byCategory = {};
    let totalValue = 0;
    for (const a of filtered) {
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      totalValue += Number(a.unit_cost || 0);
    }
    return { byCategory, totalValue, count: filtered.length };
  }, [filtered]);

  function exportCsv() {
    const header = ['asset_id', 'category', 'make_model', 'status', 'zone_id', 'floor_level', 'tenant_name', 'unit_cost'];
    const rows = filtered.map((a) => {
      const z = zoneById[a.current_zone_id];
      return [a.asset_id, a.category, a.make_model || '', a.status, a.current_zone_id || '', z?.floor_level || '', z?.tenant_name || '', a.unit_cost || ''];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exit-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2.5">
        <ClipboardList size={18} className="mt-0.5 text-ink" />
        <div>
          <h2 className="font-semibold text-ink">Asset reconciliation</h2>
          <p className="text-xs text-ink-600">Filter by zone or leased tenant to run a 1-click exit audit headcount</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className={`${inputClass} max-w-xs`}>
          <option value="all">All zones</option>
          {zones.map((z) => (
            <option key={z.zone_id} value={z.zone_id}>
              {z.floor_level} · {z.zone_type}
            </option>
          ))}
        </select>
        <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} className={`${inputClass} max-w-xs`}>
          <option value="all">All tenants</option>
          {tenants.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          className="tap-target flex items-center gap-2 border-2 border-ink px-4 py-2.5 text-sm font-semibold text-ink"
        >
          <Download size={15} /> Export headcount CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Assets in scope" value={summary.count} />
        <SummaryCard label="Categories" value={Object.keys(summary.byCategory).length} />
        <SummaryCard label="Est. asset value" value={`₹${summary.totalValue.toLocaleString('en-IN')}`} />
      </div>

      <div className="overflow-x-auto border-2 border-ink">
        <table className="w-full text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Asset ID</th>
              <th className="px-4 py-2.5 text-left font-semibold">Category</th>
              <th className="px-4 py-2.5 text-left font-semibold">Zone</th>
              <th className="px-4 py-2.5 text-left font-semibold">Tenant</th>
              <th className="px-4 py-2.5 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => {
              const z = zoneById[a.current_zone_id];
              return (
                <tr key={a.asset_id} className={i % 2 ? 'bg-white' : 'bg-paper'}>
                  <td className="px-4 py-2.5 font-mono text-xs">{a.asset_id}</td>
                  <td className="px-4 py-2.5">{a.category}</td>
                  <td className="px-4 py-2.5 text-ink-600">{z ? `${z.floor_level} · ${z.zone_type}` : '—'}</td>
                  <td className="px-4 py-2.5 text-ink-600">{z?.tenant_name || 'Common area'}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={a.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="border-2 border-line bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
