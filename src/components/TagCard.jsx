import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MapPin } from 'lucide-react';

export default function TagCard({ title, id, url, sub }) {
  return (
    <div className="flex flex-col items-center gap-2 border-2 border-ink bg-white p-4 text-center break-inside-avoid">
      <p className="text-[10px] font-semibold tracking-wide text-ink-600">{title}</p>
      <QRCodeSVG value={url} size={120} level="M" fgColor="#12181F" bgColor="#FFFFFF" />
      <p className="font-mono text-xs font-semibold text-ink">{id}</p>
      <p className="flex items-center gap-1 text-[10px] text-ink-600">
        <MapPin size={9} /> {sub}
      </p>
    </div>
  );
}
