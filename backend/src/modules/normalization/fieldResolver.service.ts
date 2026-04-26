import { getByPath } from "../../common/utils/getByPath.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import type { ExtractedSource, FieldResolution, GoodsLine, NormalizedDeclaration } from "./normalizedDeclaration.types.js";
import { goodsLineSourcePriority, sourcePriorityRules } from "./sourcePriority.rules.js";

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function resolveField(path: string, extractedSources: ExtractedSource[]): FieldResolution {
  const priorities = sourcePriorityRules[path] ?? [];

  for (const sourceType of priorities) {
    const source = extractedSources.find((x) => x.type === sourceType);
    const value = getByPath(source?.data, path);

    if (!isEmpty(value)) {
      return { value: value as unknown, sourceType };
    }
  }

  return { value: null, sourceType: null };
}

function setPartyNested(
  target: NormalizedDeclaration["parties"],
  prefix: "seller" | "buyer" | "notify",
  sources: ExtractedSource[],
  trace: Record<string, { value: unknown; source: DocumentTypeValue | null }>
): void {
  const base = `parties.${prefix}`;
  for (const sub of ["name", "taxNo", "address", "country"] as const) {
    const path = `${base}.${sub}`;
    const { value, sourceType } = resolveField(path, sources);
    if (!isEmpty(value)) {
      const party = (target[prefix] ??= {});
      (party as Record<string, unknown>)[sub] = value;
      trace[path] = { value, source: sourceType };
    }
  }
}

function resolveGoodsLines(sources: ExtractedSource[]): { lines: GoodsLine[]; source: DocumentTypeValue | null } {
  for (const sourceType of goodsLineSourcePriority) {
    const source = sources.find((x) => x.type === sourceType);
    const raw = source?.data?.goodsLines;
    if (Array.isArray(raw) && raw.length > 0) {
      const lines = raw.map((row, idx) => normalizeGoodsLine(row as Record<string, unknown>, idx + 1));
      return { lines, source: sourceType };
    }
  }
  return { lines: [], source: null };
}

function normalizeGoodsLine(row: Record<string, unknown>, fallbackLineNo: number): GoodsLine {
  const lineNo = Number(row.lineNo ?? row.LineNo ?? fallbackLineNo) || fallbackLineNo;
  return {
    lineNo,
    hsCode: stringOrUndef(row.hsCode ?? row.HSCode),
    description: stringOrUndef(row.description ?? row.Description),
    quantity: numberOrUndef(row.quantity ?? row.Quantity),
    unit: stringOrUndef(row.unit ?? row.Unit),
    unitPrice: numberOrUndef(row.unitPrice ?? row.UnitPrice),
    lineTotal: numberOrUndef(row.lineTotal ?? row.LineTotal),
    origin: stringOrUndef(row.origin ?? row.Origin),
    grossKg: numberOrUndef(row.grossKg ?? row.GrossKg),
    netKg: numberOrUndef(row.netKg ?? row.NetKg)
  };
}

function stringOrUndef(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function numberOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function assignScalar(
  target: Record<string, unknown>,
  path: string,
  sources: ExtractedSource[],
  trace: Record<string, { value: unknown; source: DocumentTypeValue | null }>
): void {
  const { value, sourceType } = resolveField(path, sources);
  if (!isEmpty(value)) {
    const parts = path.split(".");
    let cur: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      cur[p] ??= {};
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]!] = value;
    trace[path] = { value, source: sourceType };
  }
}

export function buildNormalizedDeclaration(sources: ExtractedSource[]): {
  normalized: NormalizedDeclaration;
  sourceTrace: Record<string, { value: unknown; source: DocumentTypeValue | null }>;
} {
  const trace: Record<string, { value: unknown; source: DocumentTypeValue | null }> = {};
  const normalized: NormalizedDeclaration = {
    header: {},
    parties: {},
    trade: {},
    transport: {},
    packageInfo: {},
    goodsLines: []
  };

  const flatTarget = normalized as unknown as Record<string, unknown>;

  for (const path of [
    "header.invoiceNo",
    "header.invoiceDate",
    "header.currency",
    "header.totalAmount",
    "trade.deliveryTerm",
    "trade.paymentType",
    "trade.origin",
    "transport.mode",
    "transport.carrier",
    "transport.departureCustoms",
    "transport.containerNo",
    "transport.billOfLadingNo",
    "packageInfo.totalPackage",
    "packageInfo.packageType",
    "packageInfo.grossKg",
    "packageInfo.netKg"
  ]) {
    assignScalar(flatTarget, path, sources, trace);
  }

  setPartyNested(normalized.parties, "seller", sources, trace);
  setPartyNested(normalized.parties, "buyer", sources, trace);
  setPartyNested(normalized.parties, "notify", sources, trace);

  const { lines, source } = resolveGoodsLines(sources);
  normalized.goodsLines = lines;
  if (lines.length > 0) {
    trace["goodsLines"] = { value: lines, source };
  }

  const evrim = sources.find((s) => s.data.evrimHeader)?.data.evrimHeader;
  if (evrim && typeof evrim === "object") {
    normalized.evrimHeader = evrim as NormalizedDeclaration["evrimHeader"];
  }

  return { normalized, sourceTrace: trace };
}
