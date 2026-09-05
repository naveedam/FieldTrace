import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScanLine, AlertTriangle } from 'lucide-react';
import ZoneScan from './ZoneScan.jsx';
import AssetScan from './AssetScan.jsx';

/**
 * Single dynamic entry point printed on every QR tag:
 *   /scan?type=zone&id=ZN-KRM1-F2-RESTROOM-N
 *   /scan?type=asset&id=FIT-CHAIR-04921
 */
export default function Scan() {
  const [params] = useSearchParams();
  const type = params.get('type');
  const id = params.get('id');

  if (!type || !id) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center text-paper">
        <ScanLine size={36} className="text-amber" />
        <div>
          <h1 className="text-lg font-semibold">No tag detected</h1>
          <p className="mt-1 max-w-xs text-sm text-line">
            Open this page by scanning a zone or asset QR sticker on-site — it needs a type and id in the link.
          </p>
        </div>
      </div>
    );
  }

  if (type === 'zone') return <ZoneScan zoneId={id} />;
  if (type === 'asset') return <AssetScan assetId={id} />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center text-paper">
      <AlertTriangle size={36} className="text-signal-red" />
      <div>
        <h1 className="text-lg font-semibold">Unrecognized tag type</h1>
        <p className="mt-1 max-w-xs text-sm text-line">
          "{type}" isn't a type this app knows how to handle. Check the QR sticker hasn't been swapped or damaged.
        </p>
      </div>
    </div>
  );
}
