import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { allNavItems } from '../components/layout/navConfig';

function getScreenLabel(pathname: string): string {
  const items = allNavItems();
  // Prefer exact match, fall back to prefix match
  const exact = items.find((item) => pathname === item.path);
  if (exact) return exact.label;
  const prefix = items.find((item) => pathname.startsWith(item.path + '/'));
  if (prefix) return prefix.label;
  if (pathname.startsWith('/admin/organizations/new')) return 'Yeni Organizasyon';
  if (pathname.match(/\/admin\/organizations\/.+/)) return 'Organizasyon Detayı';
  if (pathname === '/admin/organizations') return 'Organizasyonlar';
  return pathname;
}

export default function PlaceholderPage() {
  const location = useLocation();
  const label = getScreenLabel(location.pathname);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-sm">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto"
          style={{ background: 'var(--accent-tint)' }}
        >
          <Construction size={26} style={{ color: 'var(--accent)' }} strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <h2 className="text-[18px] font-semibold text-text-strong">{label}</h2>
          <p className="text-muted text-[13px]">
            Bu ekran Stage 3'te uygulanacak.
          </p>
        </div>
        <div
          className="inline-block font-mono text-[11px] px-3 py-1.5 rounded"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--line)' }}
        >
          {location.pathname}
        </div>
      </div>
    </div>
  );
}
