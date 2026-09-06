import React, { useState } from 'react';
import { Search, PackageCheck, Clock, MapPin, User, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../lib/toast.jsx';
import { Spinner, PrimaryButton, AmberButton, StatusPill, inputClass } from '../../components/ui.jsx';

export default function Gate() {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [log, setLog] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [approving, setApproving] = useState(false);

  function normalizeCode(raw) {
    const cleaned = raw.trim().toUpperCase().replace(/^#/, '');
    return cleaned.startsWith('REC-') ? cleaned : `REC-${cleaned.replace(/^REC-?/, '')}`;
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setSearching(true);
    setLog(null);
    setNotFound(false);

    const receiptCode = normalizeCode(code);
    const { data, error } = await supabase
      .from('ft_work_logs')
      .select(
        `*,
         zone:ft_zones(zone_id, floor_level, zone_type, tenant_name),
         part:ft_parts_inventory(part_name, category, stock_on_hand),
         technician:ft_personnel(full_name, phone)`
      )
      .eq('receipt_code', receiptCode)
      .maybeSingle();

    setSearching(false);
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setLog(data);
  }

  async function handleApprove() {
    if (!log) return;
    setApproving(true);
    const { error } = await supabase.rpc('ft_approve_work_log', {
      p_receipt_code: log.receipt_code
    });
    setApproving(false);
    if (error) return toast.error(error.message);
    toast.success('Stock deducted and log approved.');
    setLog((prev) => ({ ...prev, gate_status: 'Approved', gate_approved_at: new Date().toISOString() }));
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-start gap-2.5">
        <PackageCheck size={18} className="mt-0.5 text-ink" />
        <div>
          <h2 className="font-semibold text-ink">Storekeeper Gate</h2>
          <p className="text-xs text-ink-600">Look up an exchange code and verify the scrap before releasing stock</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="REC-77319"
          className={`${inputClass} font-mono`}
          autoFocus
        />
        <button
          type="submit"
          disabled={searching}
          className="tap-target flex items-center gap-2 border-2 border-ink bg-ink px-5 font-semibold text-paper disabled:opacity-60"
        >
          {searching ? <Spinner size={16} /> : <Search size={16} />}
        </button>
      </form>

      {notFound && (
        <div className="border-2 border-signal-red bg-signal-red/5 px-4 py-3 text-sm text-signal-red">
          No log found for that code. Check it was typed correctly.
        </div>
      )}

      {log && (
        <div className="border-2 border-ink bg-white">
          <div className="flex items-center justify-between border-b-2 border-line px-4 py-3">
            <span className="font-mono text-sm font-bold text-ink">#{log.receipt_code}</span>
            <StatusPill status={log.gate_status === 'Approved' ? 'Resolved' : 'Open'} />
          </div>

          <div className="flex flex-col divide-y divide-line">
            <Row label="Part" value={log.part?.part_name || '—'} />
            <Row label="Qty requested" value={String(log.parts_quantity)} />
            <Row
              label="Timestamp"
              value={
                <span className="flex items-center gap-1.5">
                  <Clock size={13} /> {new Date(log.created_at).toLocaleString()}
                </span>
              }
            />
            <Row
              label="Zone"
              value={
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} /> {log.zone?.floor_level} · {log.zone?.zone_type}
                </span>
              }
            />
            <Row
              label="Technician"
              value={
                <span className="flex items-center gap-1.5">
                  <User size={13} /> {log.technician?.full_name || `Unregistered (${log.logged_by_phone})`}
                </span>
              }
            />
          </div>

          {log.photo_url && (
            <div className="border-t-2 border-line p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Scrap photo</p>
              <img src={log.photo_url} alt="Scrap evidence" className="h-40 w-full border-2 border-line object-cover" />
            </div>
          )}

          <div className="border-t-2 border-ink p-4">
            {log.gate_status === 'Approved' ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-signal-green">
                <CheckCircle2 size={16} /> Approved · stock already deducted
              </div>
            ) : (
              <AmberButton onClick={handleApprove} loading={approving}>
                <PackageCheck size={16} /> Approve &amp; deduct stock
              </AmberButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}
