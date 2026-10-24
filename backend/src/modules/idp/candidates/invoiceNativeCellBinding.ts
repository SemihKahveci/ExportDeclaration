import type { CanonicalBBox, CanonicalDocument, CanonicalPage, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import { canonicalizeVisionCountry } from "../llm/qwenVisionInvoiceProvider.js";

export const NATIVE_CELL_EXTRACTOR = "invoice-native-cell-binding-v1";

const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;
const ROW_Y = 0.02;
const HEADER_BAND_Y = 0.055;

type GoodsRole =
  | "productCode"
  | "description"
  | "quantity"
  | "packaging"
  | "unit"
  | "unitPrice"
  | "lineTotal"
  | "hsCode"
  | "origin";

type BoundRole = Exclude<GoodsRole, "packaging">;

const HEADER_TOKEN: Record<string, GoodsRole> = {
  QTY: "quantity",
  QUANTITY: "quantity",
  MIKTAR: "quantity",
  MENGE: "quantity",
  ADET: "quantity",
  PCS: "quantity",
  PIECES: "quantity",
  KOLI: "packaging",
  KOLILER: "packaging",
  PALET: "packaging",
  PALLET: "packaging",
  PALLETS: "packaging",
  CARTON: "packaging",
  CARTONS: "packaging",
  PACKAGE: "packaging",
  PACKAGES: "packaging",
  KAP: "packaging",
  CTN: "packaging",
  COLLI: "packaging",
  BIRIM: "unit",
  UNIT: "unit",
  EINHEIT: "unit",
  FIYAT: "unitPrice",
  PRICE: "unitPrice",
  PREIS: "unitPrice",
  TUTAR: "lineTotal",
  AMOUNT: "lineTotal",
  BETRAG: "lineTotal",
  TOTAL: "lineTotal",
  TOPLAM: "lineTotal",
  GTIP: "hsCode",
  HS: "hsCode",
  HSN: "hsCode",
  MENSE: "origin",
  ORIGIN: "origin",
  URSPRUNG: "origin",
  ACIKLAMA: "description",
  DESCRIPTION: "description",
  TANIM: "description",
  KOD: "productCode",
  KODU: "productCode",
  CODE: "productCode",
  SKU: "productCode",
  ARTICLE: "productCode"
};

interface Column {
  role: GoodsRole;
  left: number;
  right: number;
}

interface NativeRow {
  pageNumber: number;
  y: number;
  words: CanonicalWord[];
  code: string;
}

interface PageTable {
  columns: Column[];
  rows: NativeRow[];
}

export interface InsertedGoodsRow {
  insertAt: number;
  fields: FieldCandidateEnvelope["fields"];
}

export interface NativeCellBinding {
  replacements: FieldCandidateEnvelope;
  conflicts: FieldCandidateEnvelope;
  droppedRows: number[];
  insertedRows: InsertedGoodsRow[];
  skipped: Array<{ pageNumber: number; reason: string }>;
}

function originIso(text: string): string | undefined {
  const trimmed = text.trim();
  // A bare two-letter fragment such as EA is part of a product name.
  // U.K still resolves, because the punctuation keeps it out of that shape.
  // A rating such as 30mA still contains a digit, so it is not a country.
  if (/^[A-Za-z]{2}$/.test(trimmed) || /\d/.test(trimmed)) return undefined;
  const exact = canonicalizeVisionCountry(trimmed);
  if (exact) return exact;
  const letters = fold(trimmed).replace(/[^A-Z]/g, "");
  if (letters.length < 6) return undefined;
  const hits = new Set<string>();
  for (let index = 0; index < letters.length - 1; index += 1) {
    if (letters[index] === letters[index + 1]) continue;
    const swapped = `${letters.slice(0, index)}${letters[index + 1]}${letters[index]}${letters.slice(index + 2)}`;
    const iso = canonicalizeVisionCountry(swapped);
    if (iso) hits.add(iso);
  }
  return hits.size === 1 ? [...hits][0] : undefined;
}

function fold(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function compact(text: string): string {
  return fold(text).replace(/[^A-Z0-9]/g, "");
}

function yOf(word: CanonicalWord): number {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function xOf(word: CanonicalWord): number {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}

function unionBox(words: CanonicalWord[]): CanonicalBBox {
  return {
    x0: Math.min(...words.map((word) => word.bbox.x0)),
    y0: Math.min(...words.map((word) => word.bbox.y0)),
    x1: Math.max(...words.map((word) => word.bbox.x1)),
    y1: Math.max(...words.map((word) => word.bbox.y1))
  };
}

function headerRole(text: string): GoodsRole | undefined {
  const token = fold(text).replace(/ /g, "");
  if (!token) return undefined;
  if (HEADER_TOKEN[token]) return HEADER_TOKEN[token];
  // Turkish headers take a possessive ending: Açıklaması, Tutarı, Miktarı.
  const stem = Object.keys(HEADER_TOKEN)
    .filter((key) => key.length >= 5 && token.startsWith(key) && token.length <= key.length + 3)
    .sort((left, right) => right.length - left.length)[0];
  return stem ? HEADER_TOKEN[stem] : undefined;
}

function clusterRows(words: CanonicalWord[]): CanonicalWord[][] {
  const sorted = words.slice().sort((left, right) => yOf(left) - yOf(right) || xOf(left) - xOf(right));
  const clusters: CanonicalWord[][] = [];
  for (const word of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || yOf(word) - yOf(current[0]!) > ROW_Y) clusters.push([word]);
    else current.push(word);
  }
  return clusters;
}

function tokenOf(word: CanonicalWord): string {
  return fold(word.text).replace(/ /g, "");
}

function nearToken(words: CanonicalWord[], word: CanonicalWord, token: string): boolean {
  return words.some((other) => other !== word && tokenOf(other) === token && Math.abs(xOf(other) - xOf(word)) <= 0.06);
}

function looksLikeGoodsCode(text: string): boolean {
  const token = compact(text);
  return token.length >= 6 && /[A-Z]/.test(token) && /\d/.test(token);
}

function isRowCode(text: string): boolean {
  const token = compact(text);
  return looksLikeGoodsCode(token) || (token.length >= 4 && /\d/.test(token) && /[A-Z]/.test(token));
}

function headerAnchors(words: CanonicalWord[]): Array<{ role: GoodsRole; x: number; x0: number; x1: number }> | undefined {
  const anchors: Array<{ role: GoodsRole; x: number; x0: number; x1: number }> = [];
  for (const word of words) {
    const token = tokenOf(word);
    let role = headerRole(word.text);
    if ((token === "TUTAR" || token === "TUTARI") && (nearToken(words, word, "ISKONTO") || nearToken(words, word, "KDV"))) continue;
    if (token === "ADET" && nearToken(words, word, "KAP")) role = "packaging";
    if ((token === "TUTAR" || token === "TUTARI") && (nearToken(words, word, "HIZMET") || nearToken(words, word, "MALZEME"))) role = "lineTotal";
    if (token === "FIYAT" && nearToken(words, word, "BIRIM")) role = "unitPrice";
    if (!role) continue;
    if (token === "KAP" || token === "ISKONTO" || token === "KDV" || token === "MALZEME" || token === "HIZMET") continue;
    // "Birim Fiyat" is the price header. Birim alone, away from Fiyat, stays the unit column.
    if ((token === "BIRIM" || token === "UNIT" || token === "EINHEIT") && (nearToken(words, word, "FIYAT") || nearToken(words, word, "PRICE") || nearToken(words, word, "PREIS"))) continue;
    anchors.push({ role, x: xOf(word), x0: word.bbox.x0, x1: word.bbox.x1 });
  }
  const unique: Array<{ role: GoodsRole; x: number; x0: number; x1: number }> = [];
  for (const role of [...new Set(anchors.map((anchor) => anchor.role))]) {
    const group = anchors.filter((anchor) => anchor.role === role);
    if (group.length === 1) unique.push(group[0]!);
    // Two "Açıklaması" labels are one text block. The right-hand one is the fence before Miktar.
    else if (role === "description") unique.push([...group].sort((left, right) => right.x - left.x)[0]!);
    // The goods amount sits beside the price. A second total further right must not erase that column.
    else if (role === "lineTotal") unique.push([...group].sort((left, right) => left.x - right.x)[0]!);
  }
  const preference: GoodsRole[] = ["unitPrice", "lineTotal", "quantity", "productCode", "hsCode", "description", "unit", "packaging", "origin"];
  const kept: Array<{ role: GoodsRole; x: number; x0: number; x1: number }> = [];
  const stacked = unique.slice().sort((left, right) => left.x - right.x);
  const consumed = new Set<number>();
  for (let index = 0; index < stacked.length; index += 1) {
    if (consumed.has(index)) continue;
    const group = [stacked[index]!];
    for (let other = index + 1; other < stacked.length; other += 1) {
      if (Math.abs(stacked[other]!.x - stacked[index]!.x) <= 0.02) {
        group.push(stacked[other]!);
        consumed.add(other);
      }
    }
    group.sort((left, right) => preference.indexOf(left.role) - preference.indexOf(right.role));
    kept.push(group[0]!);
  }
  if (kept.length < 3) return undefined;
  const identity = kept.some((anchor) => anchor.role === "productCode" || anchor.role === "hsCode" || anchor.role === "description");
  const numeric = kept.some((anchor) => anchor.role === "quantity" || anchor.role === "unitPrice" || anchor.role === "lineTotal");
  if (!identity || !numeric) return undefined;
  return kept;
}

function headerBand(clusters: CanonicalWord[][]): CanonicalWord[] | undefined {
  const runs: CanonicalWord[][][] = [];
  let current: CanonicalWord[][] = [];
  const headerish = (cluster: CanonicalWord[]) => {
    const labeled = cluster.filter((word) => headerRole(word.text) || ["ISKONTO", "KDV", "MALZEME", "HIZMET", "KAP"].includes(tokenOf(word)));
    const hasCode = cluster.some((word) => looksLikeGoodsCode(word.text));
    const hasMoney = cluster.some((word) => /\d+[.,]\d{2,}/.test(word.text));
    return labeled.length >= 2 && !hasCode && !hasMoney;
  };
  for (const cluster of clusters) {
    if (!headerish(cluster)) {
      if (current.length) runs.push(current);
      current = [];
      continue;
    }
    const previous = current[current.length - 1];
    if (previous && yOf(cluster[0]!) - yOf(previous[0]!) > HEADER_BAND_Y) {
      runs.push(current);
      current = [cluster];
      continue;
    }
    current.push(cluster);
  }
  if (current.length) runs.push(current);
  const bands = runs
    .map((run) => run.flat())
    .filter((words) => headerAnchors(words));
  if (bands.length !== 1) return undefined;
  return bands[0];
}

function toColumns(anchors: Array<{ role: GoodsRole; x: number }>, headerWords: CanonicalWord[] = []): Column[] {
  const sorted = anchors.slice().sort((left, right) => left.x - right.x);
  const fences = headerWords.map((word) => xOf(word));
  return sorted.map((anchor, index) => {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    // A header we do not extract, such as Gönderilme Şekli, still ends the goods column.
    // Birim sitting on Fiyat is the same header, so only a word clearly apart counts.
    const leftFence = fences.filter((x) => anchor.x - x > 0.08).sort((left, right) => right - left)[0];
    const rightFence = fences.filter((x) => x - anchor.x > 0.08).sort((left, right) => left - right)[0];
    const roleLeft = previous ? (previous.x + anchor.x) / 2 : 0;
    const roleRight = next ? (anchor.x + next.x) / 2 : 1;
    return {
      role: anchor.role,
      left: leftFence == null ? roleLeft : Math.max(roleLeft, (leftFence + anchor.x) / 2),
      right: rightFence == null ? roleRight : Math.min(roleRight, (anchor.x + rightFence) / 2)
    };
  });
}

function wordsInColumn(words: CanonicalWord[], column: Column): CanonicalWord[] {
  return words
    .filter((word) => {
      const x = xOf(word);
      return x >= column.left && (column.right === 1 ? x <= column.right : x < column.right);
    })
    .sort((left, right) => yOf(left) - yOf(right) || xOf(left) - xOf(right));
}

const GLUED_AMOUNT_SUFFIX = /(?:adet|pcs|kg|set|mt|eur|euro|usd|try|tl|gbp)$/i;

function numericReadings(raw: string): number[] {
  const text = raw.trim().replace(/\s/g, "").replace(GLUED_AMOUNT_SUFFIX, "");
  if (!/^\d[\d.,]*$/.test(text)) return [];
  const readings: number[] = [];
  const push = (value: number) => {
    if (Number.isFinite(value) && value > 0 && !readings.some((existing) => Math.abs(existing - value) <= 1e-9)) {
      readings.push(value);
    }
  };
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep < 0) {
    push(Number(text));
    return readings;
  }
  const trailing = text.length - lastSep - 1;
  const separatorCount = (text.match(/[.,]/g) ?? []).length;
  if (separatorCount === 1 && trailing === 3) {
    push(Number(text.replace(/[.,]/g, "")));
    push(Number(text.replace(/[.,]/g, ".")));
    return readings;
  }
  const decimal = lastComma > lastDot ? "," : ".";
  const thousands = decimal === "," ? "." : ",";
  push(Number(text.split(thousands).join("").replace(decimal, ".")));
  return readings;
}

function cellReadings(words: CanonicalWord[]): number[] {
  const readings = words.flatMap((word) => numericReadings(word.text));
  return readings.filter((reading, index) => readings.findIndex((other) => Math.abs(other - reading) <= 1e-9) === index);
}

function roundValue(role: BoundRole, value: number): number {
  if (role === "quantity" && Math.abs(value - Math.round(value)) <= 1e-6) return Math.round(value);
  return Math.round(value * 1e6) / 1e6;
}

function pageWords(page: CanonicalPage): CanonicalWord[] | undefined {
  if (page.contentKind === "SCANNED") return undefined;
  const native = page.words.filter((word) => word.source === "NATIVE_TEXT" && word.text.trim());
  if (page.contentKind === "DIGITAL" && native.length === 0) return undefined;
  if (page.contentKind === "MIXED" && native.length < 3) return undefined;
  return native.length >= 3 ? native : undefined;
}

function codeToken(words: CanonicalWord[]): string {
  const tokens = words.map((word) => compact(word.text)).filter((token) => looksLikeGoodsCode(token) || (token.length >= 4 && /\d/.test(token) && /[A-Z]/.test(token)));
  return tokens.sort((left, right) => right.length - left.length)[0] ?? "";
}

function extendHeaderBand(band: CanonicalWord[], native: CanonicalWord[]): CanonicalWord[] {
  const bottom = Math.max(...band.map((word) => yOf(word)));
  // A wrapped header prints "Tutarı" on the next line, just under "Hizmet".
  // A unit such as Adet on the first goods row is not another header.
  const extra = native.filter((word) => {
    if (band.includes(word) || yOf(word) <= bottom || yOf(word) - bottom > 0.016 || !headerRole(word.text)) return false;
    return !["ADET", "PCS", "KG", "SET", "MT"].includes(tokenOf(word));
  });
  return extra.length ? [...band, ...extra] : band;
}

function buildPageTable(page: CanonicalPage, sharedColumns?: Column[]): PageTable | undefined {
  const native = pageWords(page);
  if (!native) return undefined;
  const clusters = clusterRows(native);
  const band = headerBand(clusters);
  const extended = band ? extendHeaderBand(band, native) : undefined;
  const anchors = extended ? headerAnchors(extended) : undefined;
  const columns = anchors ? toColumns(anchors, extended ?? []) : sharedColumns;
  if (!columns) return undefined;
  const headerBottom = extended ? Math.max(...extended.map((word) => word.bbox.y1)) : 0;
  const codeColumn = columns.find((column) => column.role === "productCode") ?? columns.find((column) => column.role === "hsCode");
  if (!codeColumn) return undefined;
  const body = native.filter((word) => yOf(word) > headerBottom + 0.004 && !(extended ?? []).includes(word));
  const codeWords = wordsInColumn(body, codeColumn).filter((word) => isRowCode(word.text));
  const rowStarts = codeWords.filter((word) => {
    const token = compact(word.text);
    return !codeWords.some((other) => {
      const gap = yOf(word) - yOf(other);
      return gap > 0 && gap <= 0.03 && compact(other.text).length > token.length;
    });
  });
  const anchorsY = rowStarts.map((word) => yOf(word)).sort((left, right) => left - right);
  const rows: NativeRow[] = [];
  for (let index = 0; index < anchorsY.length; index += 1) {
    const y = anchorsY[index]!;
    const next = anchorsY[index + 1] ?? y + 0.03;
    const rowWords = body.filter((word) => {
      const wordY = yOf(word);
      return wordY >= y - 0.006 && wordY < Math.min(next - 0.004, y + 0.05);
    });
    const code = codeToken(wordsInColumn(rowWords, codeColumn));
    if (code.length < 4) continue;
    const quantityColumn = columns.find((column) => column.role === "quantity");
    const priceColumn = columns.find((column) => column.role === "unitPrice");
    if (quantityColumn || priceColumn) {
      const quantity = quantityColumn ? cellReadings(wordsInColumn(rowWords, quantityColumn)) : [];
      const price = priceColumn ? cellReadings(wordsInColumn(rowWords, priceColumn)) : [];
      // A description or footer token can look like a code. A goods row prints a quantity or a price.
      if (quantity.length === 0 && price.length === 0) continue;
    }
    rows.push({ pageNumber: page.pageNumber, y, words: rowWords, code });
  }
  if (rows.length === 0) return undefined;
  return { columns, rows };
}

function rowIndexes(fields: FieldCandidateEnvelope["fields"]): number[] {
  return [...new Set(
    Object.keys(fields)
      .map((field) => ROW_FIELD_RE.exec(field)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
  )].sort((left, right) => left - right);
}

function firstCandidate(fields: FieldCandidateEnvelope["fields"], field: string): FieldCandidate | undefined {
  const values = fields[field] ?? [];
  return values.slice().sort((left, right) => right.confidence - left.confidence || left.candidateId.localeCompare(right.candidateId))[0];
}

function sameIdentity(cell: string, vision: string): boolean {
  const left = compact(cell);
  const right = compact(vision);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function oneCharacterApart(left: string, right: string): boolean {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b || sameIdentity(a, b)) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;
  if (longer.length === shorter.length) {
    let differences = 0;
    for (let index = 0; index < shorter.length; index += 1) {
      if (shorter[index] !== longer[index]) differences += 1;
    }
    return differences === 1;
  }
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return shortIndex === shorter.length;
}

function commercialAgrees(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.05, Math.abs(right) * 0.001);
}

function singleColumnReading(nativeRow: NativeRow, table: PageTable, role: GoodsRole): number | undefined {
  const column = table.columns.find((item) => item.role === role);
  if (!column) return undefined;
  const readings = cellReadings(wordsInColumn(nativeRow.words, column));
  return readings.length === 1 ? readings[0] : undefined;
}

function resolveScaleReading(role: BoundRole, readings: number[], nativeRow: NativeRow, table: PageTable): number | undefined {
  if (readings.length !== 2 || (role !== "quantity" && role !== "unitPrice" && role !== "lineTotal")) return undefined;
  const low = Math.min(readings[0]!, readings[1]!);
  const high = Math.max(readings[0]!, readings[1]!);
  const ratio = high / low;
  if (Math.abs(ratio - 1000) > 1e-6 && Math.abs(ratio - 100) > 1e-3) return undefined;
  const quantity = role === "quantity" ? undefined : singleColumnReading(nativeRow, table, "quantity");
  const price = role === "unitPrice" ? undefined : singleColumnReading(nativeRow, table, "unitPrice");
  const total = role === "lineTotal" ? undefined : singleColumnReading(nativeRow, table, "lineTotal");
  const hits = [low, high].filter((reading) => {
    if (role === "quantity" && price != null && total != null) return commercialAgrees(reading * price, total);
    if (role === "unitPrice" && quantity != null && total != null) return commercialAgrees(quantity * reading, total);
    if (role === "lineTotal" && quantity != null && price != null) return commercialAgrees(quantity * price, reading);
    return false;
  });
  return hits.length === 1 ? hits[0] : undefined;
}

function candidateValue(role: BoundRole, words: CanonicalWord[]): { value: unknown; readings: number[] } | undefined {
  if (role === "quantity" || role === "unitPrice" || role === "lineTotal") {
    const readings = cellReadings(words);
    if (readings.length === 0) return undefined;
    return { value: readings.length === 1 ? roundValue(role, readings[0]!) : undefined, readings };
  }
  if (role === "hsCode") {
    const chunks = words.map((word) => word.text.replace(/\D/g, "")).filter((value) => value.length >= 4 && value.length <= 14);
    const twelve = [...new Set(chunks.filter((value) => value.length === 12))];
    // A short number that still lands in the GTİP cell is not a second tariff code.
    if (twelve.length === 1) return { value: twelve[0], readings: [] };
    if (twelve.length > 1) return { value: undefined, readings: [] };
    if (chunks.length !== 1) return chunks.length > 1 ? { value: undefined, readings: [] } : undefined;
    return { value: chunks[0], readings: [] };
  }
  const text = words.map((word) => word.text.trim()).filter(Boolean).join(role === "productCode" ? "" : " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return { value: text, readings: [] };
}

function valuesMatch(role: BoundRole, nativeValue: unknown, visionValue: unknown): boolean {
  if (typeof nativeValue === "number" && typeof visionValue === "number") {
    return Math.abs(nativeValue - visionValue) <= Math.max(0.01, Math.abs(nativeValue) * 0.002);
  }
  if (typeof nativeValue === "string" && (typeof visionValue === "string" || typeof visionValue === "number")) {
    return sameIdentity(nativeValue, String(visionValue));
  }
  return false;
}

function singleReading(words: CanonicalWord[]): number | undefined {
  const readings = cellReadings(words);
  return readings.length === 1 ? readings[0] : undefined;
}

function commercialReadingAgrees(
  fields: FieldCandidateEnvelope["fields"],
  index: number,
  nativeRow: NativeRow,
  table: PageTable
): boolean {
  const quantityColumn = table.columns.find((column) => column.role === "quantity");
  const priceColumn = table.columns.find((column) => column.role === "unitPrice");
  if (!quantityColumn || !priceColumn) return false;
  const quantity = singleReading(wordsInColumn(nativeRow.words, quantityColumn));
  const price = singleReading(wordsInColumn(nativeRow.words, priceColumn));
  const visionQuantity = firstCandidate(fields, `goodsLines.${index}.quantity`)?.value;
  const visionPrice = firstCandidate(fields, `goodsLines.${index}.unitPrice`)?.value;
  const visionCode = compact(String(firstCandidate(fields, `goodsLines.${index}.productCode`)?.value ?? ""));
  if (quantity == null || typeof visionQuantity !== "number" || !valuesMatch("quantity", quantity, visionQuantity)) return false;
  const priceAgrees = price != null && typeof visionPrice === "number" && valuesMatch("unitPrice", price, visionPrice);
  return priceAgrees || sameIdentity(nativeRow.code, visionCode);
}

function printedRowCode(row: NativeRow, table: PageTable): string | undefined {
  const column = table.columns.find((item) => item.role === "productCode");
  if (!column) return undefined;
  const longCodes = wordsInColumn(row.words, column).filter((word) => looksLikeGoodsCode(word.text));
  const codeWords = longCodes.length > 0 ? longCodes : wordsInColumn(row.words, column).filter((word) => isRowCode(word.text));
  if (codeWords.length === 0) return undefined;
  const topY = Math.min(...codeWords.map((word) => yOf(word)));
  const onLine = codeWords.filter((word) => yOf(word) - topY <= 0.008);
  const tokens = [...new Set(onLine.map((word) => compact(word.text)))];
  const nativeCode = tokens.slice().sort((left, right) => right.length - left.length)[0];
  if (!nativeCode || !tokens.every((token) => sameIdentity(token, nativeCode))) return undefined;
  return onLine.find((word) => compact(word.text) === nativeCode)?.text.trim();
}

function descriptionWords(words: CanonicalWord[], column: Column | undefined): CanonicalWord[] {
  if (!column) return [];
  return wordsInColumn(words, column).filter((word) => {
    if (originIso(word.text)) return false;
    if (isRowCode(word.text)) return false;
    if (numericReadings(word.text).length > 0) return false;
    const token = tokenOf(word);
    if (["ADET", "PCS", "KG", "SET", "MT", "EUR", "EURO", "USD", "TL"].includes(token)) return false;
    return /[A-Za-z]/.test(word.text);
  });
}

function pageBreakCandidate(
  segmentId: string,
  field: string,
  value: unknown,
  words: CanonicalWord[],
  pageNumber: number,
  review: boolean
): FieldCandidate {
  return {
    candidateId: `${segmentId}:native-cell:${review ? "page-break-review" : "page-break"}:${field}`,
    field,
    value,
    confidence: review ? 0.5 : 0.98,
    extractor: NATIVE_CELL_EXTRACTOR,
    evidence: [{
      segmentId,
      pageNumber,
      bbox: words.length > 0 ? unionBox(words) : undefined,
      text: words.map((word) => word.text).join(" "),
      contentSource: "NATIVE_TEXT"
    }]
  };
}

/**
 * A row cut by the page edge still belongs in the goods list. The head keeps
 * the printed code, quantity and price. A tail on the previous page fills the
 * total, origin and HS only when that tail is the one product of those numbers.
 * A cell the break does not show stays empty and marked for review.
 */
function pageBreakInsertions(
  canonical: CanonicalDocument,
  segmentId: string,
  tables: Map<number, PageTable | undefined>,
  nativeRows: NativeRow[],
  paired: Map<number, { row: NativeRow }>,
  fields: FieldCandidateEnvelope["fields"]
): InsertedGoodsRow[] {
  const visionIndexes = rowIndexes(fields);
  const claimed = new Set([...paired.values()].map((pair) => pair.row));
  const breaks = nativeRows.filter((row) => {
    if (claimed.has(row)) return false;
    const table = tables.get(row.pageNumber);
    if (!table) return false;
    const onPage = nativeRows.filter((item) => item.pageNumber === row.pageNumber);
    if (onPage[0] !== row || row.pageNumber <= (nativeRows[0]?.pageNumber ?? row.pageNumber)) return false;
    const quantity = singleColumnReading(row, table, "quantity");
    const price = singleColumnReading(row, table, "unitPrice");
    if (quantity == null || price == null || singleColumnReading(row, table, "lineTotal") != null) return false;
    return printedRowCode(row, table) != null && !visionIndexes.some((index) => {
      const visionQuantity = firstCandidate(fields, `goodsLines.${index}.quantity`)?.value;
      const visionPrice = firstCandidate(fields, `goodsLines.${index}.unitPrice`)?.value;
      return typeof visionQuantity === "number" && typeof visionPrice === "number"
        && valuesMatch("quantity", quantity, visionQuantity)
        && valuesMatch("unitPrice", price, visionPrice);
    });
  });
  if (breaks.length === 0 || !visionIndexes.every((value, index) => value === index) || nativeRows.length !== visionIndexes.length + breaks.length) {
    return [];
  }
  const inserted: InsertedGoodsRow[] = [];
  for (const row of breaks) {
    const table = tables.get(row.pageNumber);
    const previousPage = canonical.pages.find((page) => page.pageNumber === row.pageNumber - 1);
    const previousRows = nativeRows.filter((item) => item.pageNumber === row.pageNumber - 1);
    const previousTable = tables.get(row.pageNumber - 1);
    if (!table || !previousPage || !previousTable || previousRows.length === 0) continue;
    const native = pageWords(previousPage);
    const last = previousRows[previousRows.length - 1]!;
    const floor = Math.max(...last.words.map((word) => yOf(word)));
    const tail = (native ?? []).filter((word) => yOf(word) > floor + 0.008);
    if (tail.length === 0) continue;
    const quantity = singleColumnReading(row, table, "quantity")!;
    const price = singleColumnReading(row, table, "unitPrice")!;
    const code = printedRowCode(row, table)!;
    const insertAt = nativeRows.indexOf(row);
    const rowFields: FieldCandidateEnvelope["fields"] = {};
    const put = (role: string, value: unknown, words: CanonicalWord[], pageNumber: number, review: boolean) => {
      const field = `goodsLines.${insertAt}.${role}`;
      rowFields[field] = [pageBreakCandidate(segmentId, field, value, words, pageNumber, review)];
    };
    const codeWords = wordsInColumn(row.words, table.columns.find((column) => column.role === "productCode")!).filter((word) => compact(word.text) === compact(code));
    put("productCode", code, codeWords.length > 0 ? codeWords : row.words.slice(0, 1), row.pageNumber, false);
    const quantityColumn = table.columns.find((column) => column.role === "quantity")!;
    const priceColumn = table.columns.find((column) => column.role === "unitPrice")!;
    put("quantity", roundValue("quantity", quantity), wordsInColumn(row.words, quantityColumn), row.pageNumber, false);
    put("unitPrice", roundValue("unitPrice", price), wordsInColumn(row.words, priceColumn), row.pageNumber, false);
    const totalColumn = previousTable.columns.find((column) => column.role === "lineTotal");
    const totalReadings = totalColumn ? cellReadings(wordsInColumn(tail, totalColumn)) : [];
    const matchedTotal = totalReadings.filter((reading) => commercialAgrees(quantity * price, reading));
    if (matchedTotal.length === 1 && totalColumn) {
      put("lineTotal", roundValue("lineTotal", matchedTotal[0]!), wordsInColumn(tail, totalColumn), previousPage.pageNumber, false);
    } else {
      put("lineTotal", null, totalColumn ? wordsInColumn(tail, totalColumn) : [], previousPage.pageNumber, true);
    }
    const descriptionColumn = previousTable.columns.find((column) => column.role === "description");
    const countries = descriptionColumn ? wordsInColumn(tail, descriptionColumn).flatMap((word) => {
      const iso = originIso(word.text);
      return iso ? [{ iso, word }] : [];
    }) : [];
    const isos = [...new Set(countries.map((item) => item.iso))];
    if (isos.length === 1) put("origin", isos[0], [countries[0]!.word], previousPage.pageNumber, false);
    else put("origin", null, [], previousPage.pageNumber, true);
    const hsColumn = previousTable.columns.find((column) => column.role === "hsCode");
    const hsWords = hsColumn ? wordsInColumn(tail, hsColumn).filter((word) => word.text.replace(/\D/g, "").length === 12) : [];
    if (hsWords.length === 1) put("hsCode", hsWords[0]!.text.replace(/\D/g, ""), hsWords, previousPage.pageNumber, false);
    else put("hsCode", null, [], previousPage.pageNumber, true);
    const headDescription = table.columns.find((column) => column.role === "description");
    const prose = descriptionWords(row.words, headDescription);
    if (prose.length > 0 && headDescription) put("description", prose.map((word) => word.text.trim()).join(" "), prose, row.pageNumber, false);
    else put("description", null, [], row.pageNumber, true);
    inserted.push({ insertAt, fields: rowFields });
  }
  return inserted;
}

/**
 * On a digital page, a goods cell's printed token comes from the native text
 * layer. Vision keeps the row. An ambiguous table, header, or cell does not
 * replace the vision value. Two different numbers in one cell stay unresolved.
 */
export function bindNativeGoodsCells(
  canonical: CanonicalDocument,
  segmentId: string,
  candidates: FieldCandidateEnvelope
): NativeCellBinding {
  const replacements: FieldCandidateEnvelope["fields"] = {};
  const conflicts: FieldCandidateEnvelope["fields"] = {};
  const tables = new Map<number, PageTable | undefined>();
  const nativeRows: NativeRow[] = [];
  const skipped: Array<{ pageNumber: number; reason: string }> = [];
  let sharedColumns: Column[] | undefined;
  for (const page of canonical.pages.slice().sort((left, right) => left.pageNumber - right.pageNumber)) {
    const table = buildPageTable(page, sharedColumns);
    tables.set(page.pageNumber, table);
    if (!table) {
      skipped.push({ pageNumber: page.pageNumber, reason: page.contentKind === "SCANNED" ? "scanned" : sharedColumns ? "no-data-row" : "no-header" });
      continue;
    }
    if (!sharedColumns) sharedColumns = table.columns;
    nativeRows.push(...table.rows);
  }

  const visionRows = rowIndexes(candidates.fields).flatMap((index) => {
    const code = compact(String(firstCandidate(candidates.fields, `goodsLines.${index}.productCode`)?.value ?? firstCandidate(candidates.fields, `goodsLines.${index}.hsCode`)?.value ?? ""));
    return code.length >= 4 ? [{ index, code }] : [];
  });
  const paired = new Map<number, { row: NativeRow; orderPaired: boolean }>();
  // A short code and its printed full code are one product. Counting them apart
  // lets each half zip onto the real row and leaves the duplicate sitting on
  // the missing line.
  const parent = visionRows.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]!));
  for (let left = 0; left < visionRows.length; left += 1) {
    for (let right = left + 1; right < visionRows.length; right += 1) {
      if (sameIdentity(visionRows[left]!.code, visionRows[right]!.code)) parent[find(left)] = find(right);
    }
  }
  const groups = new Map<number, typeof visionRows>();
  visionRows.forEach((row, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(row);
    groups.set(root, group);
  });
  const quantityOf = (index: number): number | undefined => {
    const value = firstCandidate(candidates.fields, `goodsLines.${index}.quantity`)?.value;
    return typeof value === "number" ? value : undefined;
  };
  const nativeQuantityOf = (row: NativeRow): number | undefined => {
    const table = tables.get(row.pageNumber);
    const column = table?.columns.find((item) => item.role === "quantity");
    return column ? singleReading(wordsInColumn(row.words, column)) : undefined;
  };
  for (const vision of groups.values()) {
    const native = nativeRows.filter((row) => vision.some((item) => sameIdentity(row.code, item.code)));
    // Pair each quantity with the printed rows of that same quantity. An offset
    // zip would give a duplicated code the first real row's numbers.
    const quantities = [...new Set(vision.flatMap((row) => {
      const quantity = quantityOf(row.index);
      return quantity == null ? [] : [quantity];
    }))];
    for (const quantity of quantities) {
      const visionMatches = vision.filter((row) => valuesMatch("quantity", quantityOf(row.index) ?? Number.NaN, quantity));
      const nativeMatches = native.filter((row) => {
        const nativeQuantity = nativeQuantityOf(row);
        return nativeQuantity != null && valuesMatch("quantity", nativeQuantity, quantity);
      });
      if (visionMatches.length === 0 || visionMatches.length !== nativeMatches.length) continue;
      visionMatches.forEach((row, offset) => paired.set(row.index, { row: nativeMatches[offset]!, orderPaired: false }));
    }
  }
  // A repeated code on the next page makes the per-code counts disagree, so the
  // zip above skips the row and the first page keeps the other page's code.
  // When the row counts match and this row's quantity and price already agree,
  // the text row is that line: take its code. The same code with a different
  // price is still that line, so the printed price replaces the vision price.
  // A different quantity stays unbound: binding it would move numbers between rows.
  if (visionRows.length > 0 && visionRows.length === nativeRows.length && paired.size === 0) {
    visionRows.forEach((row, offset) => paired.set(row.index, { row: nativeRows[offset]!, orderPaired: true }));
  } else if (visionRows.length > 0 && visionRows.length === nativeRows.length) {
    visionRows.forEach((row, offset) => {
      if (paired.has(row.index)) return;
      const nativeRow = nativeRows[offset]!;
      const table = tables.get(nativeRow.pageNumber);
      if (!table || !commercialReadingAgrees(candidates.fields, row.index, nativeRow, table)) return;
      paired.set(row.index, { row: nativeRow, orderPaired: true });
    });
    // A duplicated vision row sits on a printed line the model never emitted.
    // The extra copy can take that line. A quantity that appears only once stays
    // where it is, because moving it would trade one real row for another.
    visionRows.forEach((row, offset) => {
      if (paired.has(row.index)) return;
      const nativeRow = nativeRows[offset]!;
      const table = tables.get(nativeRow.pageNumber);
      const quantityColumn = table?.columns.find((column) => column.role === "quantity");
      const priceColumn = table?.columns.find((column) => column.role === "unitPrice");
      if (!quantityColumn || !priceColumn) return;
      const nativeQuantity = singleReading(wordsInColumn(nativeRow.words, quantityColumn));
      const nativePrice = singleReading(wordsInColumn(nativeRow.words, priceColumn));
      const visionQuantity = quantityOf(row.index);
      if (nativeQuantity == null || nativePrice == null) return;
      const sameCode = visionRows.filter((other) => sameIdentity(other.code, row.code));
      const copies = visionQuantity == null ? [] : sameCode.filter((other) => valuesMatch("quantity", quantityOf(other.index) ?? Number.NaN, visionQuantity));
      const nativeSeen = visionRows.some((other) => sameIdentity(other.code, nativeRow.code) && valuesMatch("quantity", quantityOf(other.index) ?? Number.NaN, nativeQuantity));
      // A second copy of the same quantity covers a line the model never emitted.
      // A code with no quantity of its own does too, once another row already
      // holds that code. A different quantity stays unbound.
      const codeOnlyDuplicate = visionQuantity == null && sameCode.length >= 2 && !sameIdentity(row.code, nativeRow.code);
      if (!nativeSeen && (copies.length >= 2 || codeOnlyDuplicate)) paired.set(row.index, { row: nativeRow, orderPaired: true });
    });
    // A code that appears once keeps the printed cells on that same line.
    // A shifted quantity must not stay when the printed code is the same product.
    // A repeated code is left to the quantity zip above.
    visionRows.forEach((row, offset) => {
      if (paired.has(row.index)) return;
      const nativeRow = nativeRows[offset]!;
      if (!sameIdentity(row.code, nativeRow.code)) return;
      const visionCopies = visionRows.filter((other) => sameIdentity(other.code, row.code)).length;
      const nativeCopies = nativeRows.filter((other) => sameIdentity(other.code, row.code)).length;
      if (visionCopies !== 1 || nativeCopies !== 1) return;
      paired.set(row.index, { row: nativeRow, orderPaired: false });
    });
    // One missing or extra letter, with that quantity printed only once, is the same line.
    visionRows.forEach((row, offset) => {
      if (paired.has(row.index)) return;
      const nativeRow = nativeRows[offset]!;
      const nativeQuantity = nativeQuantityOf(nativeRow);
      const visionQuantity = quantityOf(row.index);
      if (nativeQuantity == null || visionQuantity == null || !valuesMatch("quantity", nativeQuantity, visionQuantity)) return;
      if (!oneCharacterApart(row.code, nativeRow.code)) return;
      const visionCopies = visionRows.filter((other) => {
        const quantity = quantityOf(other.index);
        return quantity != null && valuesMatch("quantity", quantity, visionQuantity);
      }).length;
      const nativeCopies = nativeRows.filter((other) => {
        const quantity = nativeQuantityOf(other);
        return quantity != null && valuesMatch("quantity", quantity, nativeQuantity);
      }).length;
      if (visionCopies !== 1 || nativeCopies !== 1) return;
      paired.set(row.index, { row: nativeRow, orderPaired: true });
    });
  }
  // A missing row makes the counts differ, so the same-index repair above does
  // not run. One extra or missing character with that quantity and price printed
  // once is still that line. A swapped pair of characters is not.
  if (visionRows.length !== nativeRows.length) {
    const priceOf = (index: number): number | undefined => {
      const value = firstCandidate(candidates.fields, `goodsLines.${index}.unitPrice`)?.value;
      return typeof value === "number" ? value : undefined;
    };
    const nativePriceOf = (row: NativeRow): number | undefined => {
      const table = tables.get(row.pageNumber);
      const column = table?.columns.find((item) => item.role === "unitPrice");
      return column ? singleReading(wordsInColumn(row.words, column)) : undefined;
    };
    visionRows.forEach((row) => {
      if (paired.has(row.index)) return;
      const visionQuantity = quantityOf(row.index);
      const visionPrice = priceOf(row.index);
      if (visionQuantity == null || visionPrice == null) return;
      const nativeMatches = nativeRows.filter((nativeRow) => {
        const nativeQuantity = nativeQuantityOf(nativeRow);
        const nativePrice = nativePriceOf(nativeRow);
        return nativeQuantity != null && nativePrice != null
          && valuesMatch("quantity", nativeQuantity, visionQuantity)
          && valuesMatch("unitPrice", nativePrice, visionPrice)
          && oneCharacterApart(row.code, nativeRow.code);
      });
      const visionCopies = visionRows.filter((other) => {
        const quantity = quantityOf(other.index);
        const price = priceOf(other.index);
        return quantity != null && price != null
          && valuesMatch("quantity", quantity, visionQuantity)
          && valuesMatch("unitPrice", price, visionPrice);
      }).length;
      if (nativeMatches.length !== 1 || visionCopies !== 1) return;
      paired.set(row.index, { row: nativeMatches[0]!, orderPaired: true });
    });
  }

  const droppedRows: number[] = [];
  if (nativeRows.length > 0) {
    for (const row of visionRows) {
      if (paired.has(row.index) || looksLikeGoodsCode(row.code)) continue;
      const raw = String(firstCandidate(candidates.fields, `goodsLines.${row.index}.productCode`)?.value ?? "");
      if (!/^\d+\s*\/\s*\d+/.test(raw.trim())) continue;
      if (nativeRows.some((native) => sameIdentity(native.code, row.code))) continue;
      droppedRows.push(row.index);
    }
  }

  for (const [index, pair] of paired) {
    const nativeRow = pair.row;
    const table = tables.get(nativeRow.pageNumber);
    if (!table) continue;
    const identityColumn = table.columns.find((column) => column.role === "productCode") ?? table.columns.find((column) => column.role === "hsCode");
    const identityWords = identityColumn ? wordsInColumn(nativeRow.words, identityColumn) : [];
    const identityText = identityWords.map((word) => word.text).join("");
    const visionIdentity = firstCandidate(candidates.fields, `goodsLines.${index}.productCode`)?.value
      ?? firstCandidate(candidates.fields, `goodsLines.${index}.hsCode`)?.value;
    if (!pair.orderPaired && visionIdentity != null && identityText && !sameIdentity(identityText, String(visionIdentity))) continue;
    for (const column of table.columns) {
      if (column.role === "packaging") continue;
      const role = column.role as BoundRole;
      const field = `goodsLines.${index}.${role}`;
      const words = wordsInColumn(nativeRow.words, column);
      const parsed = candidateValue(role, words);
      if (!parsed) continue;
      const box = unionBox(words);
      const evidence = {
        segmentId,
        pageNumber: nativeRow.pageNumber,
        bbox: box,
        text: words.map((word) => word.text).join(" "),
        contentSource: "NATIVE_TEXT" as const
      };
      if (parsed.readings.length > 1) {
        const resolved = resolveScaleReading(role, parsed.readings, nativeRow, table);
        if (resolved == null) {
          conflicts[field] = parsed.readings.slice(0, 4).map((reading, readingIndex) => ({
            candidateId: `${segmentId}:native-cell:line-${index + 1}:${role}:conflict-${readingIndex + 1}`,
            field,
            value: roundValue(role, reading),
            confidence: 0.5,
            extractor: NATIVE_CELL_EXTRACTOR,
            evidence: [evidence]
          }));
          continue;
        }
        parsed.readings = [resolved];
        parsed.value = roundValue(role, resolved);
      }
      if (parsed.value == null) continue;
      const current = firstCandidate(candidates.fields, field);
      if (role === "description" && current) continue;
      if (role === "productCode" && current) {
        const longCodes = words.filter((word) => looksLikeGoodsCode(word.text));
        const codeWords = longCodes.length > 0 ? longCodes : words.filter((word) => isRowCode(word.text));
        if (codeWords.length === 0) continue;
        // The product code is on the first line of the row. A model number printed under it is the description.
        const topY = Math.min(...codeWords.map((word) => yOf(word)));
        const onLine = codeWords.filter((word) => yOf(word) - topY <= 0.008);
        const tokens = [...new Set(onLine.map((word) => compact(word.text)))];
        const nativeCode = tokens.slice().sort((left, right) => right.length - left.length)[0];
        // Two different codes on that line stay unresolved.
        if (!nativeCode || !tokens.every((token) => sameIdentity(token, nativeCode))) continue;
        const visionCode = compact(String(current.value));
        if (nativeCode === visionCode) continue;
        if (sameIdentity(nativeCode, visionCode) && nativeCode.length <= visionCode.length) continue;
        parsed.value = onLine.find((word) => compact(word.text) === nativeCode)!.text.trim();
      }
      const peers = candidates.fields[field] ?? [];
      const peerDisagrees = peers.some((peer) => !valuesMatch(role, parsed.value, peer.value));
      if (role !== "productCode" && current && valuesMatch(role, parsed.value, current.value) && !peerDisagrees) continue;
      replacements[field] = [{
        candidateId: `${segmentId}:native-cell:line-${index + 1}:${role}`,
        field,
        value: parsed.value,
        confidence: 0.98,
        extractor: NATIVE_CELL_EXTRACTOR,
        evidence: [evidence]
      }];
    }
    const originField = `goodsLines.${index}.origin`;
    const descriptionColumn = table.columns.find((column) => column.role === "description");
    if (descriptionColumn && !replacements[originField] && !conflicts[originField]) {
      const countries = wordsInColumn(nativeRow.words, descriptionColumn).flatMap((word) => {
        const iso = originIso(word.text);
        return iso ? [{ iso, word }] : [];
      });
      const isos = [...new Set(countries.map((item) => item.iso))];
      if (isos.length === 1) {
        const iso = isos[0]!;
        const sample = countries.find((item) => item.iso === iso)!;
        const current = firstCandidate(candidates.fields, originField);
        const peers = candidates.fields[originField] ?? [];
        const peerDisagrees = peers.some((peer) => !valuesMatch("origin", iso, peer.value));
        if (!current || !valuesMatch("origin", iso, current.value) || peerDisagrees) {
          replacements[originField] = [{
            candidateId: `${segmentId}:native-cell:line-${index + 1}:origin`,
            field: originField,
            value: iso,
            confidence: 0.98,
            extractor: NATIVE_CELL_EXTRACTOR,
            evidence: [{
              segmentId,
              pageNumber: nativeRow.pageNumber,
              bbox: sample.word.bbox,
              text: sample.word.text,
              contentSource: "NATIVE_TEXT"
            }]
          }];
        }
      }
    }
    const unitField = `goodsLines.${index}.unit`;
    const quantityColumn = table.columns.find((column) => column.role === "quantity");
    const gluedUnits = quantityColumn
      ? wordsInColumn(nativeRow.words, quantityColumn).flatMap((word) => {
          const suffix = fold(word.text).replace(/\s/g, "").match(/^\d[\d.,]*(ADET|PCS|KG|SET|MT)$/)?.[1];
          return suffix ? [suffix] : [];
        })
      : [];
    if (gluedUnits.length === 1 && !firstCandidate(candidates.fields, unitField) && !replacements[unitField]) {
      const sample = wordsInColumn(nativeRow.words, quantityColumn!).find((word) =>
        fold(word.text).replace(/\s/g, "").endsWith(gluedUnits[0]!)
      )!;
      replacements[unitField] = [{
        candidateId: `${segmentId}:native-cell:line-${index + 1}:unit`,
        field: unitField,
        value: gluedUnits[0],
        confidence: 0.98,
        extractor: NATIVE_CELL_EXTRACTOR,
        evidence: [{
          segmentId,
          pageNumber: nativeRow.pageNumber,
          bbox: sample.bbox,
          text: sample.text,
          contentSource: "NATIVE_TEXT"
        }]
      }];
    }
    if (!table.columns.some((column) => column.role === "unit") && !firstCandidate(candidates.fields, unitField) && !replacements[unitField]) {
      const packaging = table.columns.find((column) => column.role === "packaging");
      const units = nativeRow.words.filter((word) => ["ADET", "PCS", "KG", "SET", "MT"].includes(compact(word.text)) && (!packaging || wordsInColumn([word], packaging).length === 0));
      if (units.length === 1) {
        replacements[unitField] = [{
          candidateId: `${segmentId}:native-cell:line-${index + 1}:unit`,
          field: unitField,
          value: units[0]!.text.trim(),
          confidence: 0.98,
          extractor: NATIVE_CELL_EXTRACTOR,
          evidence: [{
            segmentId,
            pageNumber: nativeRow.pageNumber,
            bbox: units[0]!.bbox,
            text: units[0]!.text,
            contentSource: "NATIVE_TEXT"
          }]
        }];
      }
    }
    const descriptionField = `goodsLines.${index}.description`;
    if (!table.columns.some((column) => column.role === "description") && !firstCandidate(candidates.fields, descriptionField) && !replacements[descriptionField] && identityColumn) {
      const wrap = wordsInColumn(nativeRow.words, identityColumn).filter((word) => {
        const token = compact(word.text);
        return yOf(word) > nativeRow.y + 0.004 && token !== nativeRow.code && !numericReadings(word.text).length && token !== "ADET" && token !== "EUR";
      });
      if (wrap.length > 0) {
        replacements[descriptionField] = [{
          candidateId: `${segmentId}:native-cell:line-${index + 1}:description`,
          field: descriptionField,
          value: wrap.map((word) => word.text.trim()).join(" "),
          confidence: 0.98,
          extractor: NATIVE_CELL_EXTRACTOR,
          evidence: [{
            segmentId,
            pageNumber: nativeRow.pageNumber,
            bbox: unionBox(wrap),
            text: wrap.map((word) => word.text).join(" "),
            contentSource: "NATIVE_TEXT"
          }]
        }];
      }
    }
  }

  return {
    replacements: { version: "1", fields: replacements },
    conflicts: { version: "1", fields: conflicts },
    droppedRows,
    insertedRows: pageBreakInsertions(canonical, segmentId, tables, nativeRows, paired, candidates.fields),
    skipped
  };
}

function shiftGoodsFieldKey(field: string, insertAt: number): string {
  const match = /^goodsLines\.(\d+)\.(.+)$/.exec(field);
  if (!match) return field;
  const index = Number(match[1]);
  return index < insertAt ? field : `goodsLines.${index + 1}.${match[2]}`;
}

function shiftGoodsFields(fields: FieldCandidateEnvelope["fields"], insertAt: number): FieldCandidateEnvelope["fields"] {
  const shifted: FieldCandidateEnvelope["fields"] = {};
  for (const [field, list] of Object.entries(fields)) {
    const key = shiftGoodsFieldKey(field, insertAt);
    shifted[key] = list.map((item) => item.field === field ? { ...item, field: key } : item);
  }
  return shifted;
}

export function applyNativeGoodsCellBinding(
  candidates: FieldCandidateEnvelope,
  binding: NativeCellBinding
): FieldCandidateEnvelope {
  let fields = { ...candidates.fields };
  for (const index of binding.droppedRows) {
    for (const field of Object.keys(fields)) {
      if (field.startsWith(`goodsLines.${index}.`)) delete fields[field];
    }
  }
  const inserts = [...(binding.insertedRows ?? [])].sort((left, right) => right.insertAt - left.insertAt);
  for (const inserted of inserts) {
    fields = shiftGoodsFields(fields, inserted.insertAt);
    for (const [field, list] of Object.entries(inserted.fields)) fields[field] = list;
  }
  const placedKey = (field: string): string => {
    let key = field;
    for (const insertAt of inserts.map((item) => item.insertAt).sort((left, right) => left - right)) {
      key = shiftGoodsFieldKey(key, insertAt);
    }
    return key;
  };
  for (const [field, list] of Object.entries(binding.conflicts.fields)) {
    const key = placedKey(field);
    fields[key] = list.map((item) => ({ ...item, field: key }));
  }
  for (const [field, list] of Object.entries(binding.replacements.fields)) {
    if (binding.conflicts.fields[field]) continue;
    const key = placedKey(field);
    fields[key] = list.map((item) => ({ ...item, field: key }));
  }
  return { version: "1", fields };
}
