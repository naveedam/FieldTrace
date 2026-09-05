import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Package, TrendingUp, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { Spinner, StatusPill } from '../../components/ui.jsx';

const WINDOW_DAYS = 30;
const BURN_THRESHOLD = 0.05; // 5% of site-wide consumption attributable to one zone

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [parts, setParts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: zoneRows }, { data: partRows }, { data: logRows }, { data: ticketRows }] = await Promise.all([
        supabase.from('ft_zones').select('*'),
        supabase.from('ft_parts_inventory').select('*'),
        supabase
          .from('ft_work_logs')
          .select('*')
          .eq('issue_type', 'Part Replacement')
          .gte('created_at', since),
        supabase.from('ft_maintenance_tickets').select('*').order('created_at', { ascending: false }).limit(8)
      ]);

      setZones(zoneRows || []);
      setParts(partRows || []);
      setLogs(logRows || []);
      setTickets(ticketRows || []);
      setLoading(false);
    }
    load();
  }, []);

  const burnAlerts = useMemo(() => {
    const totalConsumed = logs.reduce((sum, l) => sum + (l.parts_quantity || 0), 0);
    if (totalConsumed === 0) return [];

    const byZone = {};
    for (const log of logs) {
      byZone[log.zone_id] = (byZone[log.zone_id] || 0) + (log.parts_quantity || 0);
    }

    return Object.entries(byZone)
      .map(([zoneId, qty]) => ({
        zone: zones.find((z) => z.zone_id === zoneId),
        zoneId,
        qty,
        share: qty / totalConsumed
      }))
      .filter((row) => row.share > BURN_THRESHOLD)
      .sort((a, b) => b.share - a.share);
  }, [logs, zones]);

  const lowStock = useMemo(() => parts.filter((p) => p.stock_on_hand <= p.min_threshold), [parts]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader
          icon={AlertTriangle}
          title="High-burn alerts"
          subtitle={`Zones consuming a disproportionate share (>${Math.round(BURN_THRESHOLD * 100)}%) of site-wide replacement parts in the last ${WINDOW_DAYS} days`}
        />
        {burnAlerts.length === 0 ? (
          <EmptyState text="No zone is showing an unusual replacement rate right now." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {burnAlerts.map((a) => (
              <div key={a.zoneId} className="border-2 border-signal-red bg-signal-red/5 p-4">
                <p className="font-mono text-xs text-ink-600">{a.zoneId}</p>
                <p className="mt-1 font-semibold text-ink">
                  {a.zone?.floor_level} · {a.zone?.zone_type}
                </p>
                <p className="text-sm text-ink-600">{a.zone?.tenant_name || 'Common area'}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-signal-red">{Math.round(a.share * 100)}%</span>
                  <span className="text-xs text-ink-600">of site consumption · {a.qty} parts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader icon={Package} title="Live consumables" subtitle="Stock on hand against reorder threshold" />
        <div className="overflow-hidden border-2 border-ink">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Part</th>
                <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                <th className="px-4 py-2.5 text-right font-semibold">On hand</th>
                <th className="px-4 py-2.5 text-right font-semibold">Threshold</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => {
                const low = p.stock_on_hand <= p.min_threshold;
                return (
                  <tr key={p.part_id} className={i % 2 ? 'bg-white' : 'bg-paper'}>
                    <td className="px-4 py-2.5 font-medium text-ink">{p.part_name}</td>
                    <td className="px-4 py-2.5 text-ink-600">{p.category}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{p.stock_on_hand}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{p.min_threshold}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={low ? 'Missing' : 'Active'} />
                      {low && <span className="ml-2 text-xs text-signal-red">Reorder</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lowStock.length > 0 && (
          <p className="mt-2 text-xs text-signal-red">{lowStock.length} part(s) at or below reorder threshold.</p>
        )}
      </section>

      <section>
        <SectionHeader icon={Wrench} title="Recent maintenance tickets" subtitle="Latest defects reported from asset scans" />
        {tickets.length === 0 ? (
          <EmptyState text="No maintenance tickets filed yet." />
        ) : (
          <div className="flex flex-col divide-y-2 divide-line border-2 border-ink">
            {tickets.map((t) => (
              <div key={t.ticket_id} className="flex items-center justify-between gap-4 bg-white px-4 py-3">
                <div>
                  <p className="font-mono text-xs text-ink-600">{t.asset_id}</p>
                  <p className="text-sm font-medium text-ink">{t.defect_type}</p>
                </div>
                <StatusPill status={t.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <Icon size={18} className="mt-0.5 text-ink" />
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink-600">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="border-2 border-dashed border-line bg-white px-4 py-6 text-center text-sm text-ink-600">{text}</div>;
}
