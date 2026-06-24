import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type ButtonVariant = 'default' | 'primary' | 'blue' | 'warn' | 'danger';
type ButtonSize = 'default' | 'sm' | 'mini';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  children?: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  default: 'bg-surface border border-line text-text hover:bg-surface-2 hover:border-line-strong active:bg-line',
  primary: 'bg-accent text-white hover:bg-accent-d active:opacity-90 border border-transparent shadow-sm',
  blue:    'border text-white active:opacity-90 shadow-sm',
  warn:    'border text-white active:opacity-90 shadow-sm',
  danger:  'border text-white active:opacity-90 shadow-sm',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  default: 'h-9 px-4 text-[13px] gap-2',
  sm:      'h-7 px-3 text-[12px] gap-1.5',
  mini:    'h-6 px-2 text-[11px] gap-1',
};

const ICON_SIZES: Record<ButtonSize, number> = {
  default: 15,
  sm:      14,
  mini:    12,
};

export default function Button({
  variant = 'default',
  size = 'default',
  icon: Icon,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const isDefault = variant === 'default';
  const isPrimary = variant === 'primary';

  return (
    <button
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 select-none',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        disabled ? 'opacity-40 pointer-events-none' : '',
        className,
      ].join(' ')}
      style={
        !isDefault && !isPrimary
          ? {
              backgroundColor:
                variant === 'blue'   ? 'var(--hat-blue)'   :
                variant === 'warn'   ? 'var(--warn)'        :
                'var(--hat-red)',
              borderColor:
                variant === 'blue'   ? 'var(--hat-blue)'   :
                variant === 'warn'   ? 'var(--warn)'        :
                'var(--hat-red)',
            }
          : undefined
      }
      {...rest}
    >
      {Icon && <Icon size={ICON_SIZES[size]} strokeWidth={1.75} />}
      {children}
    </button>
  );
}
