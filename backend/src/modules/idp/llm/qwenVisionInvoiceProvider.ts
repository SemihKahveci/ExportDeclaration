import http from "node:http";
import https from "node:https";
import { env } from "../../../config/env.js";
import {
  InvoiceLlmEvidenceMode,
  InvoiceLlmExtractionDecision,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse,
  type InvoiceLlmPageImage
} from "../domain/invoiceLlmExtraction.types.js";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "./invoiceExtractionSkill.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}


type NaturalFieldEvidence = {
  header?: unknown;
  label?: unknown;
  rawValue?: unknown;
  unit?: unknown;
};

type NaturalGoodsLine = {
  productCode?: unknown;
  description?: unknown;
  hsCode?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
  origin?: unknown;
  evidence?: {
    quantity?: NaturalFieldEvidence;
    unitPrice?: NaturalFieldEvidence;
    lineTotal?: NaturalFieldEvidence;
  };
};

type NaturalCriticalScalarEvidence = {
  label?: unknown;
  rawValue?: unknown;
};

type NaturalInvoice = {
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  seller?: unknown;
  sellerAddress?: unknown;
  sellerCountry?: unknown;
  buyer?: unknown;
  buyerAddress?: unknown;
  buyerCountry?: unknown;
  currency?: unknown;
  totalAmount?: unknown;
  deliveryTerm?: unknown;
  paymentType?: unknown;
  transportMode?: unknown;
  origin?: unknown;
  exitCountry?: unknown;
  arrivalCountry?: unknown;
  destinationCountry?: unknown;
  tradeCountry?: unknown;
  carrier?: unknown;
  departureVehicleId?: unknown;
  borderVehicleId?: unknown;
  vehiclePlate?: unknown;
  containerNo?: unknown;
  billOfLadingNo?: unknown;
  cmrNo?: unknown;
  awbNo?: unknown;
  transportDocumentNo?: unknown;
  exchangeRate?: unknown;
  freight?: unknown;
  insurance?: unknown;
  bankInfo?: unknown;
  packageType?: unknown;
  previousDocumentNo?: unknown;
  circulationDocumentNo?: unknown;
  originDocumentNo?: unknown;
  totalPackage?: unknown;
  grossKg?: unknown;
  netKg?: unknown;
  shipmentWeightEvidence?: {
    grossKg?: NaturalFieldEvidence;
    netKg?: NaturalFieldEvidence;
  };
  criticalScalarEvidence?: {
    invoiceDate?: NaturalCriticalScalarEvidence;
    currency?: NaturalCriticalScalarEvidence;
  };
  goodsLines?: unknown;
};

const GOODS_PREFIX = "goodsLines[].";

function evidenceText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseLocaleNumericEvidence(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  const match = raw.replace(/\u00a0/g, " ").match(/[-+]?\d[\d\s.,]*/);
  if (!match) return undefined;
  let token = match[0]!.replace(/\s+/g, "");
  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    token = token.split(thousands).join("").replace(decimal, ".");
  } else if (comma >= 0 || dot >= 0) {
    const sep = comma >= 0 ? "," : ".";
    const parts = token.split(sep);
    // A single separator followed by exactly three digits is a thousands
    // grouping when the integer side is non-zero and no second grouping exists.
    // Evidence such as 0.700 remains decimal; 12.345 becomes 12345.
    if (parts.length === 2 && parts[0] !== "0" && /^\d{3}$/.test(parts[1] ?? "")) token = parts.join("");
    else if (parts.length > 2 && parts.slice(1).every((part) => /^\d{3}$/.test(part))) token = parts.join("");
    else token = token.replace(sep, ".");
  }
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

function isPackagingHeader(header: string): boolean {
  return /\b(?:koli|package|packages|box|boxes|carton|cartons|pallet|palet|container|containers)\b/i.test(header);
}

function isQuantityHeader(header: string): boolean {
  return /\b(?:miktar|quantity|qty|amount)\b/i.test(header) && !isPackagingHeader(header);
}

function isUnitPriceHeader(header: string): boolean {
  return /(?:birim\s*fiyat|unit\s*price|price\s*\/\s*unit|unit\s*cost)/i.test(header);
}

function isLineTotalHeader(header: string): boolean {
  return /(?:mal\s*hizmet\s*tutar|line\s*total|amount|tutar|total)/i.test(header) && !isQuantityHeader(header);
}

function isWeightLabel(label: string, role: "grossKg" | "netKg"): boolean {
  return role === "grossKg"
    ? /\b(?:brüt|brut|gross)(?:\s+(?:kg|weight|ağırlık|agirlik))?\b/i.test(label)
    : /\b(?:net)(?:\s+(?:kg|weight|ağırlık|agirlik))?\b/i.test(label);
}

/**
 * Foundation 8.25.4: evidence-role binding for goods numerics.
 *
 * When the model supplies explicit row-local evidence, the visible header/raw
 * token is stronger authority than a derived/repaired numeric value. A value
 * whose evidence names a different semantic role is rejected fail-closed.
 * When no structured evidence was supplied we preserve the existing semantic
 * value so documents that do not expose this optional evidence do not regress.
 *
 * This is document-generic: it knows only invoice column roles, never supplier,
 * layout coordinates, invoice identifiers, or expected corpus values.
 */
export function evidenceBoundGoodsNumericValue(
  line: NaturalGoodsLine,
  key: "quantity" | "unitPrice" | "lineTotal"
): string | number | null | undefined {
  const semanticValue = naturalScalar(line[key]);
  const evidence = line.evidence?.[key];
  if (!evidence) return semanticValue;

  const header = evidenceText(evidence.header) ?? evidenceText(evidence.label);
  const rawValue = evidence.rawValue;
  if (!header || rawValue === undefined || rawValue === null) return null;

  const roleOk = key === "quantity"
    ? isQuantityHeader(header)
    : key === "unitPrice"
      ? isUnitPriceHeader(header)
      : isLineTotalHeader(header);
  if (!roleOk) {
    // Wrong-role evidence cannot authorize the field. For quantity, packaging
    // evidence must not fall through to a packaging-equal semantic value either.
    if (key === "quantity" && isPackagingHeader(header)) {
      const rejected = parseLocaleNumericEvidence(rawValue);
      const semanticNumeric = typeof semanticValue === "number"
        ? semanticValue
        : parseLocaleNumericEvidence(semanticValue);
      if (
        semanticNumeric != null &&
        rejected != null &&
        Math.abs(semanticNumeric - rejected) > 1e-9 &&
        commercialQuantityCorroborated(line, semanticNumeric)
      ) {
        return semanticNumeric;
      }
      return null;
    }
    return null;
  }

  return parseLocaleNumericEvidence(rawValue) ?? null;
}

function lineNumeric(line: NaturalGoodsLine, key: "quantity" | "unitPrice" | "lineTotal"): number | undefined {
  const bound = evidenceBoundGoodsNumericValue(
    key === "quantity" ? { ...line, evidence: { ...line.evidence, quantity: undefined } } : line,
    key
  );
  if (typeof bound === "number" && Number.isFinite(bound)) return bound;
  const raw = naturalScalar(line[key]);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return parseLocaleNumericEvidence(raw);
}

function commercialQuantityCorroborated(line: NaturalGoodsLine, quantity: number): boolean {
  const price = lineNumeric(line, "unitPrice");
  const total = lineNumeric(line, "lineTotal");
  if (price == null || total == null || !(price > 0) || !(quantity > 0)) return false;
  const expected = quantity * price;
  const scale = Math.max(1, Math.abs(total));
  return Math.abs(expected - total) <= Math.max(1e-6 * scale, 0.01);
}

function isCleanCommercialQuantity(value: number): boolean {
  if (!Number.isFinite(value) || !(value > 0)) return false;
  const rounded = Math.round(value * 1000) / 1000;
  return Math.abs(value - rounded) <= 1e-9;
}

function isPackagingUnit(unit: unknown): boolean {
  if (typeof unit !== "string" || !unit.trim()) return false;
  return /\b(?:koli|kol[iı]|package|packages|box|boxes|carton|cartons|pallet|palet|ctn|pkg)\b/i.test(unit);
}

function isOriginDeclarationText(text: string): boolean {
  const normalized = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return /(?:mallarimiz|goods|products|ware|waren).{0,40}(?:mense|origin|ursprung)/i.test(normalized)
    || /(?:menseilidir|of\s+\w+\s+origin|country\s+of\s+origin|made\s+in)\b/i.test(normalized);
}

/** Amount-in-words / currency prose is a totals footer, not a goods row. */
export function isAmountInWordsText(text: string): boolean {
  const normalized = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, " ");
  if (!/\b(?:EUR|EURO|USD|GBP|TRY|TL|CENT|CENTS)\b/i.test(normalized)) return false;
  const words = normalized.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (/\b(?:BIN|BİN|YUZ|YÜZ|MILYON|THOUSAND|HUNDRED|MILLION|VE|AND|ONLY)\b/i.test(normalized)) {
    return true;
  }
  // OCR often glues Turkish number-words into one token (…BIRBIN…).
  return words.some((word) => word.length >= 10 && /(?:BIN|BIR|YUZ|THOUSAND|HUNDRED)/i.test(word));
}

/** HS code is the strongest commercial-row catalog signal. */
function hasHsGoodsIdentity(line: NaturalGoodsLine): boolean {
  const hs = naturalScalar(line.hsCode);
  return typeof hs === "string" && hs.trim().length > 0;
}

function hasCatalogGoodsIdentity(line: NaturalGoodsLine): boolean {
  const product = naturalScalar(line.productCode);
  return hasHsGoodsIdentity(line)
    || (typeof product === "string" && product.trim().length > 0);
}

function hasCommercialGoodsIdentity(line: NaturalGoodsLine): boolean {
  const price = lineNumeric(line, "unitPrice");
  const total = lineNumeric(line, "lineTotal");
  return hasCatalogGoodsIdentity(line) || price != null || total != null;
}

/** Footer / legal / package-summary lines are not commercial goods rows. */
export function isNonCommercialGoodsLine(line: NaturalGoodsLine): boolean {
  const description = typeof line.description === "string" ? line.description.trim() : "";
  // Amount-in-words is a totals footer even when Vision invents price/total or a
  // stray reference token as productCode. An HS code is required to keep the row.
  if (description && isAmountInWordsText(description) && !hasHsGoodsIdentity(line)) return true;
  // Origin declarations remain footers without HS/product catalog identity.
  if (!hasCatalogGoodsIdentity(line) && description && isOriginDeclarationText(description)) return true;
  // Package/shipment summary rows: packaging unit, optional count, no commercial money/code.
  if (
    !hasCommercialGoodsIdentity(line)
    && isPackagingUnit(line.unit)
    && lineNumeric(line, "unitPrice") == null
    && lineNumeric(line, "lineTotal") == null
  ) {
    return true;
  }
  return false;
}

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  TURKIYE: "TR", TURKEY: "TR", TR: "TR",
  ESTONYA: "EE", ESTONIA: "EE", EE: "EE",
  POLAND: "PL", POLONYA: "PL", PL: "PL",
  CHINA: "CN", CIN: "CN", CN: "CN",
  GERMANY: "DE", ALMANYA: "DE", DEUTSCHLAND: "DE", DE: "DE",
  FRANCE: "FR", FRANSA: "FR", FR: "FR",
  ITALY: "IT", ITALYA: "IT", ITALIA: "IT", IT: "IT",
  SPAIN: "ES", ISPANYA: "ES", ES: "ES",
  NETHERLANDS: "NL", HOLLANDA: "NL", NL: "NL",
  BELGIUM: "BE", BELCIKA: "BE", BE: "BE",
  AUSTRIA: "AT", AVUSTURYA: "AT", AT: "AT",
  UNITEDKINGDOM: "GB", UK: "GB", ENGLAND: "GB", GB: "GB",
  UNITEDSTATES: "US", USA: "US", US: "US",
  RUSSIA: "RU", RUSYA: "RU", RU: "RU",
  UKRAINE: "UA", UKRAYNA: "UA", UA: "UA",
  ROMANIA: "RO", ROMANYA: "RO", RO: "RO",
  BULGARIA: "BG", BULGARISTAN: "BG", BG: "BG",
  GREECE: "GR", YUNANISTAN: "GR", GR: "GR",
  HUNGARY: "HU", MACARISTAN: "HU", HU: "HU",
  CZECHIA: "CZ", CZECHREPUBLIC: "CZ", CEKYA: "CZ", CZ: "CZ",
  SWEDEN: "SE", ISVEC: "SE", SE: "SE",
  NORWAY: "NO", NORVEC: "NO", NO: "NO",
  DENMARK: "DK", DANIMARKA: "DK", DK: "DK",
  FINLAND: "FI", FINLANDIYA: "FI", FI: "FI",
  SWITZERLAND: "CH", ISVICRE: "CH", CH: "CH",
  INDIA: "IN", HINDISTAN: "IN", IN: "IN",
  JAPAN: "JP", JAPONYA: "JP", JP: "JP",
  KOREA: "KR", SOUTHKOREA: "KR", GUNEYKORE: "KR", KR: "KR",
  UAE: "AE", UNITEDARABEMIRATES: "AE", AE: "AE",
  SAUDIARABIA: "SA", SUUDIARABISTAN: "SA", SA: "SA"
};

/** Normalize unambiguous country tokens to ISO-3166-1 alpha-2. Fail closed otherwise. */
export function canonicalizeVisionCountry(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return COUNTRY_NAME_TO_ISO2[key];
}

const COUNTRY_CANDIDATE_FIELDS = new Set([
  "parties.seller.country",
  "parties.buyer.country",
  "originCountry",
  "exitCountry",
  "arrivalCountry",
  "destinationCountry",
  "tradeCountry"
]);

/** Defense-in-depth: canonicalize country-valued candidates from any extractor. */
export function canonicalizeCountryFieldCandidates(envelope: FieldCandidateEnvelope): FieldCandidateEnvelope {
  const fields: FieldCandidateEnvelope["fields"] = {};
  let rewritten = 0;
  let dropped = 0;
  for (const [field, candidates] of Object.entries(envelope.fields)) {
    const isGoodsOrigin = /^goodsLines\.\d+\.origin$/.test(field);
    if (!COUNTRY_CANDIDATE_FIELDS.has(field) && !isGoodsOrigin) {
      fields[field] = candidates;
      continue;
    }
    const next = [];
    for (const candidate of candidates) {
      if (typeof candidate.value !== "string") {
        next.push(candidate);
        continue;
      }
      const iso = canonicalizeVisionCountry(candidate.value);
      if (!iso) {
        dropped += 1;
        continue;
      }
      if (iso !== candidate.value) rewritten += 1;
      next.push({ ...candidate, value: iso });
    }
    if (next.length) fields[field] = next;
  }
  if (rewritten || dropped) {
    console.info("idp.country.canonicalize_candidates", { rewritten, dropped });
  }
  return { version: "1", fields };
}

function extractOriginFromDeclaration(line: NaturalGoodsLine): string | undefined {
  const fromField = canonicalizeVisionCountry(naturalScalar(line.origin));
  if (fromField) return fromField;
  const description = typeof line.description === "string" ? line.description : "";
  if (!description) return undefined;
  const normalized = description.normalize("NFKD").replace(/[\u0300-\u036f]/g, " ");
  const madeIn = normalized.match(/\b(?:made\s+in|origin|mense|ursprung)\s*[:\-]?\s*([A-Za-z\u00C0-\u017F ]{2,40})/i);
  if (madeIn?.[1]) return canonicalizeVisionCountry(madeIn[1]);
  // "MALLARIMIZ TURK MENSEILIDIR" / "goods are of Turkish origin"
  const adjectival = normalized.match(/\b(?:TURK|TURKISH|POLISH|CHINESE|GERMAN|FRENCH|ITALIAN|SPANISH|DUTCH|HUNGARIAN|INDIAN|JAPANESE|KOREAN)\b/i);
  if (adjectival) {
    const map: Record<string, string> = {
      TURK: "TR", TURKISH: "TR", POLISH: "PL", CHINESE: "CN", GERMAN: "DE",
      FRENCH: "FR", ITALIAN: "IT", SPANISH: "ES", DUTCH: "NL", HUNGARIAN: "HU",
      INDIAN: "IN", JAPANESE: "JP", KOREAN: "KR"
    };
    const iso = map[adjectival[0]!.toUpperCase()];
    if (iso) return iso;
  }
  return undefined;
}

/**
 * Foundation 8.25.5/8.25.6: recover commercial quantity when packaging confused
 * the row — either packaging-role quantity evidence, or a packaging unit with a
 * missing/non-corroborated quantity — and unitPrice + lineTotal already agree on
 * one clean commercial quantity distinct from the packaging count.
 */
export function recoverCommercialQuantityAfterPackagingReject(line: NaturalGoodsLine): NaturalGoodsLine {
  const evidence = line.evidence?.quantity;
  const header = evidenceText(evidence?.header) ?? evidenceText(evidence?.label);
  const packagingEvidence = Boolean(evidence && header && isPackagingHeader(header));
  const packagingUnit = isPackagingUnit(line.unit);
  if (!packagingEvidence && !packagingUnit) return line;

  const nextEvidence = { ...line.evidence };
  if (packagingEvidence) delete nextEvidence.quantity;

  const stripped: NaturalGoodsLine = { ...line, evidence: nextEvidence };
  const packagingRaw = packagingEvidence
    ? parseLocaleNumericEvidence(evidence?.rawValue)
    : lineNumeric(stripped, "quantity");
  const price = lineNumeric(stripped, "unitPrice");
  const total = lineNumeric(stripped, "lineTotal");
  const currentQty = lineNumeric(stripped, "quantity");

  const qtyLooksLikePackaging = currentQty != null
    && packagingRaw != null
    && Math.abs(currentQty - packagingRaw) <= 1e-9;
  const qtyMissing = currentQty == null;
  const qtyFailsCorroboration = currentQty != null
    && price != null
    && total != null
    && !commercialQuantityCorroborated(stripped, currentQty);
  const needsRecovery = qtyMissing || qtyLooksLikePackaging || (packagingUnit && qtyFailsCorroboration);

  if (!needsRecovery) {
    return packagingUnit && currentQty != null && commercialQuantityCorroborated(stripped, currentQty)
      ? { ...stripped, ...(packagingUnit ? { unit: null } : {}) }
      : stripped;
  }

  if (price == null || total == null || !(price > 0)) {
    console.info("idp.vision.qty_recovery", {
      outcome: "cleared_without_recovery",
      reason: "missing_price_total",
      packagingEvidence,
      packagingUnit,
      packagingRaw,
      currentQty,
      qtyMissing,
      qtyLooksLikePackaging,
      qtyFailsCorroboration
    });
    return {
      ...stripped,
      quantity: qtyLooksLikePackaging || packagingEvidence ? null : currentQty ?? null,
      ...(packagingUnit ? { unit: null } : {})
    };
  }

  const recovered = total / price;
  if (
    !isCleanCommercialQuantity(recovered)
    || (packagingRaw != null && Math.abs(recovered - packagingRaw) <= 1e-9)
    || !commercialQuantityCorroborated({ ...stripped, quantity: recovered }, recovered)
  ) {
    console.info("idp.vision.qty_recovery", {
      outcome: "cleared_without_recovery",
      reason: "recovered_not_corroborated",
      packagingEvidence,
      packagingUnit,
      packagingRaw,
      currentQty,
      recovered,
      price,
      total
    });
    return {
      ...stripped,
      quantity: null,
      ...(packagingUnit ? { unit: null } : {})
    };
  }

  console.info("idp.vision.qty_recovery", {
    outcome: "recovered",
    packagingEvidence,
    packagingUnit,
    packagingRaw,
    currentQty,
    recovered,
    price,
    total,
    clearedPackagingUnit: packagingUnit
  });
  return {
    ...stripped,
    quantity: recovered,
    ...(packagingUnit ? { unit: null } : {})
  };
}

/**
 * Drop non-commercial footer/legal rows, recover packaging-confused quantities,
 * and broadcast explicit document-scoped goods origin onto commercial rows that
 * lack row-local origin. Layout/supplier independent.
 */
export function sanitizeNaturalGoodsLines(lines: NaturalGoodsLine[]): NaturalGoodsLine[] {
  const documentOrigins: string[] = [];
  const commercial: NaturalGoodsLine[] = [];
  let recoveredQuantityRows = 0;
  let droppedRows = 0;

  for (const line of lines) {
    if (isNonCommercialGoodsLine(line)) {
      droppedRows += 1;
      const description = typeof line.description === "string" ? line.description.trim() : "";
      const dropReason = description && isOriginDeclarationText(description)
        ? "origin_declaration"
        : description && isAmountInWordsText(description)
          ? "amount_in_words"
          : isPackagingUnit(line.unit)
            ? "packaging_summary"
            : "non_commercial";
      console.info("idp.vision.goods_row_dropped", {
        reason: dropReason,
        unit: typeof line.unit === "string" ? line.unit : null,
        descriptionPreview: description.slice(0, 80) || null
      });
      const origin = extractOriginFromDeclaration(line);
      if (origin) documentOrigins.push(origin);
      continue;
    }
    const beforeQty = lineNumeric(line, "quantity");
    const recovered = recoverCommercialQuantityAfterPackagingReject(line);
    const afterQty = typeof recovered.quantity === "number" ? recovered.quantity : lineNumeric(recovered, "quantity");
    if (beforeQty == null && afterQty != null) recoveredQuantityRows += 1;
    else if (beforeQty != null && afterQty != null && Math.abs(beforeQty - afterQty) > 1e-9) recoveredQuantityRows += 1;
    commercial.push(recovered);
  }

  const uniqueOrigins = [...new Set(documentOrigins)];
  const documentOrigin = uniqueOrigins.length === 1 ? uniqueOrigins[0] : undefined;
  let originBroadcastRows = 0;

  const result = commercial.map((line) => {
    const originRaw = naturalScalar(line.origin);
    const canonical = canonicalizeVisionCountry(originRaw);
    if (canonical) return { ...line, origin: canonical };
    if ((originRaw == null || originRaw === "") && documentOrigin) {
      originBroadcastRows += 1;
      return { ...line, origin: documentOrigin };
    }
    // Free-text non-canonical origin tokens stay fail-closed.
    if (typeof originRaw === "string" && originRaw.trim()) {
      return { ...line, origin: null };
    }
    return line;
  });

  console.info("idp.vision.goods_sanitize", {
    inputRows: lines.length,
    commercialRows: result.length,
    droppedRows,
    recoveredQuantityRows,
    documentOrigin: documentOrigin ?? null,
    originBroadcastRows
  });

  return result;
}

function evidenceBackedRecoveryValue(
  line: NaturalGoodsLine,
  key: "quantity" | "unitPrice" | "lineTotal"
): number | null | undefined {
  const value = evidenceBoundGoodsNumericValue(line, key);
  return typeof value === "number" ? value : null;
}

function naturalScalar(value: unknown): string | number | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

/**
 * Qwen Vision occasionally drops one leading zero from the 9-digit sequence
 * portion of a Turkish-style 16-character invoice identifier. Repair only the
 * narrow, structurally unambiguous 15-character shape (AAA + YYYY + 8 digits).
 * Arbitrary/foreign invoice identifiers are returned untouched.
 */

export function canonicalizeVisionHsCode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const cleaned = trimmed.replace(/^\s*(?:GT[İI]P|HS(?:N|\s*CODE)?|TARIFF(?:\s*CODE)?)\s*[:#-]?\s*/i, "").trim();
  return cleaned || value;
}

export function sanitizeVisionPartyAddress(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // A bare country/city token is not a postal address. Keep fail-closed rather
  // than projecting destination/country text into the party-address field.
  const words = trimmed.split(/\s+/).filter(Boolean);
  const hasAddressShape = /\d/.test(trimmed) || /[,;/]/.test(trimmed) ||
    /\b(?:STREET|ST\.?|ROAD|RD\.?|AVENUE|AVE\.?|MAH(?:ALLE)?|SOKAK|CAD(?:DE)?|NO\.?|BUILDING|BLDG|FLOOR|KAT|DISTRICT|DISTRIKT|STRASSE|STR\.?)\b/i.test(trimmed);
  return words.length >= 2 || hasAddressShape ? trimmed : undefined;
}

export function sanitizeVisionPaymentType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Customs/tax/reference-value phrases are not payment terms even when printed
  // below a combined "Delivery and Payment" heading.
  if (/\b(?:DUTY\s*DRAWBACK|RODTEP|EPCG|IGST|VAT|KDV|TAX\s*EXEMPT|ZOLLREFERENZWERT|CUSTOMS\s*REFERENCE\s*VALUE)\b/i.test(trimmed)) return undefined;
  // Combined delivery/payment cells such as "DAP-30 DAYS" contain two semantic
  // roles. Keep only the payment tail; the Incoterm is resolved independently.
  const combined = trimmed.match(/^(?:EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\s*[-/|]\s*(.+)$/i);
  if (combined?.[1]?.trim()) return combined[1].trim();
  // A monetary amount is not a payment method/term (for example "0,00 EUR").
  if (/^[-+]?\d[\d.,]*\s*(?:TRY|TL|EUR|USD|GBP|CHF|JPY|CNY|RUB|AED|SAR)$/i.test(trimmed)) return undefined;
  // Amount-in-words lines (for example "Seventeen Thousand Five Hundred USD")
  // are commercial totals, not payment terms. Reject currency-ended prose unless
  // it also contains explicit payment semantics.
  if (/\b(?:TRY|TL|EUR|EURO|USD|GBP|CHF|JPY|CNY|RUB|AED|SAR)\s*$/i.test(trimmed) &&
      !/\b(?:PAYMENT|ODEME|PESIN|MUKABILI|ADVANCE|CASH|ACCOUNT|CREDIT|DAYS?)\b/i.test(trimmed) &&
      trimmed.split(/\s+/).length >= 3) return undefined;
  return trimmed;
}

export function sanitizeVisionBankInfo(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Bank information needs bank/account semantics. Monetary totals/charges are
  // not bank evidence even if the model projects them into bankInfo.
  if (/^[-+]?\d[\d.,]*\s*(?:TRY|TL|EUR|USD|GBP|CHF|JPY|CNY|RUB|AED|SAR)$/i.test(trimmed)) return undefined;
  if (!/\b(?:BANKA|BANK|IBAN|SWIFT|BIC|ACCOUNT|HESAP)\b/i.test(trimmed)) return undefined;
  return trimmed;
}

export function sanitizeVisionCarrier(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Transport modes are not carrier identities.
  if (/^(?:AIR|AIRFREIGHT|VESSEL|SEA|ROAD|TRUCK|KARAYOLU|HAVAYOLU|DENIZYOLU|DEMIRYOLU)$/i.test(trimmed.replace(/\s+/g, ""))) return undefined;
  return trimmed;
}

export function canonicalizeVisionInvoiceNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Za-z0-9]{3})(20\d{2})(\d{8})$/);
  if (!match) return value;
  return `${match[1]}${match[2]}0${match[3]}`;
}


function normalizeEvidenceDate(raw: string): string | undefined {
  const token = raw.trim();
  let match = token.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
  match = token.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (match) return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  return undefined;
}

function normalizeEvidenceCurrency(raw: string): string | undefined {
  const token = raw.trim().toUpperCase();
  if (token === "TL") return "TRY";
  if (/^[A-Z]{3}$/.test(token)) return token;
  return undefined;
}

export function criticalScalarEvidenceSupportsValue(
  parsed: NaturalInvoice,
  field: "invoiceDate" | "currency",
  value: unknown
): boolean {
  const evidence = parsed.criticalScalarEvidence?.[field];
  if (!evidence || typeof evidence !== "object") return false;
  const label = typeof evidence.label === "string" ? evidence.label.trim() : "";
  const rawValue = typeof evidence.rawValue === "string" ? evidence.rawValue.trim() : "";
  if (!label || !rawValue || typeof value !== "string") return false;
  if (field === "invoiceDate") return normalizeEvidenceDate(rawValue) === value.trim();
  return normalizeEvidenceCurrency(rawValue) === value.trim().toUpperCase();
}

export function criticalScalarEvidenceQuote(parsed: NaturalInvoice, field: "invoiceDate" | "currency"): string | undefined {
  const evidence = parsed.criticalScalarEvidence?.[field];
  if (!evidence || typeof evidence !== "object") return undefined;
  const label = typeof evidence.label === "string" ? evidence.label.trim() : "";
  const rawValue = typeof evidence.rawValue === "string" ? evidence.rawValue.trim() : "";
  if (!label || !rawValue) return undefined;
  return `${label}: ${rawValue}`;
}

export function adaptNaturalInvoiceResponse(
  parsed: NaturalInvoice,
  request: InvoiceLlmExtractionRequest,
  pageImages: InvoiceLlmPageImage[]
): Omit<InvoiceLlmExtractionResponse, "model" | "provider"> {
  const goodsLines: NaturalGoodsLine[] = sanitizeNaturalGoodsLines(
    Array.isArray(parsed.goodsLines)
      ? parsed.goodsLines.filter((line): line is NaturalGoodsLine => Boolean(line) && typeof line === "object" && !Array.isArray(line))
      : []
  );

  const pageNumber = pageImages.length === 1 ? pageImages[0]!.pageNumber : undefined;
  const fields: InvoiceLlmExtractionResponse["fields"] = [];

  for (const requestedField of request.requestedFields) {
    let value: unknown;
    if (requestedField.startsWith(GOODS_PREFIX)) {
      const key = requestedField.slice(GOODS_PREFIX.length) as keyof NaturalGoodsLine;
      const evidenceRecovery = request.documentId.endsWith(":goods-numeric-semantic-recovery");
      value = goodsLines.map((line) => {
        if (key === "quantity" || key === "unitPrice" || key === "lineTotal") {
          // Evidence-role authority applies on the primary semantic pass too.
          // Recovery uses the same boundary, so the two paths cannot disagree.
          return evidenceRecovery
            ? evidenceBackedRecoveryValue(line, key) ?? null
            : evidenceBoundGoodsNumericValue(line, key) ?? null;
        }
        const raw = naturalScalar(line[key]);
        if (key === "hsCode") return canonicalizeVisionHsCode(raw) ?? null;
        if (key === "origin") return canonicalizeVisionCountry(raw) ?? null;
        if (key === "productCode") {
          const hs = canonicalizeVisionHsCode(naturalScalar(line.hsCode));
          const product = raw;
          if (typeof product === "string" && typeof hs === "string" && product.trim() === hs.trim()) return null;
        }
        return raw ?? null;
      });
      if ((value as unknown[]).every((item) => item === null)) continue;
    } else {
      value = naturalScalar(parsed[requestedField as keyof NaturalInvoice]);
      if ((request.documentId.endsWith(":goods-numeric-semantic-recovery") || request.documentId.endsWith(":shipment-weight-evidence-recovery")) && (requestedField === "grossKg" || requestedField === "netKg")) {
        const evidence = parsed.shipmentWeightEvidence?.[requestedField];
        const label = evidenceText(evidence?.label) ?? evidenceText(evidence?.header);
        value = label && isWeightLabel(label, requestedField) ? parseLocaleNumericEvidence(evidence?.rawValue) : undefined;
      }
      if (requestedField === "invoiceNumber") value = canonicalizeVisionInvoiceNumber(value);
      if (
        requestedField === "buyerCountry"
        || requestedField === "sellerCountry"
        || requestedField === "origin"
        || requestedField === "exitCountry"
        || requestedField === "arrivalCountry"
        || requestedField === "destinationCountry"
        || requestedField === "tradeCountry"
      ) {
        value = canonicalizeVisionCountry(value) ?? undefined;
      }
      if (requestedField === "sellerAddress" || requestedField === "buyerAddress") value = sanitizeVisionPartyAddress(value);
      if (requestedField === "paymentType") value = sanitizeVisionPaymentType(value);
      if (requestedField === "bankInfo") value = sanitizeVisionBankInfo(value);
      if (requestedField === "carrier") value = sanitizeVisionCarrier(value);
      if (requestedField === "totalPackage" && typeof value === "number") {
        const gross = naturalScalar(parsed.grossKg);
        const net = naturalScalar(parsed.netKg);
        if ((typeof gross === "number" && value === gross) || (typeof net === "number" && value === net)) value = undefined;
      }
      if (value === null || value === undefined) continue;
      if ((requestedField === "invoiceDate" || requestedField === "currency") && (!criticalScalarEvidenceQuote(parsed, requestedField) || !criticalScalarEvidenceSupportsValue(parsed, requestedField, value))) continue;
    }

    const quote = requestedField === "invoiceDate" || requestedField === "currency"
      ? criticalScalarEvidenceQuote(parsed, requestedField)
      : undefined;
    const evidence = pageNumber
      ? [{ pageNumber, source: "PAGE_IMAGE" as const, ...(quote ? { quote } : {}) }]
      : [];
    fields.push({
      field: requestedField,
      value: value as never,
      confidence: 1,
      evidence
    });
  }

  return {
    version: "1",
    decision: fields.length === request.requestedFields.length
      ? InvoiceLlmExtractionDecision.EXTRACTED
      : fields.length > 0
        ? InvoiceLlmExtractionDecision.PARTIAL
        : InvoiceLlmExtractionDecision.REVIEW_REQUIRED,
    fields,
    issues: []
  };
}

/** Re-run current natural-invoice guards over a persisted raw model payload. */
export function parseVisionRawModelResponse(
  content: string,
  request: InvoiceLlmExtractionRequest,
  pageImages: InvoiceLlmPageImage[],
  diagnostics?: { doneReason?: string; done?: boolean; evalCount?: number }
): Omit<InvoiceLlmExtractionResponse, "model" | "provider"> {
  return parseResponse(content, request, pageImages, diagnostics);
}

function parseResponse(
  content: string,
  request: InvoiceLlmExtractionRequest,
  pageImages: InvoiceLlmPageImage[],
  diagnostics?: { doneReason?: string; done?: boolean; evalCount?: number }
): Omit<InvoiceLlmExtractionResponse, "model" | "provider"> {
  const stripped = stripFence(content);
  let parsed: Partial<InvoiceLlmExtractionResponse>;
  try {
    parsed = JSON.parse(stripped) as Partial<InvoiceLlmExtractionResponse>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const likelyTruncated = diagnostics?.doneReason === "length" || diagnostics?.done === false || !/[}\]]\s*$/.test(stripped);
    throw new Error(
      `Invoice vision LLM malformed JSON (transport=ollama-native, done=${diagnostics?.done ?? "unknown"}, done_reason=${diagnostics?.doneReason ?? "unknown"}, contentBytes=${Buffer.byteLength(content, "utf8")}, evalCount=${diagnostics?.evalCount ?? "unknown"}, likelyTruncated=${likelyTruncated}): ${message}`
    );
  }
  // Product E2E 1.3.7: the vision model speaks a simple natural invoice
  // JSON shape. The provider owns the deterministic conversion into the
  // strict internal FieldCandidate-style response contract.
  if (!Array.isArray((parsed as { fields?: unknown }).fields)) {
    return adaptNaturalInvoiceResponse(parsed as unknown as NaturalInvoice, request, pageImages);
  }

  const rawVersion = (parsed as { version?: unknown }).version;
  if (rawVersion !== "1" && rawVersion !== 1) throw new Error("Invoice vision LLM response version geçersiz.");
  if (![InvoiceLlmExtractionDecision.EXTRACTED, InvoiceLlmExtractionDecision.PARTIAL, InvoiceLlmExtractionDecision.REVIEW_REQUIRED].includes(parsed.decision as never)) {
    throw new Error("Invoice vision LLM response decision geçersiz.");
  }
  if (!Array.isArray(parsed.fields) || !Array.isArray(parsed.issues)) throw new Error("Invoice vision LLM response contract eksik.");

  const allowedFields = new Set(request.requestedFields);
  const imagePages = new Set(pageImages.map((image) => image.pageNumber));
  const seenFields = new Set<string>();
  const normalizedFields = parsed.fields.map((field) => {
    if (!field || typeof field.field !== "string" || !allowedFields.has(field.field)) throw new Error(`Invoice vision LLM beklenmeyen field döndürdü: ${field?.field ?? "<empty>"}`);
    if (seenFields.has(field.field)) throw new Error(`Invoice vision LLM duplicate field döndürdü: ${field.field}`);
    seenFields.add(field.field);
    if (field.field.includes("goodsLines[]") && !Array.isArray(field.value)) throw new Error(`Invoice vision LLM goodsLines[] field array olmalı: ${field.field}`);
    if (!field.field.includes("goodsLines[]") && Array.isArray(field.value)) throw new Error(`Invoice vision LLM document field scalar olmalı: ${field.field}`);
    if (typeof field.confidence !== "number" || field.confidence < 0 || field.confidence > 1) throw new Error(`Invoice vision LLM confidence geçersiz: ${field.field}`);

    const rawEvidence = Array.isArray(field.evidence) ? field.evidence : [];
    const normalizedEvidence = rawEvidence.map((evidence) => {
      if (!evidence || typeof evidence !== "object") throw new Error(`Invoice vision LLM evidence geçersiz: ${field.field}`);
      if (!["NATIVE_TEXT", "OCR", "PAGE_IMAGE", "VERIFIED_KNOWLEDGE"].includes(evidence.source)) throw new Error(`Invoice vision LLM evidence source geçersiz: ${field.field}`);
      if (!Number.isInteger(evidence.pageNumber) || evidence.pageNumber < 1) throw new Error(`Invoice vision LLM pageNumber geçersiz: ${field.field}`);
      return evidence;
    });

    if (request.evidenceMode === InvoiceLlmEvidenceMode.PAGE_IMAGE) {
      // PAGE_IMAGE provenance is transport-owned, not model-owned. The provider
      // knows exactly which rendered pages were supplied. With a single image
      // it can safely normalize missing/wrong source/page metadata. For a
      // multi-page request the model must still identify a supplied page so we
      // never fabricate ambiguous provenance.
      if (pageImages.length === 1) {
        const pageNumber = pageImages[0]!.pageNumber;
        const quote = rawEvidence.find((e) => e && typeof e === "object" && typeof e.quote === "string" && e.quote.trim())?.quote;
        return {
          ...field,
          evidence: [{ pageNumber, source: "PAGE_IMAGE" as const, ...(quote ? { quote } : {}) }]
        };
      }

      const pageImageEvidence = normalizedEvidence
        .filter((evidence) => evidence.source === "PAGE_IMAGE" && imagePages.has(evidence.pageNumber));
      if (pageImageEvidence.length === 0) throw new Error(`PAGE_IMAGE extraction multi-page evidence belirsiz: ${field.field}`);
      return { ...field, evidence: pageImageEvidence };
    }

    if (normalizedEvidence.length === 0) throw new Error(`Invoice vision LLM evidence eksik: ${field.field}`);
    for (const evidence of normalizedEvidence) {
      if (evidence.source === "PAGE_IMAGE" && !imagePages.has(evidence.pageNumber)) throw new Error(`Invoice vision LLM render edilmemiş sayfayı evidence gösterdi: ${field.field}`);
    }
    return { ...field, evidence: normalizedEvidence };
  });

  return {
    version: "1",
    decision: parsed.decision!,
    fields: normalizedFields,
    issues: parsed.issues as Array<{ code: string; message: string }>
  };
}


async function postJsonForLongInference(
  urlValue: string,
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<{ status: number; text: string }> {
  const url = new URL(urlValue);
  const transport = url.protocol === "https:" ? https : http;
  const payload = JSON.stringify(body);

  return await new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-length": Buffer.byteLength(payload).toString()
      },
      signal
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end(payload);
  });
}

function ollamaBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "").replace(/\/v1$/, "");
}

function ollamaImage(image: InvoiceLlmPageImage): string {
  return image.bytes.toString("base64");
}

/**
 * Ollama-native multimodal invoice extractor for a local vision-capable
 * Qwen runtime. The native /api/chat transport is intentional: it exposes
 * image inputs, structured JSON mode and thinking control directly. This provider extracts candidates/evidence only; it has no
 * normalized-data write path.
 */
let activeVisionInferences = 0;
const visionWaiters: Array<() => void> = [];

export async function acquireVisionSlot(): Promise<{ queueWaitMs: number; release: () => void }> {
  const queuedAt = Date.now();
  if (activeVisionInferences < env.llmVisionConcurrency) {
    activeVisionInferences += 1;
  } else {
    // The releasing caller transfers its occupied slot directly to this waiter.
    // This avoids a race where a newly arriving request could jump the queue.
    await new Promise<void>((resolve) => visionWaiters.push(resolve));
  }
  let released = false;
  return {
    queueWaitMs: Date.now() - queuedAt,
    release: () => {
      if (released) return;
      released = true;
      const next = visionWaiters.shift();
      if (next) next();
      else activeVisionInferences = Math.max(0, activeVisionInferences - 1);
    }
  };
}

export class QwenVisionInvoiceProvider implements InvoiceLlmExtractionProvider {
  readonly name = "qwen-ollama-vision";

  async extractInvoice(request: InvoiceLlmExtractionRequest, pageImages: InvoiceLlmPageImage[] = []): Promise<InvoiceLlmExtractionResponse> {
    if (!env.llmEnabled) throw new Error("LLM_ENABLED=false; vision extraction çağrısı engellendi.");
    if (!env.llmVisionEnabled) throw new Error("LLM_VISION_ENABLED=false; PAGE_IMAGE extraction çağrısı engellendi.");
    if (!env.llmBaseUrl) throw new Error("LLM_BASE_URL yapılandırılmamış.");
    if (!env.llmVisionModel.trim()) throw new Error("LLM_VISION_MODEL yapılandırılmamış.");

    const needsImages = request.evidenceMode === InvoiceLlmEvidenceMode.PAGE_IMAGE || request.evidenceMode === InvoiceLlmEvidenceMode.HYBRID;
    if (needsImages && pageImages.length === 0) throw new Error("Vision extraction için page image gerekli.");
    if (pageImages.length > env.llmVisionMaxPages) throw new Error(`Vision extraction page budget aşıldı (${pageImages.length}/${env.llmVisionMaxPages}).`);
    for (const image of pageImages) {
      if (image.bytes.length <= 0 || image.bytes.length > env.llmVisionMaxImageBytes) throw new Error(`Vision image byte budget geçersiz (page=${image.pageNumber}).`);
    }

    const slot = await acquireVisionSlot();
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeoutMs = Math.min(env.llmVisionTimeoutMs, env.llmVisionAttemptTimeoutMs);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    console.info("idp.qwen_vision.started", {
      documentId: request.documentId,
      model: env.llmVisionModel,
      pageNumbers: pageImages.map((image) => image.pageNumber),
      queueWaitMs: slot.queueWaitMs,
      activeVisionInferences,
      concurrencyLimit: env.llmVisionConcurrency,
      timeoutMs,
      numCtx: env.llmVisionNumCtx,
      numPredict: env.llmVisionNumPredict
    });
    try {
      const userText = JSON.stringify({
        version: request.version,
        documentId: request.documentId,
        evidenceMode: request.evidenceMode,
        requestedFields: request.requestedFields,
        instruction: [
          "Return the simple invoice JSON shape and populate only data corresponding to requestedFields.",
          request.focusInstruction?.trim() || null
        ].filter(Boolean).join(" "),
        nativeText: request.nativeText,
        ocrText: request.ocrText,
        verifiedKnowledge: request.verifiedKnowledge,
        pageImages: pageImages.map((image) => ({ pageNumber: image.pageNumber, source: "PAGE_IMAGE" }))
      });
      const response = await postJsonForLongInference(
        `${ollamaBaseUrl(env.llmBaseUrl)}/api/chat`,
        {
          model: env.llmVisionModel,
          stream: false,
          think: false,
          format: "json",
          options: {
            temperature: 0,
            // 8.25.1: Ollama counts image/prompt tokens and generated output against
            // num_ctx. The portable skill context made the former 8k context too
            // small on some invoices even though num_predict was 4k. Keep both
            // budgets explicit/configurable and reserve substantially more context.
            num_ctx: env.llmVisionNumCtx,
            num_predict: env.llmVisionNumPredict
          },
          messages: [
            { role: "system", content: INVOICE_EXTRACTION_SYSTEM_PROMPT },
            {
              role: "user",
              content: userText,
              ...(pageImages.length > 0 ? { images: pageImages.map(ollamaImage) } : {})
            }
          ]
        },
        { "content-type": "application/json", ...(env.llmApiKey ? { authorization: `Bearer ${env.llmApiKey}` } : {}) },
        controller.signal
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Qwen vision HTTP ${response.status}: ${response.text.slice(0, 500)}`);
      }
      const payload = JSON.parse(response.text) as {
        message?: { content?: string; thinking?: string };
        done?: boolean;
        done_reason?: string;
        eval_count?: number;
      };
      const content = payload.message?.content?.trim();
      if (!content) {
        const thinkingBytes = Buffer.byteLength(payload.message?.thinking ?? "", "utf8");
        throw new Error(`Qwen vision response content boş (transport=ollama-native, done_reason=${payload.done_reason ?? "unknown"}, thinkingBytes=${thinkingBytes}).`);
      }
      if (payload.done_reason === "length") {
        throw new Error(
          `LLM_VISION_OUTPUT_TRUNCATED: structured response exhausted context/output budget ` +
          `(num_ctx=${env.llmVisionNumCtx}, num_predict=${env.llmVisionNumPredict}, ` +
          `contentBytes=${Buffer.byteLength(content, "utf8")}, evalCount=${payload.eval_count ?? "unknown"})`
        );
      }
      const parsedResponse = parseResponse(content, request, pageImages, {
        done: payload.done,
        doneReason: payload.done_reason,
        evalCount: payload.eval_count
      });
      console.info("idp.qwen_vision.completed", {
        documentId: request.documentId,
        model: env.llmVisionModel,
        pageNumbers: pageImages.map((image) => image.pageNumber),
        queueWaitMs: slot.queueWaitMs,
        elapsedMs: Date.now() - startedAt,
        decision: parsedResponse.decision,
        fieldCount: parsedResponse.fields.length
      });
      return {
        ...parsedResponse,
        model: env.llmVisionModel,
        provider: this.name,
        extractionArtifact: {
          version: "1",
          provider: this.name,
          model: env.llmVisionModel,
          skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
          documentId: request.documentId,
          evidenceMode: request.evidenceMode,
          requestedFields: [...request.requestedFields],
          pageNumbers: pageImages.map((image) => image.pageNumber),
          rawModelResponse: content,
          parsedSemanticResponse: {
            version: parsedResponse.version,
            decision: parsedResponse.decision,
            fields: parsedResponse.fields,
            issues: parsedResponse.issues
          }
        }
      };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const name = error instanceof Error ? error.name.toLowerCase() : "";
      const message = error instanceof Error ? error.message : String(error);
      const normalized = message.toLowerCase();
      const aborted = name === "aborterror" || normalized.includes("aborted") || normalized.includes("canceled") || normalized.includes("cancelled");
      if (aborted) {
        const pages = pageImages.map((image) => image.pageNumber).join(",") || "none";
        throw new Error(`Qwen vision timeout/abort (model=${env.llmVisionModel}, pages=${pages}, timeoutMs=${timeoutMs}, elapsedMs=${elapsedMs}): ${message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      slot.release();
    }
  }
}
