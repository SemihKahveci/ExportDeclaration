import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from 'react';
import { forwardRef } from 'react';

const INPUT_BASE =
  'w-full px-3 py-2 text-[13px] bg-surface border border-line rounded text-text placeholder:text-muted-2 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:opacity-50 disabled:bg-surface-2';

// ─── Field wrapper ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-medium text-text-strong"
      >
        {label}
        {required && <span className="text-hat-red ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted">{hint}</p>}
      {error && <p className="text-[11px]" style={{ color: 'var(--hat-red)' }}>{error}</p>}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function Input({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return <input className={`${INPUT_BASE} ${className}`} {...rest} />;
}

// ─── Select ───────────────────────────────────────────────────────────────────

export function Select({
  children,
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <select className={`${INPUT_BASE} ${className}`} {...rest}>
      {children}
    </select>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }
>(function Textarea({ className = '', rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`${INPUT_BASE} resize-y min-h-[80px] ${className}`}
      {...rest}
    />
  );
});
