import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useCan } from '../../permissions/useCan';

type ButtonVariant = 'default' | 'primary' | 'blue' | 'warn' | 'danger';
type ButtonSize = 'default' | 'sm' | 'mini';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  children?: ReactNode;
  /** Bu capability yoksa buton pasif olur (sadece görüntüleme yetkisi). */
  writeCap?: string;
  /** Bu capability'lerden hiçbiri yoksa buton pasif olur. */
  writeCaps?: string[];
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
  writeCap,
  writeCaps,
  className = '',
  title,
  ...rest
}: ButtonProps) {
  const { can, canAny } = useCan();
  const writeBlocked = writeCap
    ? !can(writeCap)
    : writeCaps
      ? !canAny(writeCaps)
      : false;
  const isDisabled = Boolean(disabled || writeBlocked);
  const isDefault = variant === 'default';
  const isPrimary = variant === 'primary';

  return (
    <button
      disabled={isDisabled}
      title={writeBlocked ? (title || 'Bu işlem için yetkiniz yok (yalnızca görüntüleme)') : title}
      className={[
        'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 select-none',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        isDisabled ? 'opacity-40 pointer-events-none' : '',
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
