import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Wrench, ClipboardCheck, Minus, Plus, CheckCircle2, Copy } from 'lucide-react';
import { supabase, uploadIncidentPhoto } from '../lib/supabaseClient.js';
import { useToast } from '../lib/toast.jsx';
import { Spinner, OfflineBanner, PrimaryButton, AmberButton, Field, inputClass, SectionLabel } from '../components/ui.jsx';
import PhotoCapture from '../components/PhotoCapture.jsx';

const ISSUE_TYPES = ['Part Replacement', 'Routine Inspection'];
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC'];

export default function ZoneScan({ zoneId }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState(null);
  const [location, setLocation] = useState(null);
  const [parts, setParts] = useState([]);
  const [notFound, setNotFound] = useState(false);

  const [issueType, setIssueType] = useState('Part Replacement');
  const [category, setCategory] = useState('Electrical');
  const [partId, setPartId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [actionTaken, setActionTaken] = useState('');
  const [scrapConfirmed, setScrapConfirmed] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: zoneRow, error: zoneErr } = await supabase
        .from('ft_zones')
        .select('*')
        .eq('zone_id', zoneId)
        .maybeSingle();

      if (cancelled) return;

      if (zoneErr || !zoneRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setZone(zoneRow);

      const { data: locRow } = await supabase
        .from('ft_locations')
        .select('*')
        .eq('location_id', zoneRow.location_id)
        .maybeSingle();
      if (!cancelled) setLocation(locRow);

      const { data: partRows } = await supabase
        .from('ft_parts_inventory')
        .select('*')
        .eq('location_id', zoneRow.location_id)
        .order('part_name');
      if (!cancelled) {
        setParts(partRows || []);
        if (partRows?.length) setPartId(partRows[0].part_id);
      }

      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  const selectedPart = useMemo(() => parts.find((p) => p.part_id === partId), [parts, partId]);
  const isPartReplacement = issueType === 'Part Replacement';

  function validate() {
    if (!/^\d{10}$/.test(phone)) return 'Enter a valid 10-digit phone number.';
    if (isPartReplacement) {
      if (!partId) return 'Select the component that was consumed.';
      if (quantity < 1) return 'Quantity must be at least 1.';
      if (selectedPart && quantity > selectedPart.stock_on_hand) {
        return `Only ${selectedPart.stock_on_hand} in stock — can't log ${quantity}.`;
      }
      if (!scrapConfirmed) return 'Confirm the blown/damaged part was deposited in the floor bin.';
    }
    if (!photo) return 'A live photo is required before submitting.';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      const photoUrl = await uploadIncidentPhoto(photo, `worklog/${zoneId}`);

      const { data, error } = await supabase.rpc('ft_submit_work_log', {
        p_zone_id: zoneId,
        p_asset_id: null,
        p_logged_by_phone: phone,
        p_issue_type: issueType,
        p_category: isPartReplacement ? category : null,
        p_action_taken: actionTaken || null,
        p_parts_used_id: isPartReplacement ? partId : null,
        p_parts_quantity: isPartReplacement ? quantity : 0,
        p_scrap_returned: isPartReplacement ? scrapConfirmed : false,
        p_photo_url: photoUrl
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setReceipt(row?.receipt_code);
      toast.success('Work log submitted.');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Submission failed. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

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
        <h1 className="text-lg font-semibold">Zone tag not recognized</h1>
        <p className="max-w-xs text-sm text-line">
          "{zoneId}" doesn't match any zone on file. It may be a damaged or unregistered sticker — flag it to your FM.
        </p>
      </div>
    );
  }

  if (receipt) {
    return <ReceiptConfirmation receipt={receipt} zoneId={zoneId} onNewEntry={() => window.location.reload()} />;
  }

  return (
    <div className="min-h-dvh bg-paper pb-32 safe-top">
      <OfflineBanner />

      <header className="border-b-2 border-ink bg-ink px-4 py-4 text-paper">
        <div className="flex items-center gap-2 text-amber">
          <MapPin size={16} />
          <span className="font-mono text-xs">{zoneId}</span>
        </div>
        <h1 className="mt-1 text-lg font-bold">
          {location?.name} — {zone.floor_level}
        </h1>
        <p className="text-sm text-line">
          {zone.zone_type}
          {zone.tenant_name ? ` · ${zone.tenant_name}` : ' · Common area'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
        <div>
          <SectionLabel>Log type</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {ISSUE_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setIssueType(t)}
                className={`tap-target flex items-center justify-center gap-2 border-2 px-3 py-3 text-sm font-semibold ${
                  issueType === t ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink-600'
                }`}
              >
                {t === 'Part Replacement' ? <Wrench size={16} /> : <ClipboardCheck size={16} />}
                {t}
              </button>
            ))}
          </div>
        </div>

        {isPartReplacement && (
          <>
            <Field label="Component category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Component consumed"
              hint={selectedPart ? `${selectedPart.stock_on_hand} in stock at this site` : undefined}
            >
              <select value={partId} onChange={(e) => setPartId(e.target.value)} className={inputClass}>
                {parts
                  .filter((p) => p.category === category)
                  .map((p) => (
                    <option key={p.part_id} value={p.part_id}>
                      {p.part_name} ({p.stock_on_hand} on hand)
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Quantity used">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="tap-target flex items-center justify-center border-2 border-ink px-4 text-ink"
                >
                  <Minus size={16} />
                </button>
                <span className="w-10 text-center text-lg font-semibold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="tap-target flex items-center justify-center border-2 border-ink px-4 text-ink"
                >
                  <Plus size={16} />
                </button>
              </div>
            </Field>

            <label className="flex items-start gap-3 border-2 border-amber bg-amber-100 px-4 py-3.5">
              <input
                type="checkbox"
                checked={scrapConfirmed}
                onChange={(e) => setScrapConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600"
              />
              <span className="text-sm font-medium text-ink">
                Blown/damaged scrap collected and deposited in floor bin.
              </span>
            </label>
          </>
        )}

        <Field label="Notes" hint="Optional — what was found, what was done">
          <textarea
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="e.g. Replaced flickering downlight in west corridor"
          />
        </Field>

        <PhotoCapture file={photo} onCapture={setPhoto} />

        <Field label="Your phone number" hint="10 digits, used to trace the entry back to you">
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

      <div className="fixed inset-x-0 bottom-0 border-t-2 border-ink bg-paper px-4 py-3 safe-bottom">
        <div className="mx-auto max-w-md">
          <AmberButton onClick={handleSubmit} loading={submitting}>
            Submit log
          </AmberButton>
        </div>
      </div>
    </div>
  );
}

function ReceiptConfirmation({ receipt, zoneId, onNewEntry }) {
  const toast = useToast();
  const copy = () => {
    navigator.clipboard?.writeText(`#${receipt}`);
    toast.success('Receipt code copied.');
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink px-6 text-center text-paper safe-top safe-bottom">
      <CheckCircle2 size={48} className="text-signal-green" />
      <div>
        <h1 className="text-xl font-bold">Logged</h1>
        <p className="mt-1 text-sm text-line">Show this code at the storekeeper counter to close the exchange.</p>
      </div>
      <button
        onClick={copy}
        className="tap-target flex items-center gap-3 border-2 border-amber bg-amber-100/10 px-6 py-4"
      >
        <span className="font-mono text-2xl font-bold tracking-wider text-amber">#{receipt}</span>
        <Copy size={18} className="text-amber" />
      </button>
      <button onClick={onNewEntry} className="text-sm font-medium text-line underline">
        Log another item for {zoneId}
      </button>
    </div>
  );
}
