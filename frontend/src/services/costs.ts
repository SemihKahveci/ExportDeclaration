import type { Cost } from '../types';
import { delay } from './utils';

const MOCK: Cost[] = [
  {
    id: 'cost-001',
    label: 'Navlun',
    amount: 1250.0,
    currency: 'USD',
    declarationRef: 'IHR-2024-001',
  },
  {
    id: 'cost-002',
    label: 'Sigorta',
    amount: 180.5,
    currency: 'USD',
    declarationRef: 'IHR-2024-001',
  },
  {
    id: 'cost-003',
    label: 'Gümrük Vergisi',
    amount: 8750.0,
    currency: 'TRY',
    declarationRef: 'IHR-2024-001',
  },
  {
    id: 'cost-004',
    label: 'KDV',
    amount: 12600.0,
    currency: 'TRY',
    declarationRef: 'IHR-2024-001',
  },
  {
    id: 'cost-005',
    label: 'Gümrük Müşavirlik Ücreti',
    amount: 2200.0,
    currency: 'TRY',
    declarationRef: 'IHR-2024-001',
  },
];

export const costsService = {
  list: async (declarationRef?: string): Promise<Cost[]> => {
    await delay(80);
    if (declarationRef) {
      return MOCK.filter((c) => c.declarationRef === declarationRef);
    }
    return [...MOCK];
  },
};
