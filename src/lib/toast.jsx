import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, WifiOff } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
  offline: WifiOff
};

const STYLES = {
  success: 'bg-ink text-paper border-signal-green',
  error: 'bg-ink text-paper border-signal-red',
  info: 'bg-ink text-paper border-signal-blue',
  offline: 'bg-ink text-paper border-amber'
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', duration = 4200) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (msg, d) => push(msg, 'success', d),
    error: (msg, d) => push(msg, 'error', d ?? 6000),
    info: (msg, d) => push(msg, 'info', d),
    offline: (msg, d) => push(msg, 'offline', d ?? 0)
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col items-center gap-2 p-3 safe-bottom pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto animate-rise flex w-full max-w-md items-start gap-3 border-2 px-4 py-3 shadow-lg ${STYLES[t.type]}`}
              role="status"
            >
              <Icon size={20} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="tap-target -m-2 flex items-center justify-center opacity-70 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
