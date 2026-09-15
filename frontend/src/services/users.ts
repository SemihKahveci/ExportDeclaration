import type { User, AppUser, FirmUser } from '../types';
import type { OperationType, ApproverLevel, SpecialAction, MenuAction } from '../types';
import { createAppUser, deleteAppUser, listAppUsers, listAssignableUsers, updateAppUser } from '../api/userApi';
import type { AssignableUser, CreateAppUserPayload, UpdateAppUserPayload } from '../api/userApi';

export function appUserToFirmUser(user: AppUser): FirmUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    capabilities: user.capabilities,
  };
}

const EMPTY_NEW_USER = (): Omit<AppUser, 'id' | 'systemRole'> => ({
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

  getAssignableUsers: async (): Promise<AssignableUser[]> => {
    return listAssignableUsers();
  },

  getMtUsers: async (): Promise<AssignableUser[]> => {
    const users = await listAssignableUsers();
    return users.filter((u) => u.role === 'MT');
  },

  getMtManagerUsers: async (): Promise<AssignableUser[]> => {
    const users = await listAssignableUsers();
    return users.filter((u) => u.role === 'MT Yönetici');
  },

  getOperationUsers: async (): Promise<AssignableUser[]> => {
    const users = await listAssignableUsers();
    return users.filter((u) => u.role === 'Operasyon');
  },

  createAppUser: async (data: CreateAppUserPayload): Promise<AppUser> => {
    return createAppUser({ ...EMPTY_NEW_USER(), ...data });
  },

  updateUserCapabilities: async (id: string, capabilities: string[]): Promise<AppUser> => {
    return updateAppUser(id, { capabilities });
  },

  updateUserPermissions: async (id: string, patch: UpdateAppUserPayload): Promise<AppUser> => {
    return updateAppUser(id, patch);
  },

  deleteAppUser: async (id: string): Promise<void> => {
    await deleteAppUser(id);
  },

  emptyNewUser: EMPTY_NEW_USER,
};
