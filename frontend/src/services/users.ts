import type { User, AppUser, FirmUser } from '../types';
import type { OperationType, ApproverLevel, SpecialAction, MenuAction } from '../types';
import { ALL_CAPABILITY_KEYS } from '../permissions/registry';
import { delay } from './utils';

// ─── Default menuActions helper ───────────────────────────────────────────────

const MENU_ACTION_SETS: Record<string, MenuAction[]> = {
  'dosya-takip':             ['view', 'create', 'edit'],
  'beyanname':               ['view', 'create', 'edit', 'approve', 'send', 'download'],
  'tescil':                  ['view', 'edit', 'send', 'download'],
  'kapanis':                 ['view', 'edit', 'approve', 'download'],
  'musteri-gtip-sorgulama':  ['view', 'create', 'edit', 'send'],
  'gtip-malzeme':            ['view', 'create', 'edit', 'delete'],
  'arsiv/ithalat':           ['view', 'download'],
  'arsiv/ihracat':           ['view', 'download'],
  'arsiv/transit':           ['view', 'download'],
  'musteriler':              ['view', 'create', 'edit', 'delete'],
  'evraklar':                ['view', 'create', 'edit', 'delete'],
  'mailler':                 ['view', 'create', 'edit', 'delete', 'send'],
  'ayarlar':                 ['view', 'edit'],
};

function defaultMenuActions(menus: string[]): Record<string, MenuAction[]> {
  return Object.fromEntries(menus.map((m) => [m, MENU_ACTION_SETS[m] ?? ['view']]));
}

// ─── Legacy User list (used by other screens / auth) ─────────────────────────

const MOCK_USERS: User[] = [
  { id: 'user-001', name: 'Ahmet Yıldız',   email: 'ahmet@gumruk.com.tr',  role: 'admin',   active: true,  createdAt: '2023-09-01T00:00:00Z' },
  { id: 'user-002', name: 'Fatma Kaya',      email: 'fatma@gumruk.com.tr',  role: 'manager', active: true,  createdAt: '2023-10-15T00:00:00Z' },
  { id: 'user-003', name: 'Mehmet Çelik',    email: 'mehmet@gumruk.com.tr', role: 'yetkili', active: true,  createdAt: '2024-01-20T00:00:00Z' },
  { id: 'user-004', name: 'Ayşe Demir',      email: 'ayse@gumruk.com.tr',   role: 'yetkili', active: false, createdAt: '2024-02-10T00:00:00Z' },
];

// ─── Mock firm users for DevSwitcher — different capability profiles ──────────

export const MOCK_FIRM_USERS: FirmUser[] = [
  {
    id: 'firm-001',
    name: 'Ahmet Yıldız',
    role: 'Admin',
    capabilities: ALL_CAPABILITY_KEYS,
  },
  {
    id: 'firm-002',
    name: 'Fatma Kaya',
    role: 'Yönetici',
    capabilities: [
      'dosya_takip.view', 'dosya_takip.edit',
      'gtip_hazirlik.view', 'gtip_hazirlik.edit',
      'evrak_hazirlik.view', 'evrak_hazirlik.upload',
      'beyanname.view', 'beyanname.write', 'beyanname.approve',
      'tescil.view', 'tescil.notify',
      'kapanis.evraklar', 'kapanis.evrak_yukleme', 'kapanis.close',
      'gtip_malzeme.view',
      'musteriler.view',
      'evraklar.view',
      'ayarlar.document_processes',
    ],
  },
  {
    id: 'firm-003',
    name: 'Mehmet Çelik',
    role: 'Yetkili',
    capabilities: [
      'dosya_takip.view',
      'beyanname.view',
      'evrak_hazirlik.view',
      'tescil.view',
      'kapanis.evrak_yukleme',
    ],
  },
];

// ─── Ayarlar screen – app users with capabilities ─────────────────────────────

const APP_USERS: AppUser[] = [
  {
    id: 'au-001',
    name: 'Selin Arslan',
    email: 'selin@gumrukop.com',
    role: 'Admin',
    status: 'Aktif',
    capabilities: ALL_CAPABILITY_KEYS,
    operationTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'] as OperationType[],
    menuAccess: [
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'arsiv/ithalat', 'arsiv/ihracat', 'arsiv/transit',
      'musteriler', 'evraklar', 'mailler', 'ayarlar',
    ],
    menuActions: defaultMenuActions([
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'arsiv/ithalat', 'arsiv/ihracat', 'arsiv/transit',
      'musteriler', 'evraklar', 'mailler', 'ayarlar',
    ]),
    approverLevel: 'second' as ApproverLevel,
    specialActions: ['sendToSystem', 'viewCosts', 'downloadDocuments', 'sendMail'] as SpecialAction[],
  },
  {
    id: 'au-002',
    name: 'Ahmet Yılmaz',
    email: 'ahmet@gumrukop.com',
    role: 'Admin',
    status: 'Aktif',
    capabilities: [
      'dosya_takip.view', 'dosya_takip.edit',
      'gtip_hazirlik.view', 'gtip_hazirlik.edit',
      'evrak_hazirlik.view', 'evrak_hazirlik.upload',
      'beyanname.view', 'beyanname.write', 'beyanname.approve', 'beyanname.send',
      'tescil.view', 'tescil.notify',
      'kapanis.evraklar', 'kapanis.maliyet', 'kapanis.evrak_yukleme', 'kapanis.close',
      'gtip_malzeme.view', 'gtip_malzeme.edit',
      'musteriler.view', 'musteriler.edit',
      'evraklar.view', 'evraklar.manage',
      'mailler.view', 'mailler.manage',
      'arsiv.view',
    ],
    operationTypes: ['ithalat', 'ihracat', 'transit', 'antrepo'] as OperationType[],
    menuAccess: [
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'arsiv/ithalat', 'arsiv/ihracat', 'arsiv/transit',
      'musteriler', 'evraklar', 'mailler', 'ayarlar',
    ],
    menuActions: defaultMenuActions([
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'arsiv/ithalat', 'arsiv/ihracat', 'arsiv/transit',
      'musteriler', 'evraklar', 'mailler', 'ayarlar',
    ]),
    approverLevel: 'second' as ApproverLevel,
    specialActions: ['sendToSystem', 'viewCosts', 'downloadDocuments', 'sendMail'] as SpecialAction[],
  },
  {
    id: 'au-003',
    name: 'Kemal Şahin',
    email: 'kemal@gumrukop.com',
    role: 'Yönetici',
    status: 'Aktif',
    capabilities: [
      'dosya_takip.view', 'dosya_takip.edit',
      'gtip_hazirlik.view', 'gtip_hazirlik.edit',
      'evrak_hazirlik.view', 'evrak_hazirlik.upload',
      'beyanname.view', 'beyanname.write', 'beyanname.approve',
      'tescil.view', 'tescil.notify',
      'kapanis.evraklar', 'kapanis.evrak_yukleme', 'kapanis.close',
      'gtip_malzeme.view',
      'musteriler.view',
      'evraklar.view',
      'mailler.view', 'mailler.manage',
      'arsiv.view',
      'ayarlar.document_processes',
    ],
    operationTypes: ['ithalat', 'ihracat', 'transit'] as OperationType[],
    menuAccess: [
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'arsiv/ithalat', 'arsiv/ihracat', 'arsiv/transit',
      'musteriler', 'evraklar', 'mailler',
    ],
    menuActions: defaultMenuActions([
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'arsiv/ithalat', 'arsiv/ihracat', 'arsiv/transit',
      'musteriler', 'evraklar', 'mailler',
    ]),
    approverLevel: 'first' as ApproverLevel,
    specialActions: ['sendToSystem', 'downloadDocuments', 'sendMail'] as SpecialAction[],
  },
  {
    id: 'au-004',
    name: 'Mehmet Demir',
    email: 'mehmet@gumrukop.com',
    role: 'MT Yönetici',
    status: 'Aktif',
    capabilities: [
      'dosya_takip.view', 'dosya_takip.edit',
      'gtip_hazirlik.view', 'gtip_hazirlik.edit',
      'evrak_hazirlik.view', 'evrak_hazirlik.upload',
      'beyanname.view', 'beyanname.write',
      'tescil.view',
      'kapanis.evraklar', 'kapanis.evrak_yukleme',
      'gtip_malzeme.view',
      'musteriler.view',
      'evraklar.view',
    ],
    operationTypes: ['ithalat', 'ihracat'] as OperationType[],
    menuAccess: [
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'musteriler', 'evraklar',
    ],
    menuActions: defaultMenuActions([
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'musteri-gtip-sorgulama', 'gtip-malzeme',
      'musteriler', 'evraklar',
    ]),
    approverLevel: 'none' as ApproverLevel,
    specialActions: ['downloadDocuments'] as SpecialAction[],
  },
  {
    id: 'au-005',
    name: 'Ece Aydın',
    email: 'ece@gumrukop.com',
    role: 'MT',
    status: 'Aktif',
    capabilities: [
      'dosya_takip.view',
      'evrak_hazirlik.view',
      'beyanname.view',
      'tescil.view',
      'kapanis.evrak_yukleme',
    ],
    operationTypes: ['ihracat'] as OperationType[],
    menuAccess: ['dosya-takip', 'beyanname', 'tescil'],
    menuActions: defaultMenuActions(['dosya-takip', 'beyanname', 'tescil']),
    approverLevel: 'none' as ApproverLevel,
    specialActions: [] as SpecialAction[],
  },
  {
    id: 'au-006',
    name: 'Saha Kullanıcısı',
    email: 'saha@gumrukop.com',
    role: 'Saha',
    status: 'Pasif',
    capabilities: ['kapanis.evrak_yukleme'],
    operationTypes: [] as OperationType[],
    menuAccess: ['kapanis'],
    menuActions: defaultMenuActions(['kapanis']),
    approverLevel: 'none' as ApproverLevel,
    specialActions: [] as SpecialAction[],
  },
  {
    id: 'au-007',
    name: 'Burak Yıldız',
    email: 'burak@gumrukop.com',
    role: 'MT',
    status: 'Aktif',
    capabilities: [
      'dosya_takip.view',
      'evrak_hazirlik.view',
      'beyanname.view',
      'tescil.view',
      'kapanis.evrak_yukleme',
    ],
    operationTypes: ['ithalat', 'transit'] as OperationType[],
    menuAccess: ['dosya-takip', 'beyanname', 'tescil'],
    menuActions: defaultMenuActions(['dosya-takip', 'beyanname', 'tescil']),
    approverLevel: 'none' as ApproverLevel,
    specialActions: [] as SpecialAction[],
  },
  {
    id: 'au-008',
    name: 'Deniz Korkmaz',
    email: 'deniz@gumrukop.com',
    role: 'MT Yönetici',
    status: 'Aktif',
    capabilities: [
      'dosya_takip.view', 'dosya_takip.edit',
      'gtip_hazirlik.view', 'gtip_hazirlik.edit',
      'evrak_hazirlik.view', 'evrak_hazirlik.upload',
      'beyanname.view', 'beyanname.write',
      'tescil.view',
      'kapanis.evraklar', 'kapanis.evrak_yukleme',
      'gtip_malzeme.view',
      'musteriler.view',
      'evraklar.view',
    ],
    operationTypes: ['ithalat', 'ihracat', 'transit'] as OperationType[],
    menuAccess: [
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'gtip-malzeme', 'musteriler', 'evraklar',
    ],
    menuActions: defaultMenuActions([
      'dosya-takip', 'beyanname', 'tescil', 'kapanis',
      'gtip-malzeme', 'musteriler', 'evraklar',
    ]),
    approverLevel: 'first' as ApproverLevel,
    specialActions: ['downloadDocuments', 'sendMail'] as SpecialAction[],
  },
];

export const usersService = {
  list: async (): Promise<User[]> => {
    await delay(100);
    return [...MOCK_USERS];
  },
  get: async (id: string): Promise<User | null> => {
    await delay(60);
    return MOCK_USERS.find((u) => u.id === id) ?? null;
  },
  getAppUsers: async (): Promise<AppUser[]> => {
    await delay(80);
    return APP_USERS.map((u) => ({ ...u }));
  },
  getMtUsers: async (): Promise<AppUser[]> => {
    await delay(50);
    return APP_USERS.filter((u) => u.role === 'MT' && u.status === 'Aktif').map((u) => ({ ...u }));
  },
  getMtManagerUsers: async (): Promise<AppUser[]> => {
    await delay(50);
    return APP_USERS.filter((u) => u.role === 'MT Yönetici' && u.status === 'Aktif').map((u) => ({ ...u }));
  },
  updateUserCapabilities: async (id: string, capabilities: string[]): Promise<void> => {
    await delay(60);
    const idx = APP_USERS.findIndex((u) => u.id === id);
    if (idx !== -1) APP_USERS[idx] = { ...APP_USERS[idx], capabilities };
  },
  updateUserPermissions: async (id: string, patch: Partial<AppUser>): Promise<void> => {
    await delay(60);
    const idx = APP_USERS.findIndex((u) => u.id === id);
    if (idx !== -1) APP_USERS[idx] = { ...APP_USERS[idx], ...patch };
  },
};
