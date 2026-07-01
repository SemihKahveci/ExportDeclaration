import type { MenuAction, ScreenPermission, SpecialAction } from '../types';
import { PERMISSIONS } from './registry';

/** UsersTab ekran anahtarı → permissions/registry screen id */
export const UI_SCREEN_TO_REGISTRY: Record<string, string> = {
  'dosya-takip': 'dosya_takip',
  'beyanname': 'beyanname',
  'beyanname-onay': 'beyanname_onay',
  'beyanname-tescil': 'tescil',
  'kapanis-evraklar': 'kapanis_evraklar',
  'kapanis-evrak-yukleme': 'kapanis_operasyon_evrak_yukleme',
  'kapanis-onay': 'kapanis_onay',
  'musteri-gtip-sorgulama': 'musteri_gtip_sorgulama',
  'gtip-malzeme': 'gtip_malzeme',
  'gtip-onay': 'gtip_onay',
  'arsiv/ithalat': 'arsiv_ithalat',
  'arsiv/ihracat': 'arsiv_ihracat',
  'arsiv/transit': 'arsiv_transit',
  'musteriler': 'musteriler',
  'evraklar': 'evraklar',
  'mailler': 'mailler',
  'ayarlar': 'ayarlar',
};

const MENU_ACTION_SETS: Record<string, MenuAction[]> = {
  'dosya-takip': ['view', 'create', 'edit'],
  'beyanname': ['view', 'create', 'edit', 'approve', 'send', 'download'],
  'beyanname-onay': ['view', 'approve'],
  'beyanname-tescil': ['view', 'edit', 'send', 'download'],
  'kapanis-evraklar': ['view', 'edit', 'download'],
  'kapanis-evrak-yukleme': ['view', 'edit'],
  'kapanis-onay': ['view', 'approve'],
  'musteri-gtip-sorgulama': ['view', 'create', 'edit', 'send'],
  'gtip-malzeme': ['view', 'create', 'edit', 'delete'],
  'gtip-onay': ['view', 'approve'],
  'arsiv/ithalat': ['view', 'download'],
  'arsiv/ihracat': ['view', 'download'],
  'arsiv/transit': ['view', 'download'],
  'musteriler': ['view', 'create', 'edit', 'delete'],
  'evraklar': ['view', 'create', 'edit', 'delete'],
  'mailler': ['view', 'create', 'edit', 'delete', 'send'],
  'ayarlar': ['view', 'edit'],
};

function registryScreen(uiKey: string) {
  const screenId = UI_SCREEN_TO_REGISTRY[uiKey];
  if (!screenId) return undefined;
  return PERMISSIONS.find((p) => p.screen === screenId);
}

/** Sidebar / ProtectedRoute için capability anahtarları */
export function deriveCapabilities(
  screenPermissions: Record<string, ScreenPermission>
): string[] {
  const caps = new Set<string>();

  for (const [uiKey, perm] of Object.entries(screenPermissions)) {
    if (!perm.view) continue;
    const screen = registryScreen(uiKey);
    if (!screen) continue;

    if (perm.operate) {
      screen.capabilities.forEach((c) => caps.add(c.key));
      continue;
    }

    const viewCaps = screen.capabilities.filter((c) => c.key.endsWith('.view'));
    if (viewCaps.length > 0) {
      viewCaps.forEach((c) => caps.add(c.key));
    } else {
      caps.add(screen.capabilities[0].key);
    }
  }

  return [...caps];
}

/** Eski model: erişilebilir menü route anahtarları */
export function deriveMenuAccess(
  screenPermissions: Record<string, ScreenPermission>
): string[] {
  return Object.entries(screenPermissions)
    .filter(([, perm]) => perm.view)
    .map(([key]) => key);
}

/** Eski model: menü başına izin verilen aksiyonlar */
export function deriveMenuActions(
  screenPermissions: Record<string, ScreenPermission>
): Record<string, MenuAction[]> {
  const result: Record<string, MenuAction[]> = {};

  for (const [uiKey, perm] of Object.entries(screenPermissions)) {
    if (!perm.view) continue;
    const full = MENU_ACTION_SETS[uiKey] ?? ['view'];
    result[uiKey] = perm.operate ? full : (['view'] as MenuAction[]);
  }

  return result;
}

/** Ek sistem aksiyonları (ayrı UI yok; capability'lerden türetilir) */
export function deriveSpecialActions(capabilities: string[]): SpecialAction[] {
  const caps = new Set(capabilities);
  const actions: SpecialAction[] = [];

  if (caps.has('beyanname.send')) actions.push('sendToSystem');
  if (caps.has('kapanis.maliyet')) actions.push('viewCosts');
  if (
    caps.has('arsiv.view') ||
    caps.has('kapanis.evraklar') ||
    caps.has('beyanname.view')
  ) {
    actions.push('downloadDocuments');
  }
  if (caps.has('mailler.manage') || caps.has('tescil.notify')) {
    actions.push('sendMail');
  }

  return actions;
}

export function deriveAuthFromScreenPermissions(
  screenPermissions: Record<string, ScreenPermission>
) {
  const capabilities = deriveCapabilities(screenPermissions);
  const menuAccess = deriveMenuAccess(screenPermissions);
  const menuActions = deriveMenuActions(screenPermissions);
  const specialActions = deriveSpecialActions(capabilities);

  return { capabilities, menuAccess, menuActions, specialActions };
}
