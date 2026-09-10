import React, { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Link2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../lib/toast.jsx';
import { Field, inputClass, PrimaryButton } from '../../components/ui.jsx';
import { Modal } from '../../components/Modal.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';

const ROLES = ['Technician', 'Janitor', 'Storekeeper', 'FM', 'SuperAdmin'];

const ROLE_STYLES = {
  Technician: 'bg-signal-blue/15 text-signal-blue border-signal-blue/40',
  Janitor: 'bg-ink-600/10 text-ink-600 border-ink-600/30',
  Storekeeper: 'bg-amber/15 text-amber-600 border-amber/50',
  FM: 'bg-signal-green/15 text-signal-green border-signal-green/40',
  SuperAdmin: 'bg-signal-red/15 text-signal-red border-signal-red/40'
};

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold ${ROLE_STYLES[role] || 'border-line text-ink-600'}`}>
      {role}
    </span>
  );
}

export default function Personnel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [personnel, setPersonnel] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  async function load() {
    setLoading(true);
    const [{ data: pRows }, { data: aRows }, { data: lRows }] = await Promise.all([
      supabase.from('ft_personnel').select('*').order('full_name'),
      supabase.from('ft_personnel_site_assignments').select('*'),
      supabase.from('ft_locations').select('*')
    ]);
    setPersonnel(pRows || []);
    setAssignments(aRows || []);
    setLocations(lRows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const locationById = useMemo(() => Object.fromEntries(locations.map((l) => [l.location_id, l])), [locations]);
  const sitesByPersonnel = useMemo(() => {
    const map = {};
    for (const a of assignments) {
      (map[a.personnel_id] ||= []).push(locationById[a.location_id]?.name || a.location_id);
    }
    return map;
  }, [assignments, locationById]);

  async function toggleActive(p) {
    setTogglingId(p.personnel_id);
    const { error } = await supabase.rpc('ft_set_personnel_active', {
      p_personnel_id: p.personnel_id,
      p_is_active: !p.is_active
    });
    setTogglingId(null);
    if (error) return toast.error(error.message);
    setPersonnel((prev) => prev.map((x) => (x.personnel_id === p.personnel_id ? { ...x, is_active: !x.is_active } : x)));
    toast.success(`${p.full_name} marked ${!p.is_active ? 'active' : 'inactive'}.`);
  }

  if (loading) {
    return <SkeletonRows rows={5} cols={5} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2.5">
          <Users size={18} className="mt-0.5 text-ink" />
          <div>
            <h2 className="font-semibold text-ink">Personnel</h2>
            <p className="text-xs text-ink-600">Field staff and vendors, and which sites they're assigned to</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="tap-target flex items-center gap-2 border-2 border-ink px-4 py-2.5 text-sm font-semibold text-ink"
        >
          <Plus size={15} /> Add staff
        </button>
      </div>

      <div className="overflow-x-auto border-2 border-ink">
        <table className="w-full text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Full name</th>
              <th className="px-4 py-2.5 text-left font-semibold">Phone</th>
              <th className="px-4 py-2.5 text-left font-semibold">Role</th>
              <th className="px-4 py-2.5 text-left font-semibold">Assigned sites</th>
              <th className="px-4 py-2.5 text-left font-semibold">Login</th>
              <th className="px-4 py-2.5 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {personnel.map((p, i) => (
              <tr key={p.personnel_id} className={i % 2 ? 'bg-white' : 'bg-paper'}>
                <td className="px-4 py-2.5 font-medium text-ink">
                  {p.full_name}
                  {p.agency_vendor_name && <span className="block text-xs text-ink-600">{p.agency_vendor_name}</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{p.phone}</td>
                <td className="px-4 py-2.5">
                  <RoleBadge role={p.role} />
                </td>
                <td className="px-4 py-2.5 text-ink-600">{(sitesByPersonnel[p.personnel_id] || []).join(', ') || '—'}</td>
                <td className="px-4 py-2.5">
                  {p.auth_user_id ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-signal-green">
                      <CheckCircle2 size={13} /> Linked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-ink-600">
                      <Link2 size={13} /> Pending invite
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toggleActive(p)}
                    disabled={togglingId === p.personnel_id}
                    className={`tap-target border-2 px-3 py-1.5 text-xs font-semibold ${
                      p.is_active
                        ? 'border-signal-green text-signal-green'
                        : 'border-ink-600 text-ink-600'
                    }`}
                  >
                    {p.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
              </tr>
            ))}
            {personnel.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-600">
                  No staff on file yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddStaffModal
          locations={locations}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddStaffModal({ locations, onClose, onAdded }) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [agency, setAgency] = useState('');
  const [siteIds, setSiteIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleSite(id) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error('Full name is required.');
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit phone number.');

    setSubmitting(true);
    const { error } = await supabase.rpc('ft_add_personnel', {
      p_full_name: fullName.trim(),
      p_phone: phone,
      p_role: role,
      p_agency_vendor_name: agency || null,
      p_location_ids: siteIds
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`${fullName} added.`);
    onAdded();
  }

  return (
    <Modal title="Add staff" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone" hint="10 digits">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Agency / vendor" hint="Optional">
            <input value={agency} onChange={(e) => setAgency(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Assigned sites</span>
          <div className="flex flex-col gap-2">
            {locations.map((l) => (
              <label key={l.location_id} className="flex items-center gap-3 border-2 border-line bg-white px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={siteIds.includes(l.location_id)}
                  onChange={() => toggleSite(l.location_id)}
                  className="h-5 w-5 accent-ink"
                />
                <span className="text-sm font-medium text-ink">{l.name}</span>
                <span className="ml-auto font-mono text-xs text-ink-600">{l.location_id}</span>
              </label>
            ))}
            {locations.length === 0 && <p className="text-xs text-ink-600">No sites yet — add one under Sites &amp; Spaces first.</p>}
          </div>
        </div>

        <PrimaryButton type="submit" loading={submitting}>
          Add staff
        </PrimaryButton>
      </form>
    </Modal>
  );
}
