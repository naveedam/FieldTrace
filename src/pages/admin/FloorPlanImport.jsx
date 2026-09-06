import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  MapPinPlus,
  Trash2,
  Pencil,
  Printer,
  CheckCircle2,
  Lock,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { supabase, uploadFloorPlanImage } from '../../lib/supabaseClient.js';
import { readImageDimensions } from '../../lib/imageDimensions.js';
import { ASSET_CATEGORIES } from '../../lib/assetCategories.js';
import { Field, inputClass, PrimaryButton, AmberButton, Spinner } from '../../components/ui.jsx';
import { Modal } from '../../components/Modal.jsx';
import TagCard from '../../components/TagCard.jsx';

export default function FloorPlanImport({ sites, toast }) {
  const [siteId, setSiteId] = useState('');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [newFloorLevel, setNewFloorLevel] = useState('F1');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const selectedSite = sites.find((s) => s.location_id === siteId);
  const siteMissingUrl = selectedSite && !selectedSite.app_url;

  async function loadPlans(forSiteId) {
    if (!forSiteId) {
      setPlans([]);
      return;
    }
    setLoadingPlans(true);
    const { data } = await supabase
      .from('ft_floor_plans')
      .select('*')
      .eq('location_id', forSiteId)
      .order('created_at', { ascending: false });
    setPlans(data || []);
    setLoadingPlans(false);
  }

  useEffect(() => {
    setActivePlan(null);
    loadPlans(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function handleFile(file) {
    if (!file) return;
    if (!siteId) return toast.error('Select a site first.');
    if (siteMissingUrl) return toast.error(`${selectedSite.name} has no app URL set — configure it under Sites & Spaces first.`);
    if (!newFloorLevel.trim()) return toast.error('Enter a floor label, e.g. F1.');

    setUploading(true);
    try {
      let uploadTarget, width, height;
      if (file.type === 'application/pdf') {
        const { renderPdfFirstPageToPng } = await import('../../lib/pdfRender.js');
        const rendered = await renderPdfFirstPageToPng(file);
        uploadTarget = rendered.blob;
        width = rendered.width;
        height = rendered.height;
      } else if (file.type.startsWith('image/')) {
        uploadTarget = file;
        const dims = await readImageDimensions(file);
        width = dims.width;
        height = dims.height;
      } else {
        throw new Error('Upload a PDF or an image (PNG/JPG) export of the floor plan.');
      }

      const fileUrl = await uploadFloorPlanImage(uploadTarget, siteId);
      const { data, error } = await supabase.rpc('ft_create_floor_plan', {
        p_location_id: siteId,
        p_floor_level: newFloorLevel.trim().toUpperCase(),
        p_file_url: fileUrl,
        p_width: width,
        p_height: height
      });
      if (error) throw error;

      toast.success('Floor plan uploaded — click the plan to start tagging assets.');
      setActivePlan(data);
      loadPlans(siteId);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (activePlan) {
    return (
      <PlanTagger
        plan={activePlan}
        site={sites.find((s) => s.location_id === activePlan.location_id)}
        toast={toast}
        onBack={() => setActivePlan(null)}
      />
    );
  }

  return (
    <section>
      <h3 className="mb-1 font-semibold text-ink">Import floor plan &amp; tag assets</h3>
      <p className="mb-4 text-xs text-ink-600">
        Upload a floor plan (PDF or image export from any CAD tool), click to drop a pin per asset or asset group, then
        register everything at once.
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
            <Field label="Floor" hint="e.g. F1, F2">
              <input value={newFloorLevel} onChange={(e) => setNewFloorLevel(e.target.value.toUpperCase())} className={inputClass} />
            </Field>
          </div>

          {siteMissingUrl && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-signal-red">
              <AlertTriangle size={13} /> This site has no app URL — set one under Sites &amp; Spaces before importing a plan.
            </p>
          )}

          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading || !siteId}
              onClick={() => fileInputRef.current?.click()}
              className="tap-target flex h-28 w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-line bg-paper text-ink-600 disabled:opacity-50"
            >
              {uploading ? <Spinner size={20} /> : <UploadCloud size={20} />}
              <span className="text-sm font-medium">{uploading ? 'Processing…' : 'Upload floor plan (PDF or image)'}</span>
            </button>
          </div>
        </div>

        <div className="border-2 border-line bg-white p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Existing floor plans</p>
          {!siteId ? (
            <p className="text-sm text-ink-600">Select a site to see its floor plans.</p>
          ) : loadingPlans ? (
            <Spinner size={18} />
          ) : plans.length === 0 ? (
            <p className="text-sm text-ink-600">No floor plans uploaded for this site yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {plans.map((p) => (
                <button
                  key={p.plan_id}
                  onClick={() => setActivePlan(p)}
                  className="flex items-center justify-between py-2.5 text-left"
                >
                  <span className="text-sm font-medium text-ink">{p.floor_level}</span>
                  <span className="text-xs text-ink-600">{new Date(p.created_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PlanTagger({ plan, site, toast, onBack }) {
  const [zones, setZones] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingClick, setPendingClick] = useState(null); // {x, y} normalized, awaiting new-tag form
  const [editingTag, setEditingTag] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [registeredAssets, setRegisteredAssets] = useState(null);
  const imgRef = useRef(null);

  async function load() {
    setLoading(true);
    const [{ data: zoneRows }, { data: tagRows }] = await Promise.all([
      supabase.from('ft_zones').select('*').eq('location_id', plan.location_id).eq('floor_level', plan.floor_level),
      supabase.from('ft_floor_plan_tags').select('*').eq('plan_id', plan.plan_id).order('created_at')
    ]);
    setZones(zoneRows || []);
    setTags(tagRows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.plan_id]);

  function handleImageClick(e) {
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingClick({ x, y });
  }

  const pendingTags = tags.filter((t) => t.status === 'Pending');
  const registeredTags = tags.filter((t) => t.status === 'Registered');

  async function handleRegisterAll() {
    if (pendingTags.length === 0) return toast.error('No pending tags to register.');
    if (pendingTags.some((t) => !t.zone_id)) return toast.error('Every tag needs a zone assigned before registering.');

    setRegistering(true);
    const { data, error } = await supabase.rpc('ft_register_floor_plan_tags', {
      p_tag_ids: pendingTags.map((t) => t.tag_id)
    });
    setRegistering(false);

    if (error) return toast.error(error.message);

    setRegisteredAssets(data || []);
    toast.success(`${data?.length ?? 0} assets registered and QR sheet generated.`);
    load();
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <section className="flex justify-center py-10">
        <Spinner size={24} />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-ink-600">
          <ArrowLeft size={15} /> Back to floor plans
        </button>
        <p className="text-sm font-semibold text-ink">
          {site?.name} · {plan.floor_level}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="relative border-2 border-ink bg-white">
          <img
            ref={imgRef}
            src={plan.file_url}
            alt={`Floor plan — ${plan.floor_level}`}
            onClick={handleImageClick}
            className="block w-full cursor-crosshair select-none"
          />
          {tags.map((t) => (
            <PinMarker key={t.tag_id} tag={t} onClick={() => (t.status === 'Pending' ? setEditingTag(t) : showRegisteredInfo(t, toast))} />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <div className="border-2 border-line bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
              Pending tags ({pendingTags.length})
            </p>
            {pendingTags.length === 0 ? (
              <p className="text-sm text-ink-600">Click the plan to drop a pin.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {pendingTags.map((t) => (
                  <TagRow key={t.tag_id} tag={t} zones={zones} onEdit={() => setEditingTag(t)} onDeleted={load} toast={toast} />
                ))}
              </div>
            )}
          </div>

          {registeredTags.length > 0 && (
            <div className="border-2 border-line bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
                Registered ({registeredTags.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {registeredTags.map((t) => (
                  <div key={t.tag_id} className="flex items-center justify-between text-xs">
                    <span className="text-ink-600">{t.category}</span>
                    <span className="flex items-center gap-1 font-mono font-semibold text-signal-green">
                      <CheckCircle2 size={12} /> {t.registered_asset_id_start}
                      {t.registered_asset_id_start !== t.registered_asset_id_end && ` → ${t.registered_asset_id_end}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AmberButton onClick={handleRegisterAll} loading={registering} disabled={pendingTags.length === 0}>
            <MapPinPlus size={16} /> Create &amp; Print ({pendingTags.length})
          </AmberButton>
        </div>
      </div>

      {registeredAssets && registeredAssets.length > 0 && (
        <div className="mt-6">
          <div className="mb-4 flex items-center justify-between border-2 border-ink bg-white px-4 py-3">
            <p className="text-sm font-semibold text-ink">{registeredAssets.length} assets ready to print</p>
            <button
              onClick={handlePrint}
              className="tap-target flex items-center gap-2 border-2 border-ink bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              <Printer size={15} /> Print sheet
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
            {registeredAssets.map((a) => (
              <TagCard key={a.asset_id} title={a.category.toUpperCase()} id={a.asset_id} url={a.qr_code_url} sub="Asset tag" />
            ))}
          </div>
        </div>
      )}

      {pendingClick && (
        <TagFormModal
          mode="create"
          planId={plan.plan_id}
          zones={zones}
          pos={pendingClick}
          onClose={() => setPendingClick(null)}
          onSaved={() => {
            setPendingClick(null);
            load();
          }}
          toast={toast}
        />
      )}

      {editingTag && (
        <TagFormModal
          mode="edit"
          tag={editingTag}
          planId={plan.plan_id}
          zones={zones}
          onClose={() => setEditingTag(null)}
          onSaved={() => {
            setEditingTag(null);
            load();
          }}
          toast={toast}
        />
      )}
    </section>
  );
}

function showRegisteredInfo(tag, toast) {
  toast.info(`${tag.category} · ${tag.registered_asset_id_start}${tag.registered_asset_id_start !== tag.registered_asset_id_end ? ` → ${tag.registered_asset_id_end}` : ''} — already registered.`);
}

function PinMarker({ tag, onClick }) {
  const category = ASSET_CATEGORIES.find((c) => c.label === tag.category);
  const locked = tag.status === 'Registered';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ left: `${tag.pos_x * 100}%`, top: `${tag.pos_y * 100}%` }}
      className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 border-2 px-1.5 py-0.5 text-[10px] font-bold shadow ${
        locked ? 'border-signal-green bg-signal-green text-paper' : 'border-amber bg-amber text-ink'
      }`}
    >
      {locked && <Lock size={9} />}
      {category?.prefix || tag.category} ×{tag.quantity}
    </button>
  );
}

function TagRow({ tag, zones, onEdit, onDeleted, toast }) {
  const [deleting, setDeleting] = useState(false);
  const zone = zones.find((z) => z.zone_id === tag.zone_id);

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase.rpc('ft_delete_floor_plan_tag', { p_tag_id: tag.tag_id });
    setDeleting(false);
    if (error) return toast.error(error.message);
    onDeleted();
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div>
        <p className="text-sm font-medium text-ink">
          {tag.category} × {tag.quantity}
        </p>
        <p className={`text-xs ${zone ? 'text-ink-600' : 'text-signal-red'}`}>{zone ? zone.zone_type : 'No zone assigned'}</p>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onEdit} className="tap-target flex items-center justify-center border-2 border-line p-1.5 text-ink-600">
          <Pencil size={13} />
        </button>
        <button onClick={handleDelete} disabled={deleting} className="tap-target flex items-center justify-center border-2 border-line p-1.5 text-signal-red">
          {deleting ? <Spinner size={13} /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

function TagFormModal({ mode, tag, planId, zones, pos, onClose, onSaved, toast }) {
  const [zoneId, setZoneId] = useState(tag?.zone_id || zones[0]?.zone_id || '');
  const [category, setCategory] = useState(tag?.category || ASSET_CATEGORIES[0].label);
  const [makeModel, setMakeModel] = useState(tag?.make_model || '');
  const [quantity, setQuantity] = useState(tag?.quantity || 1);
  const [submitting, setSubmitting] = useState(false);

  const selectedCategory = ASSET_CATEGORIES.find((c) => c.label === category);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!quantity || quantity < 1) return toast.error('Quantity must be at least 1.');

    setSubmitting(true);
    if (mode === 'create') {
      const { error } = await supabase.rpc('ft_add_floor_plan_tag', {
        p_plan_id: planId,
        p_zone_id: zoneId || null,
        p_category: category,
        p_id_prefix: selectedCategory.prefix,
        p_make_model: makeModel || null,
        p_quantity: Number(quantity),
        p_pos_x: pos.x,
        p_pos_y: pos.y
      });
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success('Pin added.');
    } else {
      const { error } = await supabase.rpc('ft_update_floor_plan_tag', {
        p_tag_id: tag.tag_id,
        p_zone_id: zoneId || null,
        p_category: category,
        p_id_prefix: selectedCategory.prefix,
        p_make_model: makeModel || null,
        p_quantity: Number(quantity),
        p_pos_x: null,
        p_pos_y: null
      });
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success('Pin updated.');
    }
    onSaved();
  }

  return (
    <Modal title={mode === 'create' ? 'Tag asset' : 'Edit tag'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Zone" hint={zones.length === 0 ? 'No zones on this floor yet — add one under Sites & Spaces' : undefined}>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                {z.zone_type} {z.tenant_name ? `(${z.tenant_name})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Make / model" hint="Optional">
            <input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Quantity" hint="Assets at this pin">
            <input type="number" min={1} max={500} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <PrimaryButton type="submit" loading={submitting}>
          {mode === 'create' ? 'Add pin' : 'Save changes'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
