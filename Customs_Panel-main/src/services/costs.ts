import type { Cost } from '../types';
import { delay } from './utils';

const MOCK: Cost[] = [
  // Legacy record
  { id: 'cost-001', label: 'Navlun',                    amount: 1250.00,  currency: 'USD', declarationRef: 'IHR-2024-001' },
  { id: 'cost-002', label: 'Sigorta',                   amount: 180.50,   currency: 'USD', declarationRef: 'IHR-2024-001' },
  { id: 'cost-003', label: 'Gümrük Vergisi',            amount: 8750.00,  currency: 'TRY', declarationRef: 'IHR-2024-001' },
  { id: 'cost-004', label: 'KDV',                       amount: 12600.00, currency: 'TRY', declarationRef: 'IHR-2024-001' },
  { id: 'cost-005', label: 'Gümrük Müşavirlik Ücreti',  amount: 2200.00,  currency: 'TRY', declarationRef: 'IHR-2024-001' },

  // IHR-2026-0395 – Brisa (ihracat)
  { id: 'cost-101', label: 'Navlun',                    amount: 890.00,   currency: 'USD', declarationRef: 'IHR-2026-0395' },
  { id: 'cost-102', label: 'Sigorta',                   amount: 120.00,   currency: 'USD', declarationRef: 'IHR-2026-0395' },
  { id: 'cost-103', label: 'Gümrük Müşavirlik Ücreti',  amount: 1800.00,  currency: 'TRY', declarationRef: 'IHR-2026-0395' },
  { id: 'cost-104', label: 'Liman Masrafı',             amount: 3200.00,  currency: 'TRY', declarationRef: 'IHR-2026-0395' },

  // IHR-2026-0389 – Valeo (ihracat)
  { id: 'cost-111', label: 'Navlun',                    amount: 540.00,   currency: 'EUR', declarationRef: 'IHR-2026-0389' },
  { id: 'cost-112', label: 'Gümrük Müşavirlik Ücreti',  amount: 2100.00,  currency: 'TRY', declarationRef: 'IHR-2026-0389' },
  { id: 'cost-113', label: 'Demuraj',                   amount: 650.00,   currency: 'EUR', declarationRef: 'IHR-2026-0389' },

  // ITH-2026-0281 – Anadolu Tekstil (ithalat)
  { id: 'cost-121', label: 'Navlun',                    amount: 1420.00,  currency: 'USD', declarationRef: 'ITH-2026-0281' },
  { id: 'cost-122', label: 'Sigorta',                   amount: 210.00,   currency: 'USD', declarationRef: 'ITH-2026-0281' },
  { id: 'cost-123', label: 'Gümrük Vergisi',            amount: 18400.00, currency: 'TRY', declarationRef: 'ITH-2026-0281' },
  { id: 'cost-124', label: 'KDV',                       amount: 26100.00, currency: 'TRY', declarationRef: 'ITH-2026-0281' },
  { id: 'cost-125', label: 'Gümrük Müşavirlik Ücreti',  amount: 2500.00,  currency: 'TRY', declarationRef: 'ITH-2026-0281' },

  // ITH-2026-0271 – Marmara Makine (ithalat)
  { id: 'cost-131', label: 'Navlun',                    amount: 2100.00,  currency: 'USD', declarationRef: 'ITH-2026-0271' },
  { id: 'cost-132', label: 'Gümrük Vergisi',            amount: 34500.00, currency: 'TRY', declarationRef: 'ITH-2026-0271' },
  { id: 'cost-133', label: 'KDV',                       amount: 48200.00, currency: 'TRY', declarationRef: 'ITH-2026-0271' },
  { id: 'cost-134', label: 'Antrepo Masrafı',           amount: 1950.00,  currency: 'TRY', declarationRef: 'ITH-2026-0271' },
  { id: 'cost-135', label: 'Gümrük Müşavirlik Ücreti',  amount: 3200.00,  currency: 'TRY', declarationRef: 'ITH-2026-0271' },

  // ITH-2026-0268 – Ege Kimya (ithalat)
  { id: 'cost-141', label: 'Navlun',                    amount: 1780.00,  currency: 'USD', declarationRef: 'ITH-2026-0268' },
  { id: 'cost-142', label: 'Sigorta',                   amount: 240.00,   currency: 'USD', declarationRef: 'ITH-2026-0268' },
  { id: 'cost-143', label: 'Gümrük Vergisi',            amount: 22100.00, currency: 'TRY', declarationRef: 'ITH-2026-0268' },
  { id: 'cost-144', label: 'KDV',                       amount: 31400.00, currency: 'TRY', declarationRef: 'ITH-2026-0268' },
  { id: 'cost-145', label: 'Gümrük Müşavirlik Ücreti',  amount: 2800.00,  currency: 'TRY', declarationRef: 'ITH-2026-0268' },

  // TRN-2026-0155 – Ford Otosan (transit)
  { id: 'cost-151', label: 'Transit Güvencesi',         amount: 4500.00,  currency: 'TRY', declarationRef: 'TRN-2026-0155' },
  { id: 'cost-152', label: 'Gümrük Müşavirlik Ücreti',  amount: 1600.00,  currency: 'TRY', declarationRef: 'TRN-2026-0155' },
  { id: 'cost-153', label: 'Liman Masrafı',             amount: 2100.00,  currency: 'TRY', declarationRef: 'TRN-2026-0155' },

  // TRN-2026-0148 – Arçelik (transit)
  { id: 'cost-161', label: 'Transit Güvencesi',         amount: 3800.00,  currency: 'TRY', declarationRef: 'TRN-2026-0148' },
  { id: 'cost-162', label: 'Gümrük Müşavirlik Ücreti',  amount: 1600.00,  currency: 'TRY', declarationRef: 'TRN-2026-0148' },
  { id: 'cost-163', label: 'Havayolu Taşıma Ücreti',   amount: 1250.00,  currency: 'EUR', declarationRef: 'TRN-2026-0148' },
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
