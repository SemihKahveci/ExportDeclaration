// ─── App-level ────────────────────────────────────────────────────────────────

export type DeploymentMode = 'cloud' | 'self_hosted';

export type Role = 'super_admin' | 'admin' | 'manager' | 'yetkili';

export interface FirmUser {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
}

export interface AppState {
  deploymentMode: DeploymentMode;
  role: Role;
  impersonatingOrgId: string | null;
  currentUser: FirmUser;
}

// ─── Domain entities ──────────────────────────────────────────────────────────

export type FileStatus =
  | 'yeni-talep'
  | 'gtip-hazirlik'
  | 'evrak-bekleniyor'
  | 'beyanname-yazim'
  | 'ic-kontrol'
  | 'tescil'
  | 'kapanis-bekleyen'
  | 'kapandi';

export type HatColor = 'kirmizi' | 'sari' | 'mavi' | 'yesil';

export type TransportMode = 'karayolu' | 'denizyolu' | 'havayolu';

export interface Assignee {
  name: string;
}

export interface SystemMailRecord {
  type: string;
  sentCount: number;
  lastSentAt?: string;
  status: 'sent' | 'not_sent' | 'failed';
}

export type OperationType = 'ithalat' | 'ihracat' | 'transit' | 'antrepo';

export interface CustomsFile {
  ref: string;
  customer: string;
  customerCity: string;
  status: FileStatus;
  operationType: OperationType;
  isArchived: boolean;
  transportMode: TransportMode | null;
  line: HatColor | null;
  declarationNo: string | null;
  receivedAt: string;
  closedAt?: string;
  lastActivity: string;
  assignee: Assignee | null;
  escalation: boolean;
  missingDocuments: string[];
  systemMailHistory: SystemMailRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveStats {
  total: number;
  thisMonth: number;
  clean: number;
  warned: number;
}

export interface FileStatusCounts {
  total: number;
  yeniTalep: number;
  gtipHazirlik: number;
  evrakBekleniyor: number;
  beyanname: number;
  icKontrol: number;
  tescil: number;
  kapanisBekleyen: number;
}

export interface FileStatSummary {
  aktifDosya: number;
  evrakBekleyen: number;
  beyannamedYazim: number;
  eskalasyon: number;
  tescilde: number;
}

export interface Declaration {
  id: string;
  ref: string;
  customer: string;
  status: string;
  tescilNo?: string;
  createdAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  fileRef?: string;
  uploadedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
  status: 'active' | 'passive';
}

export interface GtipEntry {
  code: string;
  description: string;
  unit: string;
  taxRate: number;
  notes?: string;
}

// ─── GTİP / Malzeme screen ────────────────────────────────────────────────────

export type TransactionType = 'ithalat' | 'ihracat' | 'transit' | 'antrepo';

export type RecordStatus = 'verified' | 'pending';

export type RecordSource = 'manuel' | 'fatura';

export interface MaterialCustomer {
  id: string;
  name: string;
  initials: string;
  city: string;
  recordCount: number;
}

export interface MaterialRecord {
  id: string;
  materialNo: string;
  description: string;
  gtipNo: string;
  transactionTypes: TransactionType[];
  status: RecordStatus;
  source: RecordSource;
  updatedAt: string;
  customerId: string;
}

export interface Cost {
  id: string;
  label: string;
  amount: number;
  currency: string;
  declarationRef?: string;
}

// ─── GTİP Hazırlık screen ─────────────────────────────────────────────────────

export type GtipComplianceStatus = 'Uyumlu' | 'Uyumsuz' | 'Eksik';
export type QueryResultStatus = 'Bulundu' | 'Operasyon Girişi Gerekli';
export type QueryApprovalStatus = 'Onaylı' | 'Onay Bekliyor' | 'Giriş Bekliyor';

export interface GtipDeclarationItem {
  lineNo: string;
  materialNo: string;
  materialDesc: string;
  systemGtip: string;
  customerGtip: string;
  compliance: GtipComplianceStatus;
  note: string;
}

export interface GtipDeclaration {
  id: string;
  ref: string;
  customer: string;
  itemCount: number;
  /** Derived status label shown in the summary box */
  statusLabel: string;
  statusVariant: 'ok' | 'warn' | 'urgent';
  items: GtipDeclarationItem[];
}

export interface GtipQueryResult {
  id: string;
  materialNo: string;
  description: string;
  foundGtip: string;
  status: QueryResultStatus;
  approvalStatus: QueryApprovalStatus;
}

export interface GtipPageStats {
  pendingRequests: number;
  declarationControl: number;
  queryRequests: number;
  missingGtip: number;
  mismatchedRecords: number;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  requiredDocuments: string[];
  active: boolean;
  createdAt: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  processStep: string;
  subject: string;
  body: string;
  variables: string[];
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  taxId: string;
  plan: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  adminEmail: string;
  userCount: number;
  createdAt: string;
}

// ─── Müşteriler screen ────────────────────────────────────────────────────────

export interface CustomerListItem {
  id: string;
  name: string;
  initials: string;
  meta: string;
  assignedMtUserId?: string;
  assignedMtManagerUserId?: string;
}

export type EvrimStatus = 'local' | 'sent' | 'pending';

export interface CustomerAddress {
  id: string;
  company: string;
  addressLines: string;
  city: string;
  country: string;
  taxNo: string;
  evrimStatus: EvrimStatus;
  changed: boolean;
  customerId: string;
}

export interface MailDomain {
  id: string;
  domain: string;
  matchStatus: 'active' | 'passive';
  note: string;
  customerId: string;
}

export interface CustomerMail {
  id: string;
  email: string;
  domain: string;
  owner: string;
  matchStatus: 'active' | 'passive';
  notificationProcesses: string[];
  status: 'active' | 'passive';
  customerId: string;
}

export type DocRuleReminderType = 'Otomatik' | 'Kontrollü' | 'Manuel';

export interface DocumentRule {
  id: string;
  transactionType: string;
  transportMode: string;
  scenario: string;
  requiredDocs: string[];
  reminderType: DocRuleReminderType;
  frequency: string;
  status: 'Aktif' | 'Pasif';
  customerId: string;
}

export type NotifyWorkingMode = 'Otomatik' | 'Kontrollü' | 'Manuel' | 'Kapalı';

export interface NotificationRule {
  id: string;
  process: string;
  workingMode: NotifyWorkingMode;
  channels: string[];
  recipientRule: string;
  requiresApproval: boolean;
  status: 'Aktif' | 'Pasif';
  customerId: string;
}

// ─── Evrak Hazırlık screen ────────────────────────────────────────────────────

export type DocReadinessStatus = 'Geldi' | 'Eksik' | 'Koşullu';
export type DocRequiredFlag = 'Evet' | 'Hayır' | 'Koşullu';
export type ConflictType = 'Eksik Evrak' | 'Veri Uyumsuzluğu';

export interface EvrakFile {
  id: string;
  ref: string;
  customer: string;
  meta: string;
  allReady: boolean;
}

export interface EvrakDocRow {
  id: string;
  name: string;
  required: DocRequiredFlag;
  status: DocReadinessStatus;
  source: string;
  lastAction: string;
  note: string;
}

export interface EvrakConflictRow {
  id: string;
  type: ConflictType;
  docOrField: string;
  source1: string;
  value1: string;
  source2: string;
  value2: string;
  suggestedAction: string;
}

export interface DocPreviewData {
  docName: string;
  kap: string;
  kilo: string;
  gtip: string;
  parseSource: string;
  status: string;
  origin: string;
  lastAction: string;
}

export interface EvrakPageStats {
  required: number;
  received: number;
  missing: number;
  fieldConflicts: number;
  parsedFields: number;
}

// ─── Evraklar screen ─────────────────────────────────────────────────────────

export type EvraklarConditionField =
  | 'mensei'
  | 'teslim_ulkesi'
  | 'gonderici_ulkesi'
  | 'gtip_no';

export type EvraklarConditionOperator = 'equals' | 'starts_with';

export interface EvraklarCondition {
  field: EvraklarConditionField;
  operator: EvraklarConditionOperator;
  value: string;
  enabled: boolean;
}

export interface EvraklarRule {
  id: string;
  name: string;
  conditions: EvraklarCondition[];
  requiredDocuments: string[];
  active: boolean;
  createdAt: string;
}

export interface EvraklarPageStats {
  total: number;
  active: number;
  passive: number;
  docTypes: number;
}

// ─── Beyanname Tescil screen ──────────────────────────────────────────────────

export type TescilStatus = 'started' | 'completed';

export interface TescilRecord {
  id: string;
  ref: string;
  type: string;
  customer: string;
  tescilNo: string;
  line: 'Kırmızı' | 'Sarı' | 'Mavi' | 'Yeşil';
  status: TescilStatus;
  hasSecondNotif: boolean;
  risk: string;
  days: number;
  updatedAt: string;
}

export interface TescilPageStats {
  waiting: number;
  started: number;
  completed: number;
  yellowRed: number;
  blueGreenTracking: number;
}

// ─── Beyanname Yazım & Kontrol screen ────────────────────────────────────────

export type BeyannameListeStatus = 'yazim-bekliyor' | 'kontrol-bekliyor' | 'onaya-hazir' | 'kontrol-uyarisi';

export type GtipSuitabilityStatus = 'uygun' | 'eksik' | 'uyumsuz' | 'kontrol-bekliyor';

export interface BeyannameListeItem {
  id: string;
  ref: string;
  date: string;
  customer: string;
  customerCity: string;
  islemTipi: string;
  status: BeyannameListeStatus;
  transportMode: TransportMode | null;
  lineCount: number;
  docCount: number;
  totalDocCount: number;
  warningCount: number;
  missingDocuments: string[];
  gtipStatus: GtipSuitabilityStatus;
  assignee: string;
  updatedAt: string;
}

export type BeyannameStatus = 'taslak' | 'kontrol' | 'tescilli' | 'bekliyor';

export interface BeyannameDocCheckItem {
  id: string;
  name: string;
  status: 'geldi' | 'eksik' | 'kosullu';
  note: string;
}

export interface BeyannameLineItem {
  lineNo: number;
  gtip: string;
  description: string;
  quantity: string;
  mense: string;
  brutKg: string;
  netKg: string;
  kiymet: string;
  malzemeNo?: string;
  ticariTanim?: string;
  miktarBirimi?: string;
  dovizCinsi?: string;
}

export interface BeyannameWritingField {
  key: string;
  label: string;
  value: string;
  source: string;
  conflict: boolean;
}

export interface BeyannameFormFields {
  beyan: string;
  gumrukIdaresi: string;
  referansNo: string;
  tescilTarihi: string;
  gonderici: string;
  alici: string;
  teslimSekli: string;
  doviz: string;
  toplamFatura: string;
  kapBrut: string;
  ticariTanim: string;
}

export interface BeyannameRecord {
  id: string;
  ref: string;
  tescilNo: string;
  customer: string;
  /** Maps customer ID used to look up declaration field rules */
  customerId: string;
  rejim: string;
  durumLabel: string;
  status: BeyannameStatus;
  transportMode: string;
  docCount: number;
  lateDocCount: number;
  lineCount: number;
  warningCount: number;
  formFields: BeyannameFormFields;
  /** Flat map of declaration field name → current value for this record */
  fieldValues: Record<string, string>;
  /** Per-field document region mappings for this record */
  fieldMappings: DeclarationFieldMapping[];
  fields: BeyannameWritingField[];
  lineItems: BeyannameLineItem[];
  docs: BeyannameDocCheckItem[];
}

export interface FieldBox {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  page: number;
}

export interface ParsedSourceCard {
  id: string;
  title: string;
  subtitle: string;
  fields: string[];
  page: number;
  items: { label: string; value: string }[];
}

export interface BeyannamePageStats {
  selectedRecord: number;
  receivedDocs: number;
  lateDocs: number;
  pageCount: number;
  warnings: number;
}

// ─── Ayarlar screen ───────────────────────────────────────────────────────────

export type AppUserRole = 'Admin' | 'Yönetici' | 'MT Yönetici' | 'Operasyon' | 'MT' | 'Saha';
export type AppUserStatus = 'Aktif' | 'Pasif';

export type ApproverLevel = 'none' | 'first' | 'second';
export type SpecialAction = 'sendToSystem' | 'viewCosts' | 'downloadDocuments' | 'sendMail';
export type MenuAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'send' | 'download';

export interface ScreenPermission {
  view: boolean;
  operate: boolean;
}

export interface DeclarationApprovalRules {
  ithalat: 1 | 2;
  ihracat: 1 | 2;
  transit: 1 | 2;
  antrepo: 1 | 2;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
  capabilities: string[];
  // Authorization model
  operationTypes: OperationType[];
  menuAccess: string[];
  menuActions: Record<string, MenuAction[]>;
  approverLevel: ApproverLevel;
  specialActions: SpecialAction[];
  screenPermissions?: Record<string, ScreenPermission>;
}

export type DocTestResult = 'Başarılı' | 'Kısmi Başarılı' | 'Test Bekliyor' | 'Başarısız';
export type DocParseStatus = 'Evet' | 'Hayır';

export interface DocProcess {
  id: string;
  name: string;
  process: string;
  format: string;
  parseable: DocParseStatus;
  testResult: DocTestResult;
  successRate: string;
  supportNote: string;
  status: 'Aktif' | 'Pasif';
}

// ─── Kapanış & Mutabakat screen ───────────────────────────────────────────────

export type KapanicStatus =
  | 'kontrol-bekliyor'
  | 'mutabakat-hazir'
  | 'maliyet-bekliyor'
  | 'kapandi';

export interface KapanicFile {
  id: string;
  ref: string;
  customer: string;
  tescilNo: string;
  status: KapanicStatus;
  tescilDurumu: string;
  kapanicDurumu: string;
  mailRecipient: string;
  mailSubject: string;
  mailBody: string;
}

export interface KapanicDoc {
  id: string;
  name: string;
  required: boolean;
  status: 'Var' | 'Bekleniyor';
  format: string;
  date: string;
}

export interface KapanicCostItem {
  id: string;
  label: string;
  amount: string;
  currency: string;
}

export type ControlState = 'wait' | 'ok';

export interface KapanicControlItem {
  id: string;
  label: string;
  subDefault: string;
  subOk: string;
}

export interface KapanicPageStats {
  waiting: number;
  uploaded: number;
  reconciled: number;
  warnings: number;
  costPending: number;
}

// ─── Beyanname Alan Kuralları screen ──────────────────────────────────────────

export type DeclFieldConflictAction =
  | 'Ana kaynak öncelikli'
  | 'Kullanıcıya göster'
  | 'Müşteriye sor'
  | 'Manuel karar iste';

export interface DeclarationFieldRule {
  id: string;
  customerId: string;
  fieldGroup: string;
  fieldName: string;
  primarySource: string;
  fallbackSource: string;
  conflictAction: DeclFieldConflictAction;
  status: 'Aktif' | 'Pasif';
  description: string;
}

// ─── Beyanname Yazım – document field mapping ──────────────────────────────

/** A region on the declaration image (percentage coordinates). */
export interface DeclRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A region on a source document image (percentage coordinates). */
export interface SourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MtKontrolStatus = 'uyumlu' | 'uyumsuz' | 'kontrol-bekliyor';

export type MtKontrolSourceType = 'document' | 'database_record';

/**
 * Maps a clickable field area on the declaration image to the source document
 * region that supplied that value. Drives the MT Kontrol tab interaction.
 */
export interface MtKontrolMapping {
  id: string;
  declarationFieldName: string;
  declarationValue: string;
  declarationPage: number;
  declarationRegion: DeclRegion;
  sourceDocumentName: string;
  /** 'document' shows an image preview; 'database_record' shows a compact card */
  sourceDocumentType: MtKontrolSourceType;
  /** Base64 or URL of the source document image. Only used when sourceDocumentType === 'document'. */
  sourceDocumentPreviewImage?: string;
  sourceDocumentPage: number;
  sourceDocumentFieldLabel: string;
  sourceDocumentValue: string;
  sourceDocumentRegion: SourceRegion;
  status: MtKontrolStatus;
}
export interface DocumentFieldRegion {
  id: string;
  /** Document type this region belongs to, e.g. 'Fatura' */
  documentType: string;
  label: string;
  /** 0-100 percentage coordinates relative to the document preview area */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The mapping stored per record field: which region on which doc it came from. */
export interface DeclarationFieldMapping {
  declarationFieldName: string;
  linkedDocumentType: string;
  documentFieldRegionId: string;
  documentFieldLabel: string;
  status: 'uyumlu' | 'uyumsuz' | 'eslesmedi';
}
