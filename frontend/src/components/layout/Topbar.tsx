import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, LogOut } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { usePanelNotifications } from '../../notifications/PanelNotifications';
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
  const { role, logout } = useAppContext();
  const { notices, unread, markRead } = usePanelNotifications();
  const [open, setOpen] = useState(false);
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

        <button onClick={() => void logout()} title="Çıkış yap" className="w-8 h-8 flex items-center justify-center rounded hover:bg-line transition-colors">
          <LogOut size={16} className="text-muted" />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            title="Bildirimler"
            onClick={() => {
              setOpen((value) => !value);
              markRead();
            }}
            className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-line transition-colors"
          >
            <Bell size={16} className="text-muted" />
            {unread > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                style={{ background: 'var(--hat-red)' }}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-10 z-30 w-80 max-w-[80vw] rounded-lg border border-line bg-surface shadow-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-line text-[12px] font-bold text-text-strong">
                Bildirimler
              </div>
              {notices.length === 0 ? (
                <p className="px-3 py-4 text-[12.5px] text-muted">Parse tamamlanınca burada görünür.</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {notices.map((notice) => (
                    <li key={notice.id} className="px-3 py-2.5 border-b border-line last:border-b-0">
                      <p className="text-[12.5px] font-semibold text-text-strong">{notice.title}</p>
                      <p className="text-[12px] text-muted mt-0.5">{notice.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
