import type {
  Customer,
  CustomerListItem,
  CustomerAddress,
  MailDomain,
  CustomerMail,
  DocumentRule,
  NotificationRule,
} from '../types';
import {
  createAddress,
  createCustomer,
  createDocumentRule,
  createDomain,
  createMail,
  createNotificationRule,
  deleteAddress,
  deleteCustomer,
  deleteDocumentRule,
  deleteDomain,
  deleteMail,
  deleteNotificationRule,
  listAddresses,
  listCustomers,
  listDocumentRules,
  listDomains,
  listMails,
  listNotificationRules,
  updateAddress,
  updateCustomer,
  updateDocumentRule,
  updateDomain,
  updateMail,
  updateNotificationRule,
} from '../api/customerApi';
import { delay } from './utils';

// ─── Legacy Customer list (used by other screens) ─────────────────────────────

const MOCK_CUSTOMERS: Customer[] = [
  { id: 'cust-001', name: 'Anadolu Tekstil A.Ş.',    taxId: '1234567890', email: 'ops@anadolutekstil.com.tr',      phone: '+90 212 555 0101', address: 'Bağcılar, İstanbul',      status: 'active'  },
  { id: 'cust-002', name: 'Marmara Makine Ltd.',      taxId: '9876543210', email: 'ithalat@marmaramakine.com.tr',   phone: '+90 216 555 0202', address: 'Kartal, İstanbul',         status: 'active'  },
  { id: 'cust-003', name: 'Karadeniz Gıda San.',      taxId: '5678901234', email: 'dis.ticaret@karadenizgida.com.tr', phone: '+90 462 555 0303', address: 'Trabzon',               status: 'active'  },
  { id: 'cust-004', name: 'Ege Kimya A.Ş.',           taxId: '3456789012', email: 'kimya@egekimya.com.tr',          phone: '+90 232 555 0404', address: 'Bornova, İzmir',          status: 'active'  },
  { id: 'cust-005', name: 'İstanbul Lojistik Koop.',  taxId: '2345678901', email: 'lojistik@istloj.com.tr',         phone: '+90 212 555 0505', address: 'Zeytinburnu, İstanbul',   status: 'passive' },
];

function isMongoId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

export const customersService = {
  list: async (): Promise<Customer[]> => {
    await delay(100);
    return [...MOCK_CUSTOMERS];
  },
  get: async (id: string): Promise<Customer | null> => {
    await delay(60);
    return MOCK_CUSTOMERS.find((c) => c.id === id) ?? null;
  },

  getCustomerList: async (): Promise<CustomerListItem[]> => {
    return listCustomers();
  },
  getCustomerById: async (id: string): Promise<CustomerListItem | null> => {
    const list = await listCustomers();
    return list.find((c) => c.id === id) ?? null;
  },
  createCustomer: async (data: { name: string; country?: string; initials?: string }) => {
    return createCustomer(data);
  },
  updateCustomer: async (
    id: string,
    data: Partial<{ name: string; country: string; initials: string }>
  ) => {
    return updateCustomer(id, data);
  },
  deleteCustomer: async (id: string) => {
    return deleteCustomer(id);
  },
  updateMtAssignment: async (
    customerId: string,
    assignedMtUserId: string | undefined,
    assignedMtManagerUserId: string | undefined,
  ): Promise<CustomerListItem> => {
    return updateCustomer(customerId, {
      assignedMtUserId: assignedMtUserId ?? null,
      assignedMtManagerUserId: assignedMtManagerUserId ?? null,
    });
  },

  getAddresses: async (customerId: string): Promise<CustomerAddress[]> => {
    if (!customerId) return [];
    return listAddresses(customerId);
  },
  saveAddress: async (
    customerId: string,
    id: string | undefined,
    data: Omit<CustomerAddress, 'id' | 'customerId'>
  ): Promise<CustomerAddress> => {
    if (id && isMongoId(id)) return updateAddress(id, data);
    return createAddress(customerId, data);
  },
  deleteAddress: async (id: string) => deleteAddress(id),

  getDomains: async (customerId: string): Promise<MailDomain[]> => {
    if (!customerId) return [];
    return listDomains(customerId);
  },
  saveDomain: async (
    customerId: string,
    id: string | undefined,
    data: Omit<MailDomain, 'id' | 'customerId'>
  ): Promise<MailDomain> => {
    if (id && isMongoId(id)) return updateDomain(id, data);
    return createDomain(customerId, data);
  },
  deleteDomain: async (id: string) => deleteDomain(id),

  getMails: async (customerId: string): Promise<CustomerMail[]> => {
    if (!customerId) return [];
    return listMails(customerId);
  },
  saveMail: async (
    customerId: string,
    id: string | undefined,
    data: Omit<CustomerMail, 'id' | 'customerId'>
  ): Promise<CustomerMail> => {
    if (id && isMongoId(id)) return updateMail(id, data);
    return createMail(customerId, data);
  },
  deleteMail: async (id: string) => deleteMail(id),

  getDocRules: async (customerId: string): Promise<DocumentRule[]> => {
    if (!customerId) return [];
    return listDocumentRules(customerId);
  },
  saveDocRule: async (
    customerId: string,
    id: string | undefined,
    data: Omit<DocumentRule, 'id' | 'customerId'>
  ): Promise<DocumentRule> => {
    if (id && isMongoId(id)) return updateDocumentRule(id, data);
    return createDocumentRule(customerId, data);
  },
  deleteDocRule: async (id: string) => deleteDocumentRule(id),

  getNotifyRules: async (customerId: string): Promise<NotificationRule[]> => {
    if (!customerId) return [];
    return listNotificationRules(customerId);
  },
  saveNotifyRule: async (
    customerId: string,
    id: string | undefined,
    data: Omit<NotificationRule, 'id' | 'customerId'>
  ): Promise<NotificationRule> => {
    if (id && isMongoId(id)) return updateNotificationRule(id, data);
    return createNotificationRule(customerId, data);
  },
  deleteNotifyRule: async (id: string) => deleteNotificationRule(id),
};
