import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className = '',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted bg-surface-2 border-b border-line whitespace-nowrap ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { className?: string }) {
  return (
    <td
      className={`px-4 py-3 text-text border-b border-line align-middle ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={`transition-colors ${onClick ? 'cursor-pointer hover:bg-surface-2' : 'hover:bg-surface-2/60'} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}
