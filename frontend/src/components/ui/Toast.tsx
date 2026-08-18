import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
}

interface ToastOptions {
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

function measureAnchor(): { top: number; left: number; width: number; height: number } {
  const el =
    document.querySelector('[data-toast-anchor]') ??
    document.querySelector('main');
  if (el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const toast = useCallback((message: string, options?: ToastOptions) => {
    const id = ++nextId;
    const duration = options?.duration
      ?? (message.includes('\n') ? 8000 : 3500);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  useLayoutEffect(() => {
    if (toasts.length === 0) return;
    const update = () => setBox(measureAnchor());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          className="fixed z-[100] flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-ink text-surface text-[13px] font-medium shadow-xl pointer-events-auto animate-in max-w-[min(92vw,560px)]"
              style={{ animationDuration: '160ms' }}
            >
              <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
              <span className="whitespace-pre-line leading-snug">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
