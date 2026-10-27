import { getDeclaration, patchDeclaration } from "../../api/declarationApi";
import { toWritingFieldValues } from "../../api/adapters/declarationAdapter";
import { mergeNormalizedFromApi, type NormalizedDeclaration } from "../../api/types/document.types";
import type { BeyannameLineItem } from "../../types";
import { isWeightUnit } from "../../domain/weightUnit";

function editableText(value: string | number | undefined): string {
  const text = value == null ? "" : String(value).trim();
  return text === "—" || text === "–" || text === "-" ? "" : text;
}

function parseTrNumber(value: string | undefined): number | undefined {
  const text = editableText(value).replace(/[^\d,.-]/g, "").replace(/\s/g, "");
  if (!text) return undefined;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let normalized = text;
  if (hasComma && hasDot) {
    normalized = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasComma) {
    normalized = text.replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 1 && parts.slice(1).every((part) => part.length === 3)) normalized = text.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDisplayDate(value: string): string | undefined {
  const match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function applyWeightQuantity(item: BeyannameLineItem): BeyannameLineItem {
  if (!isWeightUnit(item.miktarBirimi)) return item;
  const quantity = editableText(item.quantity);
  return quantity ? { ...item, netKg: quantity } : item;
}

function setText(target: Record<string, unknown>, key: string, value: string) {
  if (value) target[key] = value;
  else delete target[key];
}

export async function saveWritingDraft(
  declarationId: string,
  fieldValues: Record<string, string>,
  lineItems: BeyannameLineItem[]
): Promise<void> {
  const current = await getDeclaration(declarationId);
  const norm = mergeNormalizedFromApi(current.normalizedData);
  const displayed = toWritingFieldValues(norm, current.operation);
  const next: NormalizedDeclaration = structuredClone(norm);
  const evrim: Record<string, unknown> = { ...(next.evrimHeader ?? {}) };
  const seller = { ...(next.parties.seller ?? {}) };
  const buyer = { ...(next.parties.buyer ?? {}) };
  const changed = (label: string) => (fieldValues[label] ?? "") !== (displayed[label] ?? "");
  const value = (label: string) => (fieldValues[label] ?? "").trim();

  if (changed("Referans No")) setText(evrim, "fileReference", value("Referans No"));
  if (changed("Tescil Tarihi")) {
    const iso = parseDisplayDate(value("Tescil Tarihi"));
    if (iso) evrim.declarationDate = iso;
    else if (!value("Tescil Tarihi")) delete evrim.declarationDate;
  }
  if (changed("Rejim")) setText(evrim, "rejim", value("Rejim"));
  if (changed("Rejim Kodu")) setText(evrim, "rejimKodu", value("Rejim Kodu"));
  if (changed("Gümrük İdaresi")) setText(evrim, "gumrukIdaresi", value("Gümrük İdaresi"));
  if (changed("Beyan Sahibi / Temsilci")) setText(evrim, "beyanSahibi", value("Beyan Sahibi / Temsilci"));
  if (changed("Beyan Türü")) setText(evrim, "beyanTuru", value("Beyan Türü"));
  if (changed("Gönderici / İhracatçı Ünvanı")) seller.name = value("Gönderici / İhracatçı Ünvanı") || undefined;
  if (changed("Gönderici / İhracatçı Adresi")) seller.address = value("Gönderici / İhracatçı Adresi") || undefined;
  if (changed("Gönderici Ülke")) seller.country = value("Gönderici Ülke") || undefined;
  if (changed("Alıcı / İthalatçı Ünvanı")) buyer.name = value("Alıcı / İthalatçı Ünvanı") || undefined;
  if (changed("Alıcı / İthalatçı Adresi")) buyer.address = value("Alıcı / İthalatçı Adresi") || undefined;
  if (changed("Alıcı Ülke")) buyer.country = value("Alıcı Ülke") || undefined;
  if (changed("Çıkış Ülkesi")) next.trade.exitCountry = value("Çıkış Ülkesi") || undefined;
  if (changed("Varış Ülkesi")) next.trade.arrivalCountry = value("Varış Ülkesi") || undefined;
  if (changed("Gideceği Ülke")) next.trade.destinationCountry = value("Gideceği Ülke") || undefined;
  if (changed("Menşe Ülke")) next.trade.origin = value("Menşe Ülke") || undefined;
  if (changed("Ticaret Yapılan Ülke")) next.trade.tradeCountry = value("Ticaret Yapılan Ülke") || undefined;
  if (changed("Teslim Şekli")) next.trade.deliveryTerm = value("Teslim Şekli") || undefined;
  if (changed("Ödeme Şekli")) next.trade.paymentType = value("Ödeme Şekli") || undefined;
  if (changed("Taşıma Şekli")) next.transport.mode = value("Taşıma Şekli") || undefined;
  if (changed("Taşıyıcı / Nakliyeci")) next.transport.carrier = value("Taşıyıcı / Nakliyeci") || undefined;
  if (changed("Çıkış Aracı")) next.transport.departureVehicleId = value("Çıkış Aracı") || undefined;
  if (changed("Sınır Geçiş Aracı")) next.transport.borderVehicleId = value("Sınır Geçiş Aracı") || undefined;
  if (changed("Plaka")) next.transport.vehiclePlate = value("Plaka") || undefined;
  if (changed("Konteyner No")) next.transport.containerNo = value("Konteyner No") || undefined;
  if (changed("Konşimento No")) next.transport.billOfLadingNo = value("Konşimento No") || undefined;
  if (changed("CMR No")) next.transport.cmrNo = value("CMR No") || undefined;
  if (changed("AWB No")) next.transport.awbNo = value("AWB No") || undefined;
  if (changed("Taşıma Senedi No")) next.transport.transportDocumentNo = value("Taşıma Senedi No") || undefined;
  if (changed("Fatura No")) next.header.invoiceNo = value("Fatura No") || undefined;
  if (changed("Fatura Tarihi")) {
    const iso = parseDisplayDate(value("Fatura Tarihi"));
    if (iso) next.header.invoiceDate = iso;
    else if (!value("Fatura Tarihi")) next.header.invoiceDate = undefined;
  }
  if (changed("Döviz Cinsi")) next.header.currency = value("Döviz Cinsi") || undefined;
  if (changed("Toplam Fatura Bedeli")) next.header.totalAmount = parseTrNumber(value("Toplam Fatura Bedeli"));
  if (changed("Döviz Kuru")) next.finance = { ...next.finance, exchangeRate: parseTrNumber(value("Döviz Kuru")) };
  if (changed("Navlun")) next.finance = { ...next.finance, freight: parseTrNumber(value("Navlun")) };
  if (changed("Sigorta")) next.finance = { ...next.finance, insurance: parseTrNumber(value("Sigorta")) };
  if (changed("Finansal / Banka Bilgisi")) next.finance = { ...next.finance, bankInfo: value("Finansal / Banka Bilgisi") || undefined };
  if (changed("Kap Adedi")) next.packageInfo.totalPackage = parseTrNumber(value("Kap Adedi"));
  if (changed("Kap Cinsi")) next.packageInfo.packageType = value("Kap Cinsi") || undefined;
  if (changed("Brüt Kilo")) next.packageInfo.grossKg = parseTrNumber(value("Brüt Kilo"));
  if (changed("Net Kilo")) next.packageInfo.netKg = parseTrNumber(value("Net Kilo"));
  if (changed("Önceki Belge No")) next.documents = { ...next.documents, previousDocumentNo: value("Önceki Belge No") || undefined };
  if (changed("Dolaşım Belgesi No")) next.documents = { ...next.documents, circulationDocumentNo: value("Dolaşım Belgesi No") || undefined };
  if (changed("Menşe Belgesi No")) next.documents = { ...next.documents, originDocumentNo: value("Menşe Belgesi No") || undefined };

  const mapped = new Set(Object.keys(displayed));
  const draftFields: Record<string, string> = {};
  const previousDraft = evrim.draftFields;
  if (previousDraft && typeof previousDraft === "object" && !Array.isArray(previousDraft)) {
    for (const [key, stored] of Object.entries(previousDraft as Record<string, unknown>)) {
      if (typeof stored === "string") draftFields[key] = stored;
    }
  }
  for (const [key, raw] of Object.entries(fieldValues)) {
    if (mapped.has(key)) continue;
    const text = raw.trim();
    if (text) draftFields[key] = text;
    else delete draftFields[key];
  }
  if (Object.keys(draftFields).length > 0) evrim.draftFields = draftFields;
  else delete evrim.draftFields;

  next.evrimHeader = evrim;
  next.parties = { ...next.parties, seller, buyer };
  next.goodsLines = applyWeightQuantityList(lineItems).map((item, index) => {
    const previous = norm.goodsLines[index];
    const quantity = parseTrNumber(item.quantity);
    const line = {
      lineNo: Number.isFinite(Number(item.lineNo)) && Number(item.lineNo) > 0 ? Number(item.lineNo) : index + 1,
      hsCode: editableText(item.gtip) || undefined,
      productCode: editableText(item.malzemeNo) || undefined,
      invoiceNo: editableText(item.faturaNo) || undefined,
      description: editableText(item.ticariTanim) || editableText(item.description) || undefined,
      quantity,
      unit: editableText(item.miktarBirimi) || undefined,
      unitPrice: previous?.unitPrice,
      lineTotal: parseTrNumber(item.kiymet),
      origin: editableText(item.mense) || undefined,
      grossKg: parseTrNumber(item.brutKg),
      netKg: parseTrNumber(item.netKg),
    };
    return line;
  });

  const operation: { declarationNo?: string; operationType?: string } = {};
  if (changed("Beyanname No")) operation.declarationNo = value("Beyanname No");
  if (changed("İşlem Niteliği")) operation.operationType = value("İşlem Niteliği");

  await patchDeclaration(declarationId, {
    normalizedData: next,
    ...(Object.keys(operation).length > 0 ? { operation } : {}),
  });
}

function applyWeightQuantityList(items: BeyannameLineItem[]): BeyannameLineItem[] {
  return items.map(applyWeightQuantity);
}
