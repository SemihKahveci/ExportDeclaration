import type {
  Customer,
  CustomerListItem,
  CustomerAddress,
  MailDomain,
  CustomerMail,
  DocumentRule,
  NotificationRule,
} from '../types';
import { delay } from './utils';

// ─── Legacy Customer list (used by other screens) ─────────────────────────────

const MOCK_CUSTOMERS: Customer[] = [
  { id: 'cust-001', name: 'Anadolu Tekstil A.Ş.',    taxId: '1234567890', email: 'ops@anadolutekstil.com.tr',      phone: '+90 212 555 0101', address: 'Bağcılar, İstanbul',      status: 'active'  },
  { id: 'cust-002', name: 'Marmara Makine Ltd.',      taxId: '9876543210', email: 'ithalat@marmaramakine.com.tr',   phone: '+90 216 555 0202', address: 'Kartal, İstanbul',         status: 'active'  },
  { id: 'cust-003', name: 'Karadeniz Gıda San.',      taxId: '5678901234', email: 'dis.ticaret@karadenizgida.com.tr', phone: '+90 462 555 0303', address: 'Trabzon',               status: 'active'  },
  { id: 'cust-004', name: 'Ege Kimya A.Ş.',           taxId: '3456789012', email: 'kimya@egekimya.com.tr',          phone: '+90 232 555 0404', address: 'Bornova, İzmir',          status: 'active'  },
  { id: 'cust-005', name: 'İstanbul Lojistik Koop.',  taxId: '2345678901', email: 'lojistik@istloj.com.tr',         phone: '+90 212 555 0505', address: 'Zeytinburnu, İstanbul',   status: 'passive' },
];

// ─── Müşteriler screen – panel list ──────────────────────────────────────────

const CUSTOMER_LIST: CustomerListItem[] = [
  { id: 'valeo',   name: 'Valeo eAutomotive Hungary Kft.', initials: 'VE', meta: 'Hungary · 3 adres',   assignedMtUserId: 'au-005', assignedMtManagerUserId: 'au-004' },
  { id: 'arcelik', name: 'Arçelik A.Ş.',                  initials: 'AR', meta: 'Türkiye · 5 adres',   assignedMtUserId: 'au-007', assignedMtManagerUserId: 'au-008' },
  { id: 'ford',    name: 'Ford Otosan',                    initials: 'FO', meta: 'Türkiye · 6 adres',   assignedMtUserId: 'au-005', assignedMtManagerUserId: 'au-004' },
  { id: 'vestel',  name: 'Vestel Ticaret',                 initials: 'VT', meta: 'Türkiye · 4 adres'   },
  { id: 'bsh',     name: 'BSH Ev Aletleri',                initials: 'BS', meta: 'Türkiye · 3 adres',   assignedMtUserId: 'au-007', assignedMtManagerUserId: 'au-004' },
  { id: 'eczaci',  name: 'Eczacıbaşı',                     initials: 'EC', meta: 'Türkiye · 2 adres',   assignedMtUserId: 'au-005', assignedMtManagerUserId: 'au-008' },
];

// ─── Addresses ────────────────────────────────────────────────────────────────

const ADDRESSES: CustomerAddress[] = [
  {
    id: 'addr-1',
    company: 'VALEO EAUTOMOTIVE HUNGARY KFT.',
    addressLines: 'ALSOERDOK UTCA HRSZ. 024\nVESZPREM',
    city: 'VESZPREM',
    country: 'Hungary',
    taxNo: '2222222222',
    evrimStatus: 'local',
    changed: false,
    customerId: 'valeo',
  },
  {
    id: 'addr-2',
    company: 'VALEO EAUTOMOTIVE HUNGARY KFT.',
    addressLines: 'H-8200 ALSOERDOK INDUSTRIAL ZONE\nBUILDING 4',
    city: 'VESZPREM',
    country: 'Hungary',
    taxNo: '2222222222',
    evrimStatus: 'sent',
    changed: false,
    customerId: 'valeo',
  },
  {
    id: 'addr-3',
    company: 'VALEO EAUTOMOTIVE HUNGARY KFT.',
    addressLines: 'WAREHOUSE GATE B\nALSOERDOK UTCA HRSZ. 024',
    city: 'VESZPREM',
    country: 'Hungary',
    taxNo: '2222222222',
    evrimStatus: 'local',
    changed: true,
    customerId: 'valeo',
  },
];

// ─── Mail Domains ─────────────────────────────────────────────────────────────

const MAIL_DOMAINS: MailDomain[] = [
  { id: 'dom-1', domain: '@valeo.com',          matchStatus: 'active',  note: 'Global Valeo domaini',               customerId: 'valeo' },
  { id: 'dom-2', domain: '@valeo.hu',           matchStatus: 'active',  note: 'Macaristan operasyon domaini',        customerId: 'valeo' },
  { id: 'dom-3', domain: '@external-valeo.com', matchStatus: 'passive', note: 'Kontrol sonrası aktif edilecek',      customerId: 'valeo' },
];

// ─── Customer Mails ───────────────────────────────────────────────────────────

const CUSTOMER_MAILS: CustomerMail[] = [
  {
    id: 'mail-1',
    email: 'logistics@valeo.com',
    domain: '@valeo.com',
    owner: 'Lojistik Ekibi',
    matchStatus: 'active',
    notificationProcesses: ['Evrak Eksik · Otomatik', 'Tescil Edildi · Otomatik', 'Kapanış Evrakları · Manuel'],
    status: 'active',
    customerId: 'valeo',
  },
  {
    id: 'mail-2',
    email: 'customs.hu@valeo.hu',
    domain: '@valeo.hu',
    owner: 'Gümrük Operasyon',
    matchStatus: 'active',
    notificationProcesses: ['GTİP Eksik · Kontrollü', 'Beyanname Başladı · Otomatik'],
    status: 'active',
    customerId: 'valeo',
  },
  {
    id: 'mail-3',
    email: 'finance@valeo.com',
    domain: '@valeo.com',
    owner: 'Finans',
    matchStatus: 'passive',
    notificationProcesses: ['Para Talep · Kontrollü'],
    status: 'active',
    customerId: 'valeo',
  },
];

// ─── Document Rules ───────────────────────────────────────────────────────────

const DOCUMENT_RULES: DocumentRule[] = [
  {
    id: 'rule-1',
    transactionType: 'İhracat',
    transportMode: 'Karayolu',
    scenario: 'Standart ihracat',
    requiredDocs: ['Fatura', 'Çeki Listesi', 'CMR'],
    reminderType: 'Otomatik',
    frequency: 'Her 2 saatte bir',
    status: 'Aktif',
    customerId: 'valeo',
  },
  {
    id: 'rule-2',
    transactionType: 'İhracat',
    transportMode: 'Denizyolu',
    scenario: 'Cut-off tarihli denizyolu ihracatı',
    requiredDocs: ['Fatura', 'Çeki Listesi', 'Konşimento', 'Booking'],
    reminderType: 'Kontrollü',
    frequency: "Cut-off'a göre dinamik",
    status: 'Aktif',
    customerId: 'valeo',
  },
  {
    id: 'rule-3',
    transactionType: 'İhracat',
    transportMode: 'Havayolu',
    scenario: 'Havayolu ihracat',
    requiredDocs: ['Fatura', 'Çeki Listesi', 'AWB'],
    reminderType: 'Otomatik',
    frequency: 'Günde 2 kez',
    status: 'Aktif',
    customerId: 'valeo',
  },
  {
    id: 'rule-4',
    transactionType: 'İthalat',
    transportMode: 'Karayolu',
    scenario: 'IM / AN rejimi araç girişi',
    requiredDocs: ['Fatura', 'Özet Beyan Bilgisi'],
    reminderType: 'Manuel',
    frequency: 'Manuel takip',
    status: 'Aktif',
    customerId: 'valeo',
  },
];

// ─── Notification Rules ───────────────────────────────────────────────────────

const NOTIFICATION_RULES: NotificationRule[] = [
  {
    id: 'nr-1',
    process: 'Eksik Evrak Hatırlatma',
    workingMode: 'Otomatik',
    channels: ['E-posta'],
    recipientRule: 'Mail tanımlarından',
    requiresApproval: false,
    status: 'Aktif',
    customerId: 'valeo',
  },
  {
    id: 'nr-2',
    process: 'Yanlış Beyanname Bildirimi',
    workingMode: 'Manuel',
    channels: ['E-posta'],
    recipientRule: 'Operatör seçer',
    requiresApproval: true,
    status: 'Aktif',
    customerId: 'valeo',
  },
  {
    id: 'nr-3',
    process: 'Tescil Bilgilendirmesi',
    workingMode: 'Kapalı',
    channels: [],
    recipientRule: '—',
    requiresApproval: false,
    status: 'Pasif',
    customerId: 'valeo',
  },
  {
    id: 'nr-4',
    process: 'GTİP Hatalı Bildirimi',
    workingMode: 'Kontrollü',
    channels: ['E-posta'],
    recipientRule: 'Mail tanımlarından',
    requiresApproval: true,
    status: 'Aktif',
    customerId: 'valeo',
  },
  {
    id: 'nr-5',
    process: 'Beyanname Tescil Edildi',
    workingMode: 'Otomatik',
    channels: ['E-posta'],
    recipientRule: 'Mail tanımlarından',
    requiresApproval: false,
    status: 'Aktif',
    customerId: 'valeo',
  },
];

// ─── Service exports ──────────────────────────────────────────────────────────

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
    await delay(80);
    return CUSTOMER_LIST.map((c) => ({ ...c }));
  },
  getCustomerById: async (id: string): Promise<CustomerListItem | null> => {
    await delay(40);
    return CUSTOMER_LIST.find((c) => c.id === id) ?? null;
  },
  updateMtAssignment: async (
    customerId: string,
    assignedMtUserId: string | undefined,
    assignedMtManagerUserId: string | undefined,
  ): Promise<void> => {
    await delay(60);
    const idx = CUSTOMER_LIST.findIndex((c) => c.id === customerId);
    if (idx !== -1) {
      CUSTOMER_LIST[idx] = { ...CUSTOMER_LIST[idx], assignedMtUserId, assignedMtManagerUserId };
    }
  },
  getAddresses: async (customerId: string): Promise<CustomerAddress[]> => {
    await delay(60);
    return ADDRESSES.filter((a) => a.customerId === customerId).map((a) => ({ ...a }));
  },
  getDomains: async (customerId: string): Promise<MailDomain[]> => {
    await delay(60);
    return MAIL_DOMAINS.filter((d) => d.customerId === customerId).map((d) => ({ ...d }));
  },
  getMails: async (customerId: string): Promise<CustomerMail[]> => {
    await delay(60);
    return CUSTOMER_MAILS.filter((m) => m.customerId === customerId).map((m) => ({ ...m }));
  },
  getDocRules: async (customerId: string): Promise<DocumentRule[]> => {
    await delay(60);
    return DOCUMENT_RULES.filter((r) => r.customerId === customerId).map((r) => ({ ...r }));
  },
  getNotifyRules: async (customerId: string): Promise<NotificationRule[]> => {
    await delay(60);
    return NOTIFICATION_RULES.filter((r) => r.customerId === customerId).map((r) => ({ ...r }));
  },
};
