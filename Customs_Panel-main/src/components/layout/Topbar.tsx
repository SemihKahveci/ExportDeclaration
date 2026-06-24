import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { NAV_GROUPS } from './navConfig';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Süper Admin',
  admin: 'Admin',
  manager: 'Manager',
  yetkili: 'Yetkili',
};

interface Breadcrumb {
  group: string;
  screen: string;
}

function getBreadcrumb(pathname: string): Breadcrumb {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.path || pathname.startsWith(item.path + '/')) {
        return { group: group.label, screen: item.label };
      }
    }
  }
  return { group: '', screen: 'Ana Sayfa' };
}

export default function Topbar() {
  const location = useLocation();
  const { role } = useAppContext();
  const breadcrumb = getBreadcrumb(location.pathname);

  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-4 px-6 h-14 border-b border-line"
      style={{ background: 'rgba(243, 240, 233, 0.88)', backdropFilter: 'blur(10px)' }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] min-w-0 flex-1">
        {breadcrumb.group && (
          <>
            <span className="text-muted">{breadcrumb.group}</span>
            <span className="text-line-strong">/</span>
          </>
        )}
        <span className="font-semibold text-text-strong truncate">{breadcrumb.screen}</span>
      </div>

      {/* Search */}
      <div className="relative w-56">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Ara…"
          className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-surface border border-line rounded focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent-tint transition-colors placeholder:text-muted-2"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Role pill */}
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-accent-tint text-accent border border-accent/20">
          {ROLE_LABELS[role]}
        </span>

        {/* Notifications */}
        <button className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-line transition-colors">
          <Bell size={16} className="text-muted" />
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--hat-red)' }}
          />
        </button>
      </div>
    </header>
  );
}
