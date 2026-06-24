import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        className={[
          'fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className={[
          'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none',
        ].join(' ')}
      >
        <div
          className={[
            'w-full max-w-lg bg-surface rounded-lg border border-line shadow-xl flex flex-col max-h-[90vh] transition-all duration-200',
            open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none',
          ].join(' ')}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line shrink-0">
            <h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded text-muted hover:bg-line hover:text-text transition-colors shrink-0"
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="shrink-0 px-6 py-4 border-t border-line bg-surface-2 flex items-center gap-2 justify-end">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
