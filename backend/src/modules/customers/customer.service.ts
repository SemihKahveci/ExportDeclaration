import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  CustomerAddressModel,
  CustomerDocumentRuleModel,
  CustomerMailDomainModel,
  CustomerMailModel,
  CustomerModel,
  CustomerNotificationRuleModel,
  DeclarationFieldRuleModel,
  DECL_FIELD_CONFLICT_ACTIONS,
  DOC_RULE_REMINDER_TYPES,
  EVRIM_STATUSES,
  NOTIFY_WORKING_MODES
} from "./customer.models.js";
import {
  makeInitials,
  toAddressDto,
  toCustomerDto,
  toDeclarationFieldRuleDto,
  toDocumentRuleDto,
  toDomainDto,
  toMailDto,
  toNotificationRuleDto,
  type CustomerAddressDto,
  type CustomerDto,
  type CustomerMailDto,
  type DeclarationFieldRuleDto,
  type DocumentRuleDto,
  type MailDomainDto,
  type NotificationRuleDto
} from "./customer.mapper.js";

function requireCustomerId(customerId: unknown): string {
  const id = typeof customerId === "string" ? customerId.trim() : "";
  if (!id) throw new HttpError(400, "customerId gerekli.");
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz customerId.");
  return id;
}

async function assertCustomerExists(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<void> {
  const exists = await CustomerModel.exists({ _id: customerId, companyId });
  if (!exists) throw new HttpError(404, "Müşteri bulunamadı.");
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function listCustomers(companyId: mongoose.Types.ObjectId): Promise<CustomerDto[]> {
  const customers = await CustomerModel.find({ companyId }).sort({ name: 1 });
  const counts = await CustomerAddressModel.aggregate<{ _id: string; count: number }>([
    { $match: { companyId } },
    { $group: { _id: "$customerId", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map((c) => [c._id, c.count]));
  return customers.map((c) => toCustomerDto(c, countMap.get(String(c._id)) ?? 0));
}

export async function createCustomer(
  companyId: mongoose.Types.ObjectId,
  body: { name?: string; country?: string; initials?: string }
): Promise<CustomerDto> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new HttpError(400, "Müşteri adı gerekli.");
  const country =
    typeof body.country === "string" && body.country.trim() ? body.country.trim() : "Türkiye";
  const initials =
    typeof body.initials === "string" && body.initials.trim()
      ? body.initials.trim().slice(0, 3).toUpperCase()
      : makeInitials(name);

  const created = await CustomerModel.create({
    companyId,
    name,
    country,
    initials
  });
  return toCustomerDto(created, 0);
}

export async function updateCustomer(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: {
    name?: string;
    country?: string;
    initials?: string;
    assignedMtUserId?: string | null;
    assignedMtManagerUserId?: string | null;
  }
): Promise<CustomerDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz müşteri id.");
  const existing = await CustomerModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Müşteri bulunamadı.");

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new HttpError(400, "Müşteri adı gerekli.");
    existing.name = name;
  }
  if (body.country !== undefined) existing.country = String(body.country).trim() || "Türkiye";
  if (body.initials !== undefined) {
    existing.initials = String(body.initials).trim().slice(0, 3).toUpperCase() || makeInitials(existing.name);
  }
  if (body.assignedMtUserId !== undefined) {
    existing.assignedMtUserId = body.assignedMtUserId || undefined;
  }
  if (body.assignedMtManagerUserId !== undefined) {
    existing.assignedMtManagerUserId = body.assignedMtManagerUserId || undefined;
  }

  await existing.save();
  const addressCount = await CustomerAddressModel.countDocuments({ companyId, customerId: id });
  return toCustomerDto(existing, addressCount);
}

export async function deleteCustomer(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz müşteri id.");
  const deleted = await CustomerModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Müşteri bulunamadı.");

  await Promise.all([
    CustomerAddressModel.deleteMany({ companyId, customerId: id }),
    CustomerMailDomainModel.deleteMany({ companyId, customerId: id }),
    CustomerMailModel.deleteMany({ companyId, customerId: id }),
    CustomerDocumentRuleModel.deleteMany({ companyId, customerId: id }),
    CustomerNotificationRuleModel.deleteMany({ companyId, customerId: id }),
    DeclarationFieldRuleModel.deleteMany({ companyId, customerId: id })
  ]);
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export async function listAddresses(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<CustomerAddressDto[]> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const rows = await CustomerAddressModel.find({ companyId, customerId: cid }).sort({
    createdAt: -1
  });
  return rows.map(toAddressDto);
}

export async function createAddress(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: Partial<CustomerAddressDto>
): Promise<CustomerAddressDto> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company) throw new HttpError(400, "Şirket ünvanı gerekli.");
  const addressLines = typeof body.addressLines === "string" ? body.addressLines.trim() : "";
  if (!addressLines) throw new HttpError(400, "Adres satırları gerekli.");

  const created = await CustomerAddressModel.create({
    companyId,
    customerId: cid,
    company,
    addressLines,
    city: typeof body.city === "string" ? body.city.trim() : "",
    country: typeof body.country === "string" ? body.country.trim() : "",
    taxNo: typeof body.taxNo === "string" ? body.taxNo.trim() : "",
    evrimStatus:
      typeof body.evrimStatus === "string" &&
      EVRIM_STATUSES.includes(body.evrimStatus as (typeof EVRIM_STATUSES)[number])
        ? body.evrimStatus
        : "local",
    changed: Boolean(body.changed)
  });
  return toAddressDto(created);
}

export async function updateAddress(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: Partial<CustomerAddressDto>
): Promise<CustomerAddressDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz adres id.");
  const existing = await CustomerAddressModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Adres bulunamadı.");

  if (body.company !== undefined) {
    const company = String(body.company).trim();
    if (!company) throw new HttpError(400, "Şirket ünvanı gerekli.");
    existing.company = company;
  }
  if (body.addressLines !== undefined) {
    const lines = String(body.addressLines).trim();
    if (!lines) throw new HttpError(400, "Adres satırları gerekli.");
    existing.addressLines = lines;
  }
  if (body.city !== undefined) existing.city = String(body.city).trim();
  if (body.country !== undefined) existing.country = String(body.country).trim();
  if (body.taxNo !== undefined) existing.taxNo = String(body.taxNo).trim();
  if (body.evrimStatus !== undefined) {
    if (!EVRIM_STATUSES.includes(body.evrimStatus as (typeof EVRIM_STATUSES)[number])) {
      throw new HttpError(400, "Geçersiz evrim durumu.");
    }
    existing.evrimStatus = body.evrimStatus as (typeof EVRIM_STATUSES)[number];
  }
  if (body.changed !== undefined) existing.changed = Boolean(body.changed);

  await existing.save();
  return toAddressDto(existing);
}

export async function deleteAddress(companyId: mongoose.Types.ObjectId, id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz adres id.");
  const deleted = await CustomerAddressModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Adres bulunamadı.");
}

// ─── Mail domains ─────────────────────────────────────────────────────────────

export async function listDomains(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<MailDomainDto[]> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const rows = await CustomerMailDomainModel.find({ companyId, customerId: cid }).sort({
    createdAt: -1
  });
  return rows.map(toDomainDto);
}

export async function createDomain(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: Partial<MailDomainDto>
): Promise<MailDomainDto> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  if (!domain) throw new HttpError(400, "Domain gerekli.");

  const created = await CustomerMailDomainModel.create({
    companyId,
    customerId: cid,
    domain,
    matchStatus: body.matchStatus === "passive" ? "passive" : "active",
    note: typeof body.note === "string" ? body.note.trim() : ""
  });
  return toDomainDto(created);
}

export async function updateDomain(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: Partial<MailDomainDto>
): Promise<MailDomainDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz domain id.");
  const existing = await CustomerMailDomainModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Domain bulunamadı.");

  if (body.domain !== undefined) {
    const domain = String(body.domain).trim();
    if (!domain) throw new HttpError(400, "Domain gerekli.");
    existing.domain = domain;
  }
  if (body.matchStatus !== undefined) {
    existing.matchStatus = body.matchStatus === "passive" ? "passive" : "active";
  }
  if (body.note !== undefined) existing.note = String(body.note).trim();

  await existing.save();
  return toDomainDto(existing);
}

export async function deleteDomain(companyId: mongoose.Types.ObjectId, id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz domain id.");
  const deleted = await CustomerMailDomainModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Domain bulunamadı.");
}

// ─── Customer mails ───────────────────────────────────────────────────────────

export async function listMails(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<CustomerMailDto[]> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const rows = await CustomerMailModel.find({ companyId, customerId: cid }).sort({ createdAt: -1 });
  return rows.map(toMailDto);
}

export async function createMail(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: Partial<CustomerMailDto>
): Promise<CustomerMailDto> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) throw new HttpError(400, "E-posta gerekli.");

  const created = await CustomerMailModel.create({
    companyId,
    customerId: cid,
    email,
    domain: typeof body.domain === "string" ? body.domain.trim() : "",
    owner: typeof body.owner === "string" ? body.owner.trim() : "",
    matchStatus: body.matchStatus === "passive" ? "passive" : "active",
    notificationProcesses: asStringArray(body.notificationProcesses),
    status: body.status === "passive" ? "passive" : "active"
  });
  return toMailDto(created);
}

export async function updateMail(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: Partial<CustomerMailDto>
): Promise<CustomerMailDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz mail id.");
  const existing = await CustomerMailModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Mail tanımı bulunamadı.");

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email) throw new HttpError(400, "E-posta gerekli.");
    existing.email = email;
  }
  if (body.domain !== undefined) existing.domain = String(body.domain).trim();
  if (body.owner !== undefined) existing.owner = String(body.owner).trim();
  if (body.matchStatus !== undefined) {
    existing.matchStatus = body.matchStatus === "passive" ? "passive" : "active";
  }
  if (body.notificationProcesses !== undefined) {
    existing.notificationProcesses = asStringArray(body.notificationProcesses);
  }
  if (body.status !== undefined) {
    existing.status = body.status === "passive" ? "passive" : "active";
  }

  await existing.save();
  return toMailDto(existing);
}

export async function deleteMail(companyId: mongoose.Types.ObjectId, id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz mail id.");
  const deleted = await CustomerMailModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Mail tanımı bulunamadı.");
}

// ─── Document rules ───────────────────────────────────────────────────────────

export async function listDocumentRules(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<DocumentRuleDto[]> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const rows = await CustomerDocumentRuleModel.find({ companyId, customerId: cid }).sort({
    createdAt: -1
  });
  return rows.map(toDocumentRuleDto);
}

export async function createDocumentRule(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: Partial<DocumentRuleDto>
): Promise<DocumentRuleDto> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const transactionType =
    typeof body.transactionType === "string" ? body.transactionType.trim() : "";
  const transportMode = typeof body.transportMode === "string" ? body.transportMode.trim() : "";
  if (!transactionType) throw new HttpError(400, "İşlem tipi gerekli.");
  if (!transportMode) throw new HttpError(400, "Taşıma şekli gerekli.");

  const reminderType =
    typeof body.reminderType === "string" &&
    DOC_RULE_REMINDER_TYPES.includes(body.reminderType as (typeof DOC_RULE_REMINDER_TYPES)[number])
      ? (body.reminderType as (typeof DOC_RULE_REMINDER_TYPES)[number])
      : "Otomatik";

  const created = await CustomerDocumentRuleModel.create({
    companyId,
    customerId: cid,
    transactionType,
    transportMode,
    scenario: typeof body.scenario === "string" ? body.scenario.trim() : "",
    requiredDocs: asStringArray(body.requiredDocs),
    reminderType,
    frequency: typeof body.frequency === "string" ? body.frequency.trim() : "",
    status: body.status === "Pasif" ? "Pasif" : "Aktif"
  });
  return toDocumentRuleDto(created);
}

export async function updateDocumentRule(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: Partial<DocumentRuleDto>
): Promise<DocumentRuleDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const existing = await CustomerDocumentRuleModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Evrak kuralı bulunamadı.");

  if (body.transactionType !== undefined) {
    const v = String(body.transactionType).trim();
    if (!v) throw new HttpError(400, "İşlem tipi gerekli.");
    existing.transactionType = v;
  }
  if (body.transportMode !== undefined) {
    const v = String(body.transportMode).trim();
    if (!v) throw new HttpError(400, "Taşıma şekli gerekli.");
    existing.transportMode = v;
  }
  if (body.scenario !== undefined) existing.scenario = String(body.scenario).trim();
  if (body.requiredDocs !== undefined) existing.requiredDocs = asStringArray(body.requiredDocs);
  if (body.reminderType !== undefined) {
    if (
      !DOC_RULE_REMINDER_TYPES.includes(
        body.reminderType as (typeof DOC_RULE_REMINDER_TYPES)[number]
      )
    ) {
      throw new HttpError(400, "Geçersiz hatırlatma tipi.");
    }
    existing.reminderType = body.reminderType as (typeof DOC_RULE_REMINDER_TYPES)[number];
  }
  if (body.frequency !== undefined) existing.frequency = String(body.frequency).trim();
  if (body.status !== undefined) existing.status = body.status === "Pasif" ? "Pasif" : "Aktif";

  await existing.save();
  return toDocumentRuleDto(existing);
}

export async function deleteDocumentRule(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const deleted = await CustomerDocumentRuleModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Evrak kuralı bulunamadı.");
}

// ─── Notification rules ───────────────────────────────────────────────────────

export async function listNotificationRules(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<NotificationRuleDto[]> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const rows = await CustomerNotificationRuleModel.find({ companyId, customerId: cid }).sort({
    createdAt: -1
  });
  return rows.map(toNotificationRuleDto);
}

export async function createNotificationRule(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: Partial<NotificationRuleDto>
): Promise<NotificationRuleDto> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const process = typeof body.process === "string" ? body.process.trim() : "";
  if (!process) throw new HttpError(400, "Süreç gerekli.");

  const workingMode =
    typeof body.workingMode === "string" &&
    NOTIFY_WORKING_MODES.includes(body.workingMode as (typeof NOTIFY_WORKING_MODES)[number])
      ? (body.workingMode as (typeof NOTIFY_WORKING_MODES)[number])
      : "Otomatik";

  const created = await CustomerNotificationRuleModel.create({
    companyId,
    customerId: cid,
    process,
    workingMode,
    channels: asStringArray(body.channels),
    recipientRule: typeof body.recipientRule === "string" ? body.recipientRule.trim() : "",
    requiresApproval: Boolean(body.requiresApproval),
    status: body.status === "Pasif" ? "Pasif" : "Aktif"
  });
  return toNotificationRuleDto(created);
}

export async function updateNotificationRule(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: Partial<NotificationRuleDto>
): Promise<NotificationRuleDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const existing = await CustomerNotificationRuleModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Bildirim kuralı bulunamadı.");

  if (body.process !== undefined) {
    const process = String(body.process).trim();
    if (!process) throw new HttpError(400, "Süreç gerekli.");
    existing.process = process;
  }
  if (body.workingMode !== undefined) {
    if (
      !NOTIFY_WORKING_MODES.includes(body.workingMode as (typeof NOTIFY_WORKING_MODES)[number])
    ) {
      throw new HttpError(400, "Geçersiz çalışma modu.");
    }
    existing.workingMode = body.workingMode as (typeof NOTIFY_WORKING_MODES)[number];
  }
  if (body.channels !== undefined) existing.channels = asStringArray(body.channels);
  if (body.recipientRule !== undefined) existing.recipientRule = String(body.recipientRule).trim();
  if (body.requiresApproval !== undefined) existing.requiresApproval = Boolean(body.requiresApproval);
  if (body.status !== undefined) existing.status = body.status === "Pasif" ? "Pasif" : "Aktif";

  await existing.save();
  return toNotificationRuleDto(existing);
}

export async function deleteNotificationRule(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const deleted = await CustomerNotificationRuleModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Bildirim kuralı bulunamadı.");
}

// ─── Declaration field rules ──────────────────────────────────────────────────

export async function listDeclarationFieldRules(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<DeclarationFieldRuleDto[]> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const rows = await DeclarationFieldRuleModel.find({ companyId, customerId: cid }).sort({
    createdAt: -1
  });
  return rows.map(toDeclarationFieldRuleDto);
}

export async function createDeclarationFieldRule(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: Partial<DeclarationFieldRuleDto>
): Promise<DeclarationFieldRuleDto> {
  const cid = requireCustomerId(customerId);
  await assertCustomerExists(companyId, cid);
  const fieldGroup = typeof body.fieldGroup === "string" ? body.fieldGroup.trim() : "";
  const fieldName = typeof body.fieldName === "string" ? body.fieldName.trim() : "";
  if (!fieldGroup) throw new HttpError(400, "Alan grubu gerekli.");
  if (!fieldName) throw new HttpError(400, "Alan adı gerekli.");

  const conflictAction =
    typeof body.conflictAction === "string" &&
    DECL_FIELD_CONFLICT_ACTIONS.includes(
      body.conflictAction as (typeof DECL_FIELD_CONFLICT_ACTIONS)[number]
    )
      ? (body.conflictAction as (typeof DECL_FIELD_CONFLICT_ACTIONS)[number])
      : "Ana kaynak öncelikli";

  const created = await DeclarationFieldRuleModel.create({
    companyId,
    customerId: cid,
    fieldGroup,
    fieldName,
    primarySource: typeof body.primarySource === "string" ? body.primarySource.trim() : "",
    fallbackSource: typeof body.fallbackSource === "string" ? body.fallbackSource.trim() : "",
    conflictAction,
    status: body.status === "Pasif" ? "Pasif" : "Aktif",
    description: typeof body.description === "string" ? body.description.trim() : ""
  });
  return toDeclarationFieldRuleDto(created);
}

export async function updateDeclarationFieldRule(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: Partial<DeclarationFieldRuleDto>
): Promise<DeclarationFieldRuleDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const existing = await DeclarationFieldRuleModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Alan kuralı bulunamadı.");

  if (body.fieldGroup !== undefined) {
    const v = String(body.fieldGroup).trim();
    if (!v) throw new HttpError(400, "Alan grubu gerekli.");
    existing.fieldGroup = v;
  }
  if (body.fieldName !== undefined) {
    const v = String(body.fieldName).trim();
    if (!v) throw new HttpError(400, "Alan adı gerekli.");
    existing.fieldName = v;
  }
  if (body.primarySource !== undefined) existing.primarySource = String(body.primarySource).trim();
  if (body.fallbackSource !== undefined) {
    existing.fallbackSource = String(body.fallbackSource).trim();
  }
  if (body.conflictAction !== undefined) {
    if (
      !DECL_FIELD_CONFLICT_ACTIONS.includes(
        body.conflictAction as (typeof DECL_FIELD_CONFLICT_ACTIONS)[number]
      )
    ) {
      throw new HttpError(400, "Geçersiz çakışma aksiyonu.");
    }
    existing.conflictAction = body.conflictAction as (typeof DECL_FIELD_CONFLICT_ACTIONS)[number];
  }
  if (body.status !== undefined) existing.status = body.status === "Pasif" ? "Pasif" : "Aktif";
  if (body.description !== undefined) existing.description = String(body.description).trim();

  await existing.save();
  return toDeclarationFieldRuleDto(existing);
}

export async function deleteDeclarationFieldRule(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const deleted = await DeclarationFieldRuleModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Alan kuralı bulunamadı.");
}
