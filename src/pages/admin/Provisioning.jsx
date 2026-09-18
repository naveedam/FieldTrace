import React, { useEffect, useState } from 'react';
import { PackagePlus, Printer, AlertTriangle, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../lib/toast.jsx';
import { Field, inputClass, AmberButton } from '../../components/ui.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { ASSET_CATEGORIES } from '../../lib/assetCategories.js';
import TagCard from '../../components/TagCard.jsx';
import FloorPlanImport from './FloorPlanImport.jsx';

export default function Provisioning() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);

  async function loadSites() {
    setLoading(true);
    const { data } = await supabase.from('ft_locations').select('*').order('name');
    setSites(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSites();
  }, []);

  if (loading) return <SkeletonRows rows={4} cols={3} />;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-start gap-2.5">
        <PackagePlus size={18} className="mt-0.5 text-ink" />
        <div>
          <h2 className="font-semibold text-ink">Asset Provisioning</h2>
          <p className="text-xs text-ink-600">
            Register real assets into the digital twin and print their QR tags in one step — every printed code
            corresponds to a live record.
          </p>
        </div>
      </div>

      <RegisterAndPrint sites={sites} toast={toast} />
      <FloorPlanImport sites={sites} toast={toast} onSitesChanged={loadSites} />
      <ReprintAssetTags sites={sites} toast={toast} />
      <ZoneTagPrinter sites={sites} toast={toast} />
    </div>
  );
}

function RegisterAndPrint({ sites, toast }) {
  const [siteId, setSiteId] = useState('');
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState('');
  const [category, setCategory] = useState(ASSET_CATEGORIES[0].label);
  const [makeModel, setMakeModel] = useState('');
  const [count, setCount] = useState(10);
  const [unitCost, setUnitCost] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(null); // { assets: [...] }

  useEffect(() => {
    if (!siteId) {
      setZones([]);
      setZoneId('');
      return;
    }
    async function loadZones() {
      const { data } = await supabase.from('ft_zones').select('*').eq('location_id', siteId).order('floor_level');
      setZones(data || []);
      setZoneId(data?.[0]?.zone_id || '');
    }
    loadZones();
  }, [siteId]);

  const selectedSite = sites.find((s) => s.location_id === siteId);
  const selectedCategory = ASSET_CATEGORIES.find((c) => c.label === category);
  const siteMissingUrl = selectedSite && !selectedSite.app_url;

  async function handleCreateAndPrint(e) {
    e.preventDefault();
    if (!siteId) return toast.error('Select a site.');
    if (!zoneId) return toast.error('Select a zone — add one under Sites & Spaces first if none exist.');
    if (siteMissingUrl) return toast.error(`${selectedSite.name} has no app URL set — configure it under Sites & Spaces first.`);
    if (!count || count < 1) return toast.error('Count must be at least 1.');

    setSubmitting(true);
    const { data, error } = await supabase.rpc('ft_register_assets', {
      p_category: category,
      p_id_prefix: selectedCategory.prefix,
      p_make_model: makeModel || null,
      p_zone_id: zoneId,
      p_count: Number(count),
      p_unit_cost: unitCost ? Number(unitCost) : null,
      p_warranty_expiry: warrantyExpiry || null
    });
    setSubmitting(false);

    if (error) return toast.error(error.message);

    setRegistered({ assets: data || [] });
    toast.success(`${data?.length ?? 0} assets registered and QR sheet generated.`);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <section>
      <h3 className="mb-4 font-semibold text-ink">Register &amp; print assets</h3>

      <form onSubmit={handleCreateAndPrint} className="grid gap-6 lg:grid-cols-2">
        <div className="border-2 border-line bg-white p-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Site">
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.location_id} value={s.location_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Zone" hint={zones.length === 0 && siteId ? 'No zones on this site yet' : undefined}>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass} disabled={!siteId}>
                {zones.map((z) => (
                  <option key={z.zone_id} value={z.zone_id}>
                    {z.floor_level} · {z.zone_type} {z.tenant_name ? `(${z.tenant_name})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {siteMissingUrl && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-signal-red">
              <AlertTriangle size={13} /> This site has no app URL — set one under Sites &amp; Spaces before provisioning.
            </p>
          )}
        </div>

        <div className="border-2 border-line bg-white p-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.label} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Make / model" hint="Optional">
              <input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Count">
              <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Unit cost" hint="Optional, ₹">
              <input type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Warranty expiry" hint="Optional">
              <input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </div>

        <div className="lg:col-span-2">
          <AmberButton type="submit" loading={submitting} className="max-w-xs">
            <PackagePlus size={16} /> Create &amp; Print
          </AmberButton>
        </div>
      </form>

      {registered && registered.assets.length > 0 && (
        <div className="mt-6">
          <div className="mb-4 flex items-center justify-between border-2 border-ink bg-white px-4 py-3">
            <p className="font-mono text-sm font-semibold text-ink">
              {registered.assets[0].asset_id} <span className="text-ink-600">→</span>{' '}
              {registered.assets[registered.assets.length - 1].asset_id}
            </p>
            <button
              onClick={handlePrint}
              className="tap-target flex items-center gap-2 border-2 border-ink bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              <Printer size={15} /> Print sheet
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
            {registered.assets.map((a) => (
              <TagCard key={a.asset_id} title={a.category.toUpperCase()} id={a.asset_id} url={a.qr_code_url} sub="Asset tag" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ZoneTagPrinter({ sites, toast }) {
  const [siteId, setSiteId] = useState('');
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState('');

  useEffect(() => {
    if (!siteId) {
      setZones([]);
      setZoneId('');
      return;
    }
    async function loadZones() {
      const { data } = await supabase.from('ft_zones').select('*').eq('location_id', siteId).order('floor_level');
      setZones(data || []);
      setZoneId(data?.[0]?.zone_id || '');
    }
    loadZones();
  }, [siteId]);

  const selectedSite = sites.find((s) => s.location_id === siteId);
  const selectedZone = zones.find((z) => z.zone_id === zoneId);
  const zoneUrl = selectedSite?.app_url && selectedZone ? `${selectedSite.app_url.replace(/\/$/, '')}/scan?type=zone&id=${zoneId}` : null;

  function handlePrint() {
    window.print();
  }

  return (
    <section>
      <h3 className="mb-1 font-semibold text-ink">Print a zone tag</h3>
      <p className="mb-4 text-xs text-ink-600">
        Zones are created under Sites &amp; Spaces — this just reprints a tag for one that already exists.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-2 border-line bg-white p-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Site">
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.location_id} value={s.location_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Zone">
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass} disabled={!siteId}>
                {zones.map((z) => (
                  <option key={z.zone_id} value={z.zone_id}>
                    {z.floor_level} · {z.zone_type}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {selectedSite && !selectedSite.app_url && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-signal-red">
              <AlertTriangle size={13} /> This site has no app URL — set one under Sites &amp; Spaces.
            </p>
          )}
        </div>

        {zoneUrl && (
          <div className="flex items-center justify-between border-2 border-ink bg-white p-5">
            <TagCard title="ZONE" id={zoneId} url={zoneUrl} sub={`${selectedZone.zone_type} · ${selectedZone.floor_level}`} />
            <button
              onClick={handlePrint}
              className="tap-target flex items-center gap-2 border-2 border-ink bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              <Printer size={15} /> Print
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ReprintAssetTags({ sites, toast }) {
  const [siteId, setSiteId] = useState('');
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState(''); // '' = all zones on this site
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!siteId) {
      setZones([]);
      setZoneId('');
      setAssets([]);
      return;
    }
    async function loadZones() {
      const { data } = await supabase.from('ft_zones').select('*').eq('location_id', siteId).order('floor_level');
      setZones(data || []);
      setZoneId('');
    }
    loadZones();
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    async function loadAssets() {
      setLoadingAssets(true);
      const zoneIds = zoneId ? [zoneId] : zones.map((z) => z.zone_id);
      if (zoneIds.length === 0) {
        setAssets([]);
        setLoadingAssets(false);
        return;
      }
      const { data } = await supabase
        .from('ft_assets')
        .select('*')
        .in('current_zone_id', zoneIds)
        .order('asset_id');
      setAssets(data || []);
      setSelectedIds([]);
      setLoadingAssets(false);
    }
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, zoneId, zones.length]);

  const zonesById = Object.fromEntries(zones.map((z) => [z.zone_id, z]));
  const allSelected = assets.length > 0 && selectedIds.length === assets.length;

  function toggleAsset(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : assets.map((a) => a.asset_id));
  }

  const selectedAssets = assets.filter((a) => selectedIds.includes(a.asset_id));

  function handlePrint() {
    if (selectedIds.length === 0) return toast.error('Select at least one asset to reprint.');
    window.print();
  }

  return (
    <section>
      <h3 className="mb-1 font-semibold text-ink">Reprint asset tags</h3>
      <p className="mb-4 text-xs text-ink-600">
        For assets already registered — e.g. after fixing a site's App URL — reprint their existing QR tag using the
        asset's current, stored code. No new records are created here.
      </p>

      <div className="border-2 border-line bg-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Site">
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.location_id} value={s.location_id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zone" hint="Optional — leave as All to reprint across the whole site">
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass} disabled={!siteId}>
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.floor_level} · {z.zone_type} {z.tenant_name ? `(${z.tenant_name})` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {siteId && (
        <div className="mt-4">
          {loadingAssets ? (
            <SkeletonRows rows={3} cols={4} />
          ) : assets.length === 0 ? (
            <div className="border-2 border-dashed border-line bg-white px-4 py-8 text-center text-sm text-ink-600">
              No assets found for this selection.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={toggleAll}
                  className="tap-target flex items-center gap-2 text-sm font-semibold text-ink-600"
                >
                  {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  {allSelected ? 'Deselect all' : `Select all (${assets.length})`}
                </button>
                <AmberButton onClick={handlePrint} className="w-auto px-4" disabled={selectedIds.length === 0}>
                  <RefreshCw size={15} /> Reprint selected ({selectedIds.length})
                </AmberButton>
              </div>

              <div className="max-h-80 overflow-y-auto border-2 border-ink">
                {assets.map((a, i) => {
                  const zone = zonesById[a.current_zone_id];
                  return (
                    <label
                      key={a.asset_id}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${i % 2 ? 'bg-white' : 'bg-paper'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.asset_id)}
                        onChange={() => toggleAsset(a.asset_id)}
                        className="h-5 w-5 shrink-0 accent-ink"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-ink-600">{a.asset_id}</p>
                        <p className="text-sm font-medium text-ink">
                          {a.category} {a.make_model ? `· ${a.make_model}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-ink-600">
                        {zone ? `${zone.floor_level} · ${zone.zone_type}` : ''}
                      </p>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {selectedAssets.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
          {selectedAssets.map((a) => (
            <TagCard key={a.asset_id} title={a.category.toUpperCase()} id={a.asset_id} url={a.qr_code_url} sub="Asset tag" />
          ))}
        </div>
      )}
    </section>
  );
}
