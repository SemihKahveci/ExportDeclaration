import type { User, AppUser, FirmUser } from '../types';
import type { OperationType, ApproverLevel, SpecialAction, MenuAction } from '../types';
import { createAppUser, listAppUsers, updateAppUser } from '../api/userApi';

export function appUserToFirmUser(user: AppUser): FirmUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    capabilities: user.capabilities,
  };
}

const EMPTY_NEW_USER = (): Omit<AppUser, 'id'> => ({
  name: '',
  email: '',
  role: 'Operasyon',
  status: 'Aktif',
  capabilities: [],
  operationTypes: [] as OperationType[],
  menuAccess: [],
  menuActions: {} as Record<string, MenuAction[]>,
  approverLevel: 'none' as ApproverLevel,
  specialActions: [] as SpecialAction[],
  screenPermissions: {},
});

export const usersService = {
  list: async (): Promise<User[]> => {
    const appUsers = await listAppUsers();
    return appUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === 'Admin' ? 'admin' : u.role === 'Yönetici' ? 'manager' : 'yetkili',
      active: u.status === 'Aktif',
      createdAt: new Date().toISOString(),
    }));
  },

  get: async (id: string): Promise<User | null> => {
    const appUsers = await listAppUsers();
    const u = appUsers.find((row) => row.id === id);
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === 'Admin' ? 'admin' : u.role === 'Yönetici' ? 'manager' : 'yetkili',
      active: u.status === 'Aktif',
      createdAt: new Date().toISOString(),
    };
  },

  getAppUsers: async (): Promise<AppUser[]> => {
    return listAppUsers();
  },

  getFirmUsers: async (): Promise<FirmUser[]> => {
    const appUsers = await listAppUsers();
    return appUsers
      .filter((u) => u.status === 'Aktif')
      .map(appUserToFirmUser);
  },

  getMtUsers: async (): Promise<AppUser[]> => {
    const appUsers = await listAppUsers();
    return appUsers.filter((u) => u.role === 'MT' && u.status === 'Aktif');
  },

  getMtManagerUsers: async (): Promise<AppUser[]> => {
    const appUsers = await listAppUsers();
    return appUsers.filter((u) => u.role === 'MT Yönetici' && u.status === 'Aktif');
  },

  createAppUser: async (data: Omit<AppUser, 'id'>): Promise<AppUser> => {
    return createAppUser({ ...EMPTY_NEW_USER(), ...data });
  },

  updateUserCapabilities: async (id: string, capabilities: string[]): Promise<AppUser> => {
    return updateAppUser(id, { capabilities });
  },

  updateUserPermissions: async (id: string, patch: Partial<AppUser>): Promise<AppUser> => {
    return updateAppUser(id, patch);
  },

  emptyNewUser: EMPTY_NEW_USER,
};
