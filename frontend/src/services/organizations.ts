import type { Organization } from '../types';
import { delay } from './utils';

const MOCK: Organization[] = [
  {
    id: 'org-001',
    name: 'Anadolu Gümrük Müşavirliği',
    taxId: '1112223334',
    plan: 'professional',
    status: 'active',
    adminEmail: 'admin@anadolugumruk.com.tr',
    userCount: 12,
    createdAt: '2023-06-01T00:00:00Z',
  },
  {
    id: 'org-002',
    name: 'Bosphorus Customs Services',
    taxId: '5556667778',
    plan: 'enterprise',
    status: 'active',
    adminEmail: 'admin@bosphoruscustoms.com',
    userCount: 38,
    createdAt: '2022-11-15T00:00:00Z',
  },
  {
    id: 'org-003',
    name: 'Marmara Gümrük A.Ş.',
    taxId: '9990001112',
    plan: 'starter',
    status: 'trial',
    adminEmail: 'ops@marmaragumruk.com.tr',
    userCount: 3,
    createdAt: '2024-05-01T00:00:00Z',
  },
  {
    id: 'org-004',
    name: 'Ege Gümrük Danışmanlık',
    taxId: '4445556667',
    plan: 'professional',
    status: 'suspended',
    adminEmail: 'info@ege-gumruk.com.tr',
    userCount: 7,
    createdAt: '2023-03-20T00:00:00Z',
  },
];

export const organizationsService = {
  list: async (): Promise<Organization[]> => {
    await delay(120);
    return [...MOCK];
  },
  get: async (id: string): Promise<Organization | null> => {
    await delay(80);
    return MOCK.find((o) => o.id === id) ?? null;
  },
};
