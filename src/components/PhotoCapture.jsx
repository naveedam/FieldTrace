import React, { useRef, useState } from 'react';
import { Camera, RotateCcw, ImageOff } from 'lucide-react';

/**
 * Forces a live camera capture via capture="environment" — on iOS Safari and
 * Android Chrome this opens the camera app directly rather than a gallery
 * picker, which is what keeps techs from uploading an old/borrowed photo.
 */
export default function PhotoCapture({ label = 'Photo evidence', required = true, onCapture, file }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const handleChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    onCapture(f);
  };

  const retake = () => {
    setPreview(null);
    onCapture(null);
    inputRef.current?.click();
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label} {required && <span className="text-signal-red">*</span>}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />

      {preview ? (
        <div className="relative border-2 border-line">
          <img src={preview} alt="Captured evidence" className="h-48 w-full object-cover" />
          <button
            type="button"
            onClick={retake}
            className="tap-target absolute right-2 top-2 flex items-center gap-1.5 border-2 border-ink bg-paper px-3 py-2 text-xs font-semibold"
          >
            <RotateCcw size={14} /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="tap-target flex h-32 w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-line bg-white text-ink-600"
        >
          <Camera size={22} />
          <span className="text-sm font-medium">Open camera</span>
        </button>
      )}

      {!preview && required && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-600">
          <ImageOff size={12} /> Gallery uploads aren't accepted — a live photo is required.
        </p>
      )}
    </div>
  );
}
