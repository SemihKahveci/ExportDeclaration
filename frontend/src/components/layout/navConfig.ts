import {
  FolderOpen,
  ClipboardList,
  CheckCheck,
  Stamp,
  CheckSquare,
  ListChecks,
  Upload,
  BadgeCheck,
  Database,
  Search,
  ShieldCheck,
  Users,
  Archive,
  Settings,
  Building2,
  Mail,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DeploymentMode } from '../../types';
import { PERMISSIONS } from '../../permissions/registry';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  badgeVariant?: 'accent' | 'warn';
  children?: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  requiredMode?: DeploymentMode;
  superAdminOnly?: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  '/dosya-takip':                    FolderOpen,
  '/beyanname':                      ClipboardList,
  '/beyanname/onay':                 CheckCheck,
  '/tescil':                         Stamp,
  '/kapanis':                        CheckSquare,
  '/kapanis/evraklar':               ListChecks,
  '/kapanis/operasyon-evrak-yukleme': Upload,
  '/kapanis/onay':                   BadgeCheck,
  '/musteri-gtip-sorgulama':         Search,
  '/gtip-malzeme':                   Database,
  '/gtip/onay':                      ShieldCheck,
  '/arsiv/ithalat':                  ArrowDownToLine,
  '/arsiv/ihracat':                  ArrowUpFromLine,
  '/arsiv/transit':                  ArrowLeftRight,
  '/musteriler':                     Users,
  '/evraklar':                       Archive,
  '/mailler':                        Mail,
  '/ayarlar':                        Settings,
};

function permItem(route: string): NavItem {
  const perm = PERMISSIONS.find((s) => s.route === route);
  return {
    label: perm?.navLabel ?? route,
    path: route,
    icon: ICON_MAP[route] ?? FolderOpen,
  };
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operasyon',
    items: [
      permItem('/dosya-takip'),
      permItem('/beyanname'),
      permItem('/beyanname/onay'),
      permItem('/tescil'),
      {
        label: 'Kapanış & Mutabakat',
        path: '/kapanis',
        icon: CheckSquare,
        children: [
          permItem('/kapanis/evraklar'),
          permItem('/kapanis/operasyon-evrak-yukleme'),
          permItem('/kapanis/onay'),
        ],
      },
    ],
  },
  {
    label: 'GTİP / Malzeme',
    items: [
      permItem('/musteri-gtip-sorgulama'),
      permItem('/gtip-malzeme'),
      permItem('/gtip/onay'),
    ],
  },
  {
    label: 'Arşiv',
    items: [
      permItem('/arsiv/ithalat'),
      permItem('/arsiv/ihracat'),
      permItem('/arsiv/transit'),
    ],
  },
  {
    label: 'Sistem',
    items: [
      permItem('/musteriler'),
      permItem('/evraklar'),
      permItem('/mailler'),
      permItem('/ayarlar'),
    ],
  },
  {
    label: 'Yönetim',
    superAdminOnly: true,
    requiredMode: 'cloud',
    items: [
      { label: 'Organizasyonlar', path: '/admin/organizations', icon: Building2 },
    ],
  },
];

function filterItems(items: NavItem[], capSet: Set<string>): NavItem[] {
  return items
    .map((item): NavItem | null => {
      if (item.children) {
        const visibleChildren = filterItems(item.children, capSet);
        if (visibleChildren.length === 0) return null;
        return { ...item, children: visibleChildren };
      }
      const screen = PERMISSIONS.find((s) => s.route === item.path);
      if (!screen) return item;
      return screen.capabilities.some((c) => capSet.has(c.key)) ? item : null;
    })
    .filter((item): item is NavItem => item !== null);
}

export function visibleGroups(
  capabilities: string[],
  deploymentMode: DeploymentMode,
  isSuperAdmin: boolean,
): NavGroup[] {
  const capSet = new Set(capabilities);

  return NAV_GROUPS.map((group) => {
    if (group.superAdminOnly && !isSuperAdmin) return null;
    if (group.requiredMode && group.requiredMode !== deploymentMode) return null;

    const items = group.superAdminOnly
      ? group.items
      : filterItems(group.items, capSet);

    if (items.length === 0) return null;
    return { ...group, items };
  }).filter((g): g is NavGroup => g !== null);
}

// Flatten all items (including children) — used by PlaceholderPage for label resolution
function flattenItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) =>
    item.children ? [item, ...flattenItems(item.children)] : [item]
  );
}

export function allNavItems(): NavItem[] {
  return flattenItems(NAV_GROUPS.flatMap((g) => g.items));
}
