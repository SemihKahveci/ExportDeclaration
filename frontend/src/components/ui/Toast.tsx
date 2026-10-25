import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, options?: ToastOptions) => {
    const id = ++nextId;
    const duration = options?.duration
      ?? (message.includes('\n') ? 8000 : 3500);
    setTimeout(() => {
      setToasts((curr) => curr.filter((t) => t.id !== id));
    }, duration);
    setToasts((prev) => {
      const withoutSame = prev.filter((t) => t.message !== message);
      return [...withoutSame, { id, message }].slice(-2);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          className="fixed z-[100] bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-none"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-ink text-surface text-[13px] font-medium shadow-xl pointer-events-auto animate-in max-w-[min(92vw,380px)]"
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
