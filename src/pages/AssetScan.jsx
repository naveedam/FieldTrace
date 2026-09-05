import React, { useEffect, useMemo, useState } from 'react';
import { Tag, Building2, MoveRight, AlertTriangle, CheckCircle2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase, uploadIncidentPhoto } from '../lib/supabaseClient.js';
import { useToast } from '../lib/toast.jsx';
import { Spinner, OfflineBanner, PrimaryButton, AmberButton, Field, inputClass, StatusPill } from '../components/ui.jsx';
import PhotoCapture from '../components/PhotoCapture.jsx';

const DEFECT_TYPES = ['Mechanical fault', 'Electrical fault', 'Cosmetic damage', 'Missing part', 'Not powering on', 'Other'];

export default function AssetScan({ assetId }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState(null);
  const [zone, setZone] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState(null); // null | 'relocate' | 'defect'
  const [done, setDone] = useState(null); // { kind, ... }

  async function load() {
    setLoading(true);
    const { data: assetRow, error } = await supabase.from('ft_assets').select('*').eq('asset_id', assetId).maybeSingle();
    if (error || !assetRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setAsset(assetRow);

    if (assetRow.current_zone_id) {
      const { data: zoneRow } = await supabase
        .from('ft_zones')
        .select('*')
        .eq('zone_id', assetRow.current_zone_id)
        .maybeSingle();
      setZone(zoneRow);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner size={28} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-paper">
        <h1 className="text-lg font-semibold">Asset tag not recognized</h1>
        <p className="max-w-xs text-sm text-line">
          "{assetId}" doesn't match any asset on file. It may be unregistered — flag it for the audit team.
        </p>
      </div>
    );
  }

  if (done) {
    return <ActionConfirmation done={done} onDone={() => { setDone(null); setMode(null); load(); }} />;
  }

  if (mode === 'relocate') {
    return <RelocateForm asset={asset} onCancel={() => setMode(null)} onDone={(d) => setDone(d)} />;
  }

  if (mode === 'defect') {
    return <DefectForm asset={asset} onCancel={() => setMode(null)} onDone={(d) => setDone(d)} />;
  }

  const warrantyActive = asset.warranty_expiry && new Date(asset.warranty_expiry) >= new Date();

  return (
    <div className="min-h-dvh bg-paper safe-top safe-bottom">
      <OfflineBanner />

      <header className="border-b-2 border-ink bg-ink px-4 py-4 text-paper">
        <div className="flex items-center gap-2 text-amber">
          <Tag size={16} />
          <span className="font-mono text-xs">{asset.asset_id}</span>
        </div>
        <h1 className="mt-1 text-lg font-bold">{asset.category}</h1>
        <p className="text-sm text-line">{asset.make_model || 'Model not on file'}</p>
      </header>

      <div className="mx-auto max-w-md px-4 py-5">
        <div className="border-2 border-ink bg-white">
          <Row label="Status" value={<StatusPill status={asset.status} />} />
          <Row
            label="Warranty"
            value={
              asset.warranty_expiry ? (
                <span className={`flex items-center gap-1.5 text-sm font-medium ${warrantyActive ? 'text-signal-green' : 'text-signal-red'}`}>
                  {warrantyActive ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                  {warrantyActive ? 'Active' : 'Expired'} · {asset.warranty_expiry}
                </span>
              ) : (
                <span className="text-sm text-ink-600">Not on file</span>
              )
            }
          />
          <Row
            label="Current zone"
            value={
              zone ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Building2 size={15} /> {zone.floor_level} · {zone.zone_type}
                </span>
              ) : (
                <span className="text-sm text-ink-600">Unassigned</span>
              )
            }
          />
          <Row label="Assigned tenant" value={<span className="text-sm text-ink">{zone?.tenant_name || 'Common area'}</span>} last />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <PrimaryButton onClick={() => setMode('relocate')}>
            <MoveRight size={18} /> Relocate asset
          </PrimaryButton>
          <button
            onClick={() => setMode('defect')}
            className="tap-target flex w-full items-center justify-center gap-2 border-2 border-signal-red px-5 py-3 font-semibold text-signal-red"
          >
            <AlertTriangle size={18} /> Report defect / repair
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${!last ? 'border-b border-line' : ''}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      {value}
    </div>
  );
}

function RelocateForm({ asset, onCancel, onDone }) {
  const toast = useToast();
  const [zones, setZones] = useState([]);
  const [toZoneId, setToZoneId] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadZones() {
      let query = supabase.from('ft_zones').select('*').order('floor_level');
      if (asset.current_zone_id) {
        const { data: currentZone } = await supabase
          .from('ft_zones')
          .select('location_id')
          .eq('zone_id', asset.current_zone_id)
          .maybeSingle();
        if (currentZone) query = query.eq('location_id', currentZone.location_id);
      }
      const { data } = await query;
      const filtered = (data || []).filter((z) => z.zone_id !== asset.current_zone_id);
      setZones(filtered);
      if (filtered.length) setToZoneId(filtered[0].zone_id);
    }
    loadZones();
  }, [asset]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit phone number.');
    if (!toZoneId) return toast.error('Select a destination zone.');

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('ft_transfer_asset', {
        p_asset_id: asset.asset_id,
        p_to_zone_id: toZoneId,
        p_transferred_by: phone,
        p_note: note || null
      });
      if (error) throw error;
      onDone({ kind: 'relocate', toZoneId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Relocation failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper pb-28 safe-top">
      <OfflineBanner />
      <header className="border-b-2 border-ink bg-ink px-4 py-4 text-paper">
        <h1 className="text-lg font-bold">Relocate {asset.asset_id}</h1>
        <p className="text-sm text-line">{asset.category} · {asset.make_model}</p>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
        <Field label="Destination zone">
          <select value={toZoneId} onChange={(e) => setToZoneId(e.target.value)} className={inputClass}>
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                {z.floor_level} · {z.zone_type} {z.tenant_name ? `(${z.tenant_name})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Note" hint="Optional — reason for the move">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} />
        </Field>

        <Field label="Your phone number">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            className={inputClass}
            placeholder="9876543210"
          />
        </Field>
      </form>

      <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t-2 border-ink bg-paper px-4 py-3 safe-bottom">
        <div className="mx-auto flex w-full max-w-md gap-3">
          <button onClick={onCancel} className="tap-target flex-1 border-2 border-line px-4 py-3 font-semibold text-ink-600">
            Cancel
          </button>
          <div className="flex-[2]">
            <PrimaryButton onClick={handleSubmit} loading={submitting}>
              Confirm move
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function DefectForm({ asset, onCancel, onDone }) {
  const toast = useToast();
  const [defectType, setDefectType] = useState(DEFECT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit phone number.');
    if (!photo) return toast.error('A live photo is required.');

    setSubmitting(true);
    try {
      const photoUrl = await uploadIncidentPhoto(photo, `defect/${asset.asset_id}`);
      const { data, error } = await supabase.rpc('ft_report_asset_defect', {
        p_asset_id: asset.asset_id,
        p_defect_type: defectType,
        p_description: description || null,
        p_photo_url: photoUrl,
        p_reported_by: phone
      });
      if (error) throw error;
      onDone({ kind: 'defect', ticketId: data });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not file the ticket. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper pb-28 safe-top">
      <OfflineBanner />
      <header className="border-b-2 border-signal-red bg-ink px-4 py-4 text-paper">
        <h1 className="text-lg font-bold">Report defect · {asset.asset_id}</h1>
        <p className="text-sm text-line">This creates an urgent maintenance ticket</p>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
        <Field label="Defect type">
          <select value={defectType} onChange={(e) => setDefectType(e.target.value)} className={inputClass}>
            {DEFECT_TYPES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>

        <Field label="Description" hint="Optional — what's wrong">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
        </Field>

        <PhotoCapture file={photo} onCapture={setPhoto} />

        <Field label="Your phone number">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            className={inputClass}
            placeholder="9876543210"
          />
        </Field>
      </form>

      <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t-2 border-ink bg-paper px-4 py-3 safe-bottom">
        <div className="mx-auto flex w-full max-w-md gap-3">
          <button onClick={onCancel} className="tap-target flex-1 border-2 border-line px-4 py-3 font-semibold text-ink-600">
            Cancel
          </button>
          <div className="flex-[2]">
            <AmberButton onClick={handleSubmit} loading={submitting}>
              File ticket
            </AmberButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionConfirmation({ done, onDone }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-6 text-center text-paper safe-top safe-bottom">
      <CheckCircle2 size={48} className="text-signal-green" />
      <div>
        <h1 className="text-xl font-bold">{done.kind === 'relocate' ? 'Asset relocated' : 'Ticket filed'}</h1>
        <p className="mt-1 text-sm text-line">
          {done.kind === 'relocate'
            ? 'The move has been recorded and the audit trail updated.'
            : 'Facility management has been notified and the asset marked for maintenance.'}
        </p>
      </div>
      <button onClick={onDone} className="text-sm font-medium text-line underline">
        Back to asset card
      </button>
    </div>
  );
}
