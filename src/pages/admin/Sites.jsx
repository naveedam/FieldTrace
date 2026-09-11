import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, LayoutGrid, MapPin, Pencil, Link2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../lib/toast.jsx';
import { Field, inputClass, PrimaryButton, AmberButton } from '../../components/ui.jsx';
import { Modal, Drawer } from '../../components/Modal.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';

const ZONE_TYPES = ['Washroom', 'DB Room', 'Bay', 'Meeting Room', 'Pantry', 'Lobby', 'Server Room'];

const STANDARD_ROOMS = [
  { key: 'restroom-n', label: 'Restroom North', zone_type: 'Washroom', suffix: 'N' },
  { key: 'restroom-s', label: 'Restroom South', zone_type: 'Washroom', suffix: 'S' },
  { key: 'db-main', label: 'DB Main', zone_type: 'DB Room', suffix: 'MAIN' },
  { key: 'pantry', label: 'Pantry', zone_type: 'Pantry', suffix: '01' },
  { key: 'meeting', label: 'Meeting Room', zone_type: 'Meeting Room', suffix: '01' },
  { key: 'open-bay', label: 'Open Bay', zone_type: 'Bay', suffix: 'A' }
];

export default function Sites() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [zones, setZones] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editingZone, setEditingZone] = useState(null);

  async function load() {
    setLoading(true);
    const [{ data: locRows }, { data: zoneRows }, { data: assetRows }] = await Promise.all([
      supabase.from('ft_locations').select('*').order('name'),
      supabase.from('ft_zones').select('*'),
      supabase.from('ft_assets').select('asset_id, status, current_zone_id')
    ]);
    setLocations(locRows || []);
    setZones(zoneRows || []);
    setAssets(assetRows || []);
    if (!selectedLocationId && locRows?.length) setSelectedLocationId(locRows[0].location_id);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zonesByLocation = useMemo(() => {
    const map = {};
    for (const z of zones) {
      (map[z.location_id] ||= []).push(z);
    }
    return map;
  }, [zones]);

  const activeAssetCountByLocation = useMemo(() => {
    const zoneToLocation = Object.fromEntries(zones.map((z) => [z.zone_id, z.location_id]));
    const map = {};
    for (const a of assets) {
      if (a.status !== 'Active') continue;
      const locId = zoneToLocation[a.current_zone_id];
      if (!locId) continue;
      map[locId] = (map[locId] || 0) + 1;
    }
    return map;
  }, [zones, assets]);

  const assetCountByZone = useMemo(() => {
    const map = {};
    for (const a of assets) {
      if (!a.current_zone_id) continue;
      map[a.current_zone_id] = (map[a.current_zone_id] || 0) + 1;
    }
    return map;
  }, [assets]);

  const selectedLocation = locations.find((l) => l.location_id === selectedLocationId);
  const selectedZones = zonesByLocation[selectedLocationId] || [];

  const zonesByFloor = useMemo(() => {
    const map = {};
    for (const z of selectedZones) {
      (map[z.floor_level] ||= []).push(z);
    }
    return map;
  }, [selectedZones]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonRows rows={3} cols={3} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2.5">
          <Building2 size={18} className="mt-0.5 text-ink" />
          <div>
            <h2 className="font-semibold text-ink">Sites &amp; Spaces</h2>
            <p className="text-xs text-ink-600">Locations, zones, and bulk zone creation for a new floor</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddLocation(true)}
          className="tap-target flex items-center gap-2 border-2 border-ink px-4 py-2.5 text-sm font-semibold text-ink"
        >
          <Plus size={15} /> Add location
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="border-2 border-ink">
          {locations.map((loc) => (
            <button
              key={loc.location_id}
              onClick={() => setSelectedLocationId(loc.location_id)}
              className={`flex w-full flex-col gap-0.5 border-b-2 border-line px-4 py-3 text-left last:border-b-0 ${
                loc.location_id === selectedLocationId ? 'bg-ink text-paper' : 'bg-white text-ink'
              }`}
            >
              <span className="font-mono text-xs opacity-70">{loc.location_id}</span>
              <span className="font-semibold">{loc.name}</span>
              <span className="text-xs opacity-70">
                {(zonesByLocation[loc.location_id] || []).length} zones · {activeAssetCountByLocation[loc.location_id] || 0} active assets
              </span>
            </button>
          ))}
          {locations.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-600">No sites yet — add one.</p>}
        </div>

        <div>
          {selectedLocation ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-ink">{selectedLocation.name}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-ink-600">
                    <MapPin size={12} /> {selectedLocation.address || 'No address on file'}
                  </p>
                  {selectedLocation.app_url ? (
                    <p className="flex items-center gap-1.5 text-xs text-ink-600">
                      <Link2 size={12} /> {selectedLocation.app_url}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-signal-red">
                      <AlertTriangle size={12} /> No app URL set — QR provisioning is blocked until you add one.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEditLocation(true)}
                    className="tap-target flex items-center gap-2 border-2 border-ink px-3 py-2 text-sm font-semibold text-ink"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <AmberButton onClick={() => setShowQuickAdd(true)} className="w-auto px-4">
                    <LayoutGrid size={15} /> Quick-add zones
                  </AmberButton>
                </div>
              </div>

              {Object.keys(zonesByFloor).length === 0 ? (
                <div className="border-2 border-dashed border-line bg-white px-4 py-8 text-center text-sm text-ink-600">
                  No zones on this site yet. Use "Quick-add zones" to lay out a floor.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {Object.entries(zonesByFloor)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([floor, floorZones]) => (
                      <div key={floor} className="border-2 border-line bg-white">
                        <p className="border-b-2 border-line bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
                          {floor}
                        </p>
                        <div className="divide-y divide-line">
                          {floorZones.map((z) => (
                            <div key={z.zone_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-xs text-ink-600">{z.zone_id}</p>
                                <p className="text-sm font-medium text-ink">{z.zone_type}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <p className="text-xs text-ink-600">{z.tenant_name || 'Common area'}</p>
                                <button
                                  onClick={() => setEditingZone(z)}
                                  className="tap-target flex items-center gap-1.5 border-2 border-line px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-ink hover:text-ink"
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-600">Select a site to view its zones.</p>
          )}
        </div>
      </div>

      {showAddLocation && (
        <AddLocationModal
          onClose={() => setShowAddLocation(false)}
          onCreated={(locationId) => {
            setShowAddLocation(false);
            load();
            setSelectedLocationId(locationId);
          }}
        />
      )}

      {showEditLocation && selectedLocation && (
        <EditLocationModal
          location={selectedLocation}
          onClose={() => setShowEditLocation(false)}
          onSaved={() => {
            setShowEditLocation(false);
            load();
          }}
        />
      )}

      {showQuickAdd && selectedLocation && (
        <QuickAddZonesDrawer
          location={selectedLocation}
          onClose={() => setShowQuickAdd(false)}
          onAdded={() => {
            setShowQuickAdd(false);
            load();
          }}
        />
      )}

      {editingZone && (
        <EditZoneModal
          zone={editingZone}
          assetCount={assetCountByZone[editingZone.zone_id] || 0}
          onClose={() => setEditingZone(null)}
          onSaved={() => {
            setEditingZone(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddLocationModal({ onClose, onCreated }) {
  const toast = useToast();
  const [siteCode, setSiteCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!siteCode || !name) return toast.error('Site code and name are required.');
    setSubmitting(true);
    const { error } = await supabase.rpc('ft_add_location', {
      p_location_id: siteCode.toUpperCase(),
      p_name: name,
      p_address: address || null,
      p_app_url: appUrl || null
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success('Location added.');
    onCreated(siteCode.toUpperCase());
  }

  return (
    <Modal title="Add location" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Site code" hint="Short code used in every QR tag, e.g. KRM1">
          <input value={siteCode} onChange={(e) => setSiteCode(e.target.value.toUpperCase())} className={inputClass} />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Address" hint="Optional">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>
        <Field label="App URL" hint="Production domain this site's QR codes resolve to, e.g. https://fieldtrace.vercel.app — required before provisioning assets here">
          <input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} className={inputClass} placeholder="https://fieldtrace.vercel.app" />
        </Field>
        <PrimaryButton type="submit" loading={submitting}>
          Add location
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function EditLocationModal({ location, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(location.name || '');
  const [address, setAddress] = useState(location.address || '');
  const [appUrl, setAppUrl] = useState(location.app_url || '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name) return toast.error('Name is required.');
    setSubmitting(true);
    const { error } = await supabase.rpc('ft_update_location', {
      p_location_id: location.location_id,
      p_name: name,
      p_address: address || null,
      p_app_url: appUrl || null
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success('Site updated.');
    onSaved();
  }

  return (
    <Modal title={`Edit ${location.location_id}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Address" hint="Optional">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>
        <Field label="App URL" hint="Production domain this site's QR codes resolve to — required before provisioning assets here">
          <input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} className={inputClass} placeholder="https://fieldtrace.vercel.app" />
        </Field>
        <PrimaryButton type="submit" loading={submitting}>
          Save changes
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function EditZoneModal({ zone, assetCount, onClose, onSaved }) {
  const toast = useToast();
  const [floor, setFloor] = useState(zone.floor_level || '');
  const [zoneType, setZoneType] = useState(zone.zone_type || ZONE_TYPES[0]);
  const [label, setLabel] = useState(zone.tenant_name || '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!floor.trim()) return toast.error('Floor is required.');
    setSubmitting(true);
    const { error } = await supabase.rpc('ft_update_zone', {
      p_zone_id: zone.zone_id,
      p_floor_level: floor.trim().toUpperCase(),
      p_zone_type: zoneType,
      p_tenant_name: label.trim() || null
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success('Zone updated.');
    onSaved();
  }

  return (
    <Modal title="Edit zone" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Zone code" hint="Fixed — every asset and QR tag already scanned points at this code">
          <input value={zone.zone_id} disabled className={`${inputClass} cursor-not-allowed bg-line/30 text-ink-600`} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Floor">
            <input value={floor} onChange={(e) => setFloor(e.target.value.toUpperCase())} className={inputClass} />
          </Field>
          <Field label="Zone type">
            <select value={zoneType} onChange={(e) => setZoneType(e.target.value)} className={inputClass}>
              {ZONE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Zone name / label" hint="Shown wherever this zone is listed, e.g. a tenant or a custom room name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="Common area" />
        </Field>
        {assetCount > 0 && (
          <p className="text-xs text-ink-600">
            {assetCount} asset{assetCount === 1 ? '' : 's'} currently assigned here will stay linked to this zone.
          </p>
        )}
        <PrimaryButton type="submit" loading={submitting}>
          Save changes
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function QuickAddZonesDrawer({ location, onClose, onAdded }) {
  const toast = useToast();
  const [floor, setFloor] = useState('F1');
  const [checked, setChecked] = useState({});
  const [labels, setLabels] = useState(() => Object.fromEntries(STANDARD_ROOMS.map((r) => [r.key, r.label])));
  const [submitting, setSubmitting] = useState(false);

  function toggle(key) {
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  }

  function setLabel(key, value) {
    setLabels((l) => ({ ...l, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const selected = STANDARD_ROOMS.filter((r) => checked[r.key]);
    if (selected.length === 0) return toast.error('Select at least one room to add.');

    const specs = selected.map((r) => ({
      zone_type: r.zone_type,
      suffix: r.suffix,
      tenant_name: (labels[r.key] || '').trim() || null
    }));

    setSubmitting(true);
    const { data, error } = await supabase.rpc('ft_quick_add_zones', {
      p_location_id: location.location_id,
      p_floor: floor.toUpperCase(),
      p_zone_specs: specs
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`${data?.length ?? specs.length} zone(s) added to ${floor.toUpperCase()}.`);
    onAdded();
  }

  return (
    <Drawer title={`Quick-add zones — ${location.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Floor" hint="e.g. F1, F2, F3">
          <input value={floor} onChange={(e) => setFloor(e.target.value.toUpperCase())} className={inputClass} />
        </Field>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Standard rooms</span>
          <p className="mb-3 text-xs text-ink-600">
            Check the rooms to create on this floor. Each label is editable — change it before adding if you want
            something more specific (e.g. "Pantry" → "Pantry East").
          </p>
          <div className="flex flex-col gap-2">
            {STANDARD_ROOMS.map((r) => (
              <div key={r.key} className="flex items-center gap-3 border-2 border-line bg-white px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={!!checked[r.key]}
                  onChange={() => toggle(r.key)}
                  className="h-5 w-5 shrink-0 accent-ink"
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-xs text-ink-600">{r.zone_type}</span>
                  <input
                    value={labels[r.key]}
                    onChange={(e) => setLabel(r.key, e.target.value)}
                    disabled={!checked[r.key]}
                    className="min-w-0 flex-1 border-b-2 border-line bg-transparent px-1 py-0.5 text-sm font-medium text-ink outline-none focus:border-ink disabled:text-ink-600"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <PrimaryButton type="submit" loading={submitting}>
          Add selected zones
        </PrimaryButton>
      </form>
    </Drawer>
  );
}
