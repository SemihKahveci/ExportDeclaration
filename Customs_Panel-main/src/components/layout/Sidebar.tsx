import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Anchor, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { visibleGroups } from './navConfig';
import type { NavItem } from './navConfig';

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function hasActiveChild(item: NavItem, pathname: string): boolean {
  if (!item.children) return false;
  return item.children.some(
    (c) => pathname === c.path || pathname.startsWith(c.path + '/')
  );
}

// ─── Leaf nav link ────────────────────────────────────────────────────────────

function NavLeaf({ item, indent = false }: { item: NavItem; indent?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        [
          'flex items-center gap-2.5 py-2 rounded text-[13px] transition-colors relative group',
          indent ? 'pl-8 pr-2' : 'px-2',
          isActive
            ? 'bg-ink-soft text-surface font-medium'
            : 'text-muted-2 hover:bg-ink-soft hover:text-surface',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r"
              style={{ background: 'var(--accent)' }}
            />
          )}
          <Icon size={indent ? 14 : 16} strokeWidth={1.75} />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && (
            <span
              className={[
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                item.badgeVariant === 'warn'
                  ? 'bg-warn-tint text-warn'
                  : 'bg-accent-tint text-accent',
              ].join(' ')}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

// ─── Expandable parent ────────────────────────────────────────────────────────

function NavParent({ item }: { item: NavItem }) {
  const location = useLocation();
  const childActive = hasActiveChild(item, location.pathname);
  const [open, setOpen] = useState(() => childActive);

  // When route changes and a child becomes active, ensure parent is open
  if (childActive && !open) setOpen(true);

  const Icon = item.icon;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full flex items-center gap-2.5 px-2 py-2 rounded text-[13px] transition-colors',
          childActive
            ? 'text-surface'
            : 'text-muted-2 hover:bg-ink-soft hover:text-surface',
        ].join(' ')}
      >
        <Icon size={16} strokeWidth={1.75} />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <Chevron size={13} strokeWidth={2} className="shrink-0 text-muted" />
      </button>

      {open && item.children && (
        <ul className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <li key={child.path}>
              <NavLeaf item={child} indent />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { currentUser, deploymentMode, role } = useAppContext();
  const isSuperAdmin = role === 'super_admin';
  const groups = visibleGroups(currentUser.capabilities, deploymentMode, isSuperAdmin);

  return (
    <aside className="flex flex-col h-screen bg-ink sticky top-0 overflow-y-auto scrollbar-thin w-[248px] shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-ink-line">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-d) 100%)' }}
        >
          <Anchor size={18} color="white" strokeWidth={2} />
        </div>
        <div className="leading-tight">
          <p className="text-surface text-[13px] font-semibold tracking-wide">GÜMRÜK</p>
          <p className="text-muted text-[11px] tracking-widest uppercase">Operasyon</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-5 px-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted px-2 mb-1.5">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) =>
                item.children ? (
                  <NavParent key={item.path} item={item} />
                ) : (
                  <li key={item.path}>
                    <NavLeaf item={item} />
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-ink-line">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-surface shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-d) 100%)',
              boxShadow: '0 0 0 2px var(--accent-d)',
            }}
          >
            {initials(currentUser.name)}
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-surface text-[12px] font-medium truncate">{currentUser.name}</p>
            <p className="text-muted text-[11px] truncate">{currentUser.role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
