import React, { useEffect, useState } from 'react';
import { Share2, Plus, Copy, Ban, Image as ImageIcon, Trash2, ExternalLink } from 'lucide-react';
import { supabase, uploadSitePhoto } from '../../lib/supabaseClient.js';
import { useToast } from '../../lib/toast.jsx';
import { Field, inputClass, PrimaryButton, Spinner } from '../../components/ui.jsx';
import { Modal } from '../../components/Modal.jsx';

export default function ClientPortal() {
  const toast = useToast();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [zones, setZones] = useState([]);
  const [shares, setShares] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateShare, setShowCreateShare] = useState(false);
  const [showAddPhoto, setShowAddPhoto] = useState(false);

  async function load() {
    setLoading(true);
    const { data: siteRows } = await supabase.from('ft_locations').select('*').order('name');
    setSites(siteRows || []);
    if (!siteId && siteRows?.length) setSiteId(siteRows[0].location_id);
    setLoading(false);
  }

  async function loadSiteData(forSiteId) {
    if (!forSiteId) return;
    const [{ data: zoneRows }, { data: shareRows }, { data: photoRows }] = await Promise.all([
      supabase.from('ft_zones').select('*').eq('location_id', forSiteId),
      supabase.from('ft_client_shares').select('*, ft_client_share_zones(zone_id)').eq('location_id', forSiteId).order('created_at', { ascending: false }),
      supabase.from('ft_site_photos').select('*').eq('location_id', forSiteId).order('created_at', { ascending: false })
    ]);
    setZones(zoneRows || []);
    setShares(shareRows || []);
    setPhotos(photoRows || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSiteData(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const selectedSite = sites.find((s) => s.location_id === siteId);

  function portalUrl(token) {
    return `${window.location.origin}/portal/${token}`;
  }

  function copyLink(token) {
    navigator.clipboard?.writeText(portalUrl(token));
    toast.success('Portal link copied.');
  }

  async function revokeShare(shareId) {
    const { error } = await supabase.rpc('ft_revoke_client_share', { p_share_id: shareId });
    if (error) return toast.error(error.message);
    toast.success('Link revoked.');
    loadSiteData(siteId);
  }

  async function deletePhoto(photoId) {
    const { error } = await supabase.rpc('ft_delete_site_photo', { p_photo_id: photoId });
    if (error) return toast.error(error.message);
    loadSiteData(siteId);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2.5">
          <Share2 size={18} className="mt-0.5 text-ink" />
          <div>
            <h2 className="font-semibold text-ink">Client Portal</h2>
            <p className="text-xs text-ink-600">Share a read-only handover view with a tenant — no login required on their end</p>
          </div>
        </div>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={`${inputClass} max-w-xs`}>
          {sites.map((s) => (
            <option key={s.location_id} value={s.location_id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Shares</h3>
          <button
            onClick={() => setShowCreateShare(true)}
            className="tap-target flex items-center gap-2 border-2 border-ink px-4 py-2 text-sm font-semibold text-ink"
          >
            <Plus size={15} /> Create share
          </button>
        </div>

        {shares.length === 0 ? (
          <div className="border-2 border-dashed border-line bg-white px-4 py-6 text-center text-sm text-ink-600">
            No shares yet for {selectedSite?.name}.
          </div>
        ) : (
          <div className="flex flex-col divide-y-2 divide-line border-2 border-ink">
            {shares.map((sh) => (
              <div key={sh.share_id} className="flex items-center justify-between gap-3 bg-white px-4 py-3">
                <div>
                  <p className="font-medium text-ink">{sh.label}</p>
                  <p className="text-xs text-ink-600">
                    {sh.ft_client_share_zones?.length || 0} zone(s) · {sh.revoked ? 'Revoked' : 'Active'} · {new Date(sh.created_at).toLocaleDateString()}
                  </p>
                </div>
                {!sh.revoked && (
                  <div className="flex items-center gap-2">
                    <a
                      href={portalUrl(sh.access_token)}
                      target="_blank"
                      rel="noreferrer"
                      className="tap-target flex items-center gap-1.5 border-2 border-line px-3 py-1.5 text-xs font-semibold text-ink-600"
                    >
                      <ExternalLink size={13} /> Open
                    </a>
                    <button
                      onClick={() => copyLink(sh.access_token)}
                      className="tap-target flex items-center gap-1.5 border-2 border-ink px-3 py-1.5 text-xs font-semibold text-ink"
                    >
                      <Copy size={13} /> Copy link
                    </button>
                    <button
                      onClick={() => revokeShare(sh.share_id)}
                      className="tap-target flex items-center gap-1.5 border-2 border-signal-red px-3 py-1.5 text-xs font-semibold text-signal-red"
                    >
                      <Ban size={13} /> Revoke
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Handover Photos</h3>
          <button
            onClick={() => setShowAddPhoto(true)}
            className="tap-target flex items-center gap-2 border-2 border-ink px-4 py-2 text-sm font-semibold text-ink"
          >
            <ImageIcon size={15} /> Add photo
          </button>
        </div>

        {photos.length === 0 ? (
          <div className="border-2 border-dashed border-line bg-white px-4 py-6 text-center text-sm text-ink-600">
            No handover photos uploaded for {selectedSite?.name} yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <div key={p.photo_id} className="relative border-2 border-line bg-white">
                <img src={p.photo_url} alt={p.caption || p.stage} className="h-28 w-full object-cover" />
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span
                    className={`text-[10px] font-bold ${p.stage === 'Before' ? 'text-signal-red' : 'text-signal-green'}`}
                  >
                    {p.stage.toUpperCase()}
                  </span>
                  <button onClick={() => deletePhoto(p.photo_id)} className="text-ink-600">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreateShare && (
        <CreateShareModal
          site={selectedSite}
          zones={zones}
          onClose={() => setShowCreateShare(false)}
          onCreated={() => {
            setShowCreateShare(false);
            loadSiteData(siteId);
          }}
        />
      )}

      {showAddPhoto && (
        <AddPhotoModal
          site={selectedSite}
          zones={zones}
          onClose={() => setShowAddPhoto(false)}
          onAdded={() => {
            setShowAddPhoto(false);
            loadSiteData(siteId);
          }}
        />
      )}
    </div>
  );
}

function CreateShareModal({ site, zones, onClose, onCreated }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [zoneIds, setZoneIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState(null);

  function toggleZone(id) {
    setZoneIds((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim()) return toast.error('Give this share a label, e.g. the tenant name.');
    if (zoneIds.length === 0) return toast.error('Select at least one zone.');

    setSubmitting(true);
    const { data, error } = await supabase.rpc('ft_create_client_share', {
      p_location_id: site.location_id,
      p_zone_ids: zoneIds,
      p_label: label.trim()
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);

    const url = `${window.location.origin}/portal/${data.access_token}`;
    setCreatedLink(url);
    toast.success('Share created.');
  }

  if (createdLink) {
    return (
      <Modal title="Share created" onClose={onCreated}>
        <p className="mb-3 text-sm text-ink-600">Send this link to your client — it needs no login on their end.</p>
        <div className="flex items-center gap-2 border-2 border-line bg-paper px-3 py-2.5">
          <code className="flex-1 truncate text-xs">{createdLink}</code>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(createdLink);
              toast.success('Copied.');
            }}
            className="tap-target flex items-center gap-1 border-2 border-ink px-2.5 py-1.5 text-xs font-semibold"
          >
            <Copy size={12} /> Copy
          </button>
        </div>
        <div className="mt-4">
          <PrimaryButton onClick={onCreated}>Done</PrimaryButton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create client share" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Label" hint="Shown to you only, e.g. the tenant or client name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="Nimbus Analytics — Floor 3" />
        </Field>
        <div>
          <span className="mb-2 block text-sm font-medium text-ink">Zones to include</span>
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {zones.map((z) => (
              <label key={z.zone_id} className="flex items-center gap-3 border-2 border-line bg-white px-3.5 py-2.5">
                <input type="checkbox" checked={zoneIds.includes(z.zone_id)} onChange={() => toggleZone(z.zone_id)} className="h-5 w-5 accent-ink" />
                <span className="text-sm font-medium text-ink">
                  {z.floor_level} · {z.zone_type} {z.tenant_name ? `(${z.tenant_name})` : ''}
                </span>
              </label>
            ))}
            {zones.length === 0 && <p className="text-xs text-ink-600">No zones on this site yet.</p>}
          </div>
        </div>
        <PrimaryButton type="submit" loading={submitting}>
          Create share
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function AddPhotoModal({ site, zones, onClose, onAdded }) {
  const toast = useToast();
  const [zoneId, setZoneId] = useState('');
  const [stage, setStage] = useState('Before');
  const [caption, setCaption] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return toast.error('Choose a photo to upload.');

    setSubmitting(true);
    try {
      const url = await uploadSitePhoto(file, site.location_id);
      const { error } = await supabase.rpc('ft_add_site_photo', {
        p_location_id: site.location_id,
        p_zone_id: zoneId || null,
        p_stage: stage,
        p_photo_url: url,
        p_caption: caption || null,
        p_taken_at: takenAt || null
      });
      if (error) throw error;
      toast.success('Photo added.');
      onAdded();
    } catch (err) {
      toast.error(err.message || 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add handover photo" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Photo">
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Zone" hint="Optional — leave unset for a whole-site photo">
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass}>
              <option value="">Whole site</option>
              {zones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.floor_level} · {z.zone_type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Stage">
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
              <option>Before</option>
              <option>After</option>
            </select>
          </Field>
        </div>
        <Field label="Caption" hint="Optional">
          <input value={caption} onChange={(e) => setCaption(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Date taken" hint="Optional">
          <input type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} className={inputClass} />
        </Field>
        <PrimaryButton type="submit" loading={submitting}>
          Add photo
        </PrimaryButton>
      </form>
    </Modal>
  );
}
