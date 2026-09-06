import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 py-10" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} border-2 border-ink bg-paper`}
      >
        <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-5 py-3.5 text-paper">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="tap-target -m-2 flex items-center justify-center" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l-2 border-ink bg-paper animate-rise"
      >
        <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-5 py-3.5 text-paper">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="tap-target -m-2 flex items-center justify-center" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
