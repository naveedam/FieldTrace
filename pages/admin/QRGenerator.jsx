import React, { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Printer } from 'lucide-react';
import { Field, inputClass, PrimaryButton } from '../../components/ui.jsx';

const ZONE_TYPES = ['Washroom', 'DB Room', 'Bay', 'Meeting Room', 'Pantry', 'Lobby', 'Server Room'];
const ASSET_CATEGORIES = ['Task Chair', 'AV Display', 'Pod', 'Meeting Table', 'Standing Desk', 'Sofa', 'Projector', 'Access Point', 'Other'];

export default function QRGenerator() {
  const [siteCode, setSiteCode] = useState('KRM1');
  const [origin, setOrigin] = useState(window.location.origin);
  const printRef = useRef(null);

  const [zoneFloor, setZoneFloor] = useState('F2');
  const [zoneType, setZoneType] = useState(ZONE_TYPES[0]);
  const [zoneSuffix, setZoneSuffix] = useState('N');

  const [assetCategory, setAssetCategory] = useState(ASSET_CATEGORIES[0]);
  const [assetPrefix, setAssetPrefix] = useState('CHAIR');
  const [assetStart, setAssetStart] = useState(1);
  const [assetCount, setAssetCount] = useState(10);

  const zoneId = `ZN-${siteCode}-${zoneFloor}-${zoneType.replace(/\s+/g, '').toUpperCase()}-${zoneSuffix}`.replace(/-+/g, '-');
  const zoneUrl = `${origin}/scan?type=zone&id=${encodeURIComponent(zoneId)}`;

  const assetTags = useMemo(() => {
    return Array.from({ length: Math.max(0, Number(assetCount) || 0) }, (_, i) => {
      const seq = String(Number(assetStart) + i).padStart(5, '0');
      const id = `FIT-${assetPrefix.toUpperCase()}-${seq}`;
      return { id, url: `${origin}/scan?type=asset&id=${encodeURIComponent(id)}` };
    });
  }, [assetPrefix, assetStart, assetCount, origin]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-2.5">
        <QrCode size={18} className="mt-0.5 text-ink" />
        <div>
          <h2 className="font-semibold text-ink">QR batch generator</h2>
          <p className="text-xs text-ink-600">Generate print-ready QR anchors for a zone and a sequential run of assets</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-2 border-line bg-white p-5">
          <h3 className="mb-4 font-semibold text-ink">Site</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Site code" hint="Short code used in every tag">
              <input value={siteCode} onChange={(e) => setSiteCode(e.target.value.toUpperCase())} className={inputClass} />
            </Field>
            <Field label="App URL" hint="Domain the QR links resolve to">
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </div>

        <div className="border-2 border-line bg-white p-5">
          <h3 className="mb-4 font-semibold text-ink">Single zone tag</h3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Floor">
              <input value={zoneFloor} onChange={(e) => setZoneFloor(e.target.value.toUpperCase())} className={inputClass} />
            </Field>
            <Field label="Zone type">
              <select value={zoneType} onChange={(e) => setZoneType(e.target.value)} className={inputClass}>
                {ZONE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Suffix">
              <input value={zoneSuffix} onChange={(e) => setZoneSuffix(e.target.value.toUpperCase())} className={inputClass} />
            </Field>
          </div>
        </div>

        <div className="border-2 border-line bg-white p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold text-ink">Sequential asset tags</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Category">
              <select value={assetCategory} onChange={(e) => setAssetCategory(e.target.value)} className={inputClass}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="ID prefix">
              <input value={assetPrefix} onChange={(e) => setAssetPrefix(e.target.value.toUpperCase())} className={inputClass} />
            </Field>
            <Field label="Start #">
              <input type="number" value={assetStart} onChange={(e) => setAssetStart(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Count">
              <input type="number" value={assetCount} onChange={(e) => setAssetCount(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <PrimaryButton onClick={handlePrint} className="w-auto px-6">
          <Printer size={16} /> Print sheet
        </PrimaryButton>
      </div>

      <div ref={printRef} className="grid grid-cols-2 gap-4 border-t-2 border-line pt-6 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        <TagCard title="ZONE" id={zoneId} url={zoneUrl} sub={`${zoneType} · Floor ${zoneFloor}`} />
        {assetTags.map((t) => (
          <TagCard key={t.id} title={assetCategory.toUpperCase()} id={t.id} url={t.url} sub="Asset tag" />
        ))}
      </div>
    </div>
  );
}

function TagCard({ title, id, url, sub }) {
  return (
    <div className="flex flex-col items-center gap-2 border-2 border-ink bg-white p-4 text-center break-inside-avoid">
      <p className="text-[10px] font-semibold tracking-wide text-ink-600">{title}</p>
      <QRCodeSVG value={url} size={120} level="M" fgColor="#12181F" bgColor="#FFFFFF" />
      <p className="font-mono text-xs font-semibold text-ink">{id}</p>
      <p className="text-[10px] text-ink-600">{sub}</p>
    </div>
  );
}
