import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ShieldCheck, ShieldAlert, MapPin, ImageOff } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { Spinner, StatusPill } from '../components/ui.jsx';

export default function ClientPortalView() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: result, error: err } = await supabase.rpc('ft_get_client_portal', { p_token: token });
      if (cancelled) return;
      if (err) {
        setError(err.message || 'This link is invalid or has been revoked.');
      } else {
        setData(result);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-paper">
        <h1 className="text-lg font-semibold">Link not available</h1>
        <p className="max-w-xs text-sm text-line">{error || 'This link is invalid or has been revoked.'}</p>
      </div>
    );
  }

  const zonesById = Object.fromEntries((data.zones || []).map((z) => [z.zone_id, z]));
  const beforePhotos = (data.photos || []).filter((p) => p.stage === 'Before');
  const afterPhotos = (data.photos || []).filter((p) => p.stage === 'After');

  const assetsByCategory = {};
  for (const a of data.assets || []) {
    (assetsByCategory[a.category] ||= []).push(a);
  }

  return (
    <div className="min-h-dvh bg-paper pb-16">
      <header className="border-b-2 border-ink bg-ink px-6 py-8 text-paper print:bg-white print:text-ink">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber">FieldTrace &middot; Handover Summary</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{data.label}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-line">
          <MapPin size={14} /> {data.site?.name} {data.site?.address ? `\u2014 ${data.site.address}` : ''}
        </p>
        <button
          onClick={() => window.print()}
          className="tap-target mt-5 flex items-center gap-2 border-2 border-amber bg-amber px-4 py-2 text-sm font-semibold text-ink print:hidden"
        >
          <Printer size={15} /> Print / Save as PDF
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-bold text-ink">Before &amp; After</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <PhotoColumn title="Before" photos={beforePhotos} zonesById={zonesById} accent="text-signal-red" />
              <PhotoColumn title="After" photos={afterPhotos} zonesById={zonesById} accent="text-signal-green" />
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-lg font-bold text-ink">Asset Register</h2>
          <p className="mb-4 text-sm text-ink-600">{(data.assets || []).length} assets installed across {(data.zones || []).length} zone(s)</p>

          {Object.keys(assetsByCategory).length === 0 ? (
            <p className="text-sm text-ink-600">No assets on record for this handover yet.</p>
          ) : (
            Object.entries(assetsByCategory).map(([category, assets]) => (
              <div key={category} className="mb-6 border-2 border-ink bg-white">
                <p className="border-b-2 border-ink bg-ink px-4 py-2 text-sm font-semibold text-paper">
                  {category} <span className="font-normal text-line">({assets.length})</span>
                </p>
                <div className="divide-y divide-line">
                  {assets.map((a) => {
                    const zone = zonesById[a.current_zone_id];
                    const warrantyActive = a.warranty_expiry && new Date(a.warranty_expiry) >= new Date();
                    return (
                      <div key={a.asset_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <div>
                          <p className="font-mono text-xs text-ink-600">{a.asset_id}</p>
                          <p className="text-sm font-medium text-ink">{a.make_model || 'Model not on file'}</p>
                          {zone && (
                            <p className="text-xs text-ink-600">
                              {zone.floor_level} &middot; {zone.zone_type}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {a.warranty_expiry ? (
                            <span className={`flex items-center gap-1 text-xs font-medium ${warrantyActive ? 'text-signal-green' : 'text-signal-red'}`}>
                              {warrantyActive ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                              {warrantyActive ? 'Under warranty' : 'Warranty expired'} &middot; {a.warranty_expiry}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-600">No warranty on file</span>
                          )}
                          <StatusPill status={a.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-ink-600 print:hidden">
        This is a read-only summary generated by FieldTrace. Contact your facility team with any questions.
      </footer>
    </div>
  );
}

function PhotoColumn({ title, photos, zonesById, accent }) {
  return (
    <div>
      <p className={`mb-2 text-sm font-bold ${accent}`}>{title.toUpperCase()}</p>
      {photos.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1.5 border-2 border-dashed border-line text-ink-600">
          <ImageOff size={18} />
          <span className="text-xs">No {title.toLowerCase()} photos yet</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {photos.map((p) => {
            const zone = p.zone_id ? zonesById[p.zone_id] : null;
            return (
              <figure key={p.photo_id} className="border-2 border-line bg-white">
                <img src={p.photo_url} alt={p.caption || title} className="h-48 w-full object-cover" />
                {(p.caption || zone) && (
                  <figcaption className="px-3 py-2 text-xs text-ink-600">
                    {zone && (
                      <span className="font-medium text-ink">
                        {zone.floor_level} &middot; {zone.zone_type}.{' '}
                      </span>
                    )}
                    {p.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
