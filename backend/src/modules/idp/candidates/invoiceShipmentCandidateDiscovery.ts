import type { CanonicalBBox, CanonicalDocument, CanonicalPage, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-shipment-generic-v1";
const PACKAGE_FIELD = "packageInfo.packageType";
const TOTAL_FIELD = "packageInfo.totalPackage";
const GROSS_FIELD = "packageInfo.grossKg";
const NET_FIELD = "packageInfo.netKg";

function norm(text: string): string {
  return text.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U").replace(/\s+/g, " ").trim();
}
function centerX(word: CanonicalWord): number { return (word.bbox.x0 + word.bbox.x1) / 2; }
function centerY(word: CanonicalWord): number { return (word.bbox.y0 + word.bbox.y1) / 2; }
function unionBox(words: CanonicalWord[]): CanonicalBBox {
  return { x0: Math.min(...words.map(w => w.bbox.x0)), y0: Math.min(...words.map(w => w.bbox.y0)), x1: Math.max(...words.map(w => w.bbox.x1)), y1: Math.max(...words.map(w => w.bbox.y1)) };
}
function makeCandidate(field: string, value: unknown, id: string, segmentId: string, page: CanonicalPage, words: CanonicalWord[], confidence: number): FieldCandidate {
  return {
    candidateId: id, field, value, confidence, extractor: EXTRACTOR,
    evidence: [{ segmentId, pageNumber: page.pageNumber, bbox: unionBox(words), text: words.map(w => w.text).join(" "), contentSource: words.some(w => w.source === "OCR") ? "OCR" : "NATIVE_TEXT" }]
  };
}
function parseNumber(raw: string): number | undefined {
  const s = raw.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return undefined;
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  let n = s;
  if (comma > dot) n = s.replace(/\./g, "").replace(",", ".");
  else if (dot > comma) n = s.replace(/,/g, "");
  const value = Number(n);
  return Number.isFinite(value) ? value : undefined;
}
function pageText(page: CanonicalPage): string {
  const wordText = page.words.slice().sort((a,b) => centerY(a)-centerY(b) || a.bbox.x0-b.bbox.x0).map(w => w.text).join(" ");
  return [page.nativeText ?? "", page.ocrText ?? "", wordText].filter(Boolean).join(" ");
}

function makeTextCandidate(field: string, value: unknown, id: string, segmentId: string, page: CanonicalPage, text: string, confidence: number): FieldCandidate {
  return {
    candidateId: id, field, value, confidence, extractor: EXTRACTOR,
    evidence: [{ segmentId, pageNumber: page.pageNumber, text, contentSource: page.nativeText?.includes(text) ? "NATIVE_TEXT" : "OCR" }]
  };
}

function wordsForMatch(
  page: CanonicalPage,
  matched: string,
): CanonicalWord[] {
  const clean = (text: string) =>
    norm(text)
      .replace(/[^A-Z0-9.,-]/g, "")
      .trim();

  const normalizedMatch = norm(matched)
    .replace(/\s+/g, " ")
    .trim();

  const words = page.words
    .slice()
    .sort(
      (a, b) =>
        centerY(a) - centerY(b) ||
        a.bbox.x0 - b.bbox.x0,
    );

  /*
   * OCR bazen bütün label + value satırını tek CanonicalWord olarak
   * döndürür. Yalnızca gerçek whole-line containment kabul et.
   * normalizedMatch.includes(normalizedWord) özellikle kullanılmaz;
   * kısa/alakasız word'ler yanlış provenance üretmemeli.
   */
  for (const word of words) {
    const normalizedWord = norm(word.text)
      .replace(/\s+/g, " ")
      .trim();

    if (
      normalizedWord === normalizedMatch ||
      (
        normalizedWord.length >= 8 &&
        normalizedWord.includes(normalizedMatch)
      )
    ) {
      return [word];
    }
  }

  /*
   * Native text / parçalı OCR: token'ları aynı görsel satır üzerinde,
   * soldan sağa ve sınırlı aralıklarla eşleştir.
   */
  const tokens = normalizedMatch
    .split(" ")
    .map(clean)
    .filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  for (let i = 0; i < words.length; i++) {
    const firstValue = clean(words[i]!.text);
    const firstToken = tokens[0]!;

    if (
      !firstValue ||
      !(
        firstValue === firstToken ||
        firstValue.includes(firstToken) ||
        firstToken.includes(firstValue)
      )
    ) {
      continue;
    }

    const matchedWords: CanonicalWord[] = [words[i]!];
    const baseY = centerY(words[i]!);
    let tokenIndex = 1;
    let previousIndex = i;

    for (
      let j = i + 1;
      j < words.length && tokenIndex < tokens.length;
      j++
    ) {
      const word = words[j]!;

      if (Math.abs(centerY(word) - baseY) > 0.025) {
        break;
      }

      if (j - previousIndex > 3) {
        break;
      }

      const value = clean(word.text);
      const token = tokens[tokenIndex]!;

      if (!value) {
        continue;
      }

      if (
        value === token ||
        value.includes(token) ||
        token.includes(value)
      ) {
        matchedWords.push(word);
        previousIndex = j;
        tokenIndex++;
      }
    }

    if (tokenIndex === tokens.length) {
      return matchedWords;
    }
  }

  return [];
}

function addLabeledNumber(fields: Record<string, FieldCandidate[]>, canonical: CanonicalDocument, segmentId: string, field: string, label: RegExp, unitRequired = false) {
  for (const page of canonical.pages) {
    const text = pageText(page);
    const match = label.exec(norm(text));
    if (!match) continue;
    const value = parseNumber(match[1] ?? "");
    if (value === undefined) continue;
    const evidenceText = match[0];
    const evidence = wordsForMatch(page, evidenceText);
    if (evidence.length) {
      fields[field] = [makeCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, evidence, unitRequired ? 0.99 : 0.98)];
      return;
    }
    // Some digital PDFs expose the footer/general-notes block in nativeText
    // without stable word geometry. The exact label+value match is still
    // direct source evidence and must not be discarded merely for lacking bbox.
    const native = norm(page.nativeText ?? "");
    if (native.includes(norm(evidenceText))) {
      fields[field] = [makeTextCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, evidenceText, unitRequired ? 0.99 : 0.98)];
      return;
    }
    const ocr = norm(page.ocrText ?? "");
    if (ocr.includes(norm(evidenceText))) {
      fields[field] = [makeTextCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, evidenceText, unitRequired ? 0.99 : 0.98)];
      return;
    }
  }
}

function addSameLineLabeledNumber(
  fields: Record<string, FieldCandidate[]>,
  canonical: CanonicalDocument,
  segmentId: string,
  field: string,
  label: RegExp,
  unitRequired = false,
) {
  for (const page of canonical.pages) {
    /*
     * Weight labels are intentionally evaluated per canonical visual/text line.
     * pageText()/norm() flatten line breaks, which can accidentally bind a label
     * to the first number on a following line and bypass the ambiguity-aware
     * geometry resolver below.
     */
    const lineTexts = [
      ...(page.lines ?? []).map(line => line.text),
      ...(page.nativeText ?? "").split(/\r?\n/),
      ...(page.ocrText ?? "").split(/\r?\n/),
    ].map(text => text.trim()).filter(Boolean);

    const seen = new Set<string>();
    for (const rawLine of lineTexts) {
      const normalizedLine = norm(rawLine);
      if (!normalizedLine || seen.has(normalizedLine)) continue;
      seen.add(normalizedLine);

      const match = label.exec(normalizedLine);
      label.lastIndex = 0;
      if (!match) continue;
      const value = parseNumber(match[1] ?? "");
      if (value === undefined) continue;

      const evidenceText = match[0];
      const evidence = wordsForMatch(page, evidenceText);
      if (evidence.length) {
        fields[field] = [makeCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, evidence, unitRequired ? 0.99 : 0.98)];
        return;
      }

      fields[field] = [makeTextCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, rawLine, unitRequired ? 0.99 : 0.98)];
      return;
    }
  }
}


function discoverColumnBoundWeight(
  fields: Record<string, FieldCandidate[]>,
  canonical: CanonicalDocument,
  segmentId: string,
  field: string,
  kind: "GROSS" | "NET",
) {
  const labelPattern = kind === "GROSS"
    ? /^(?:GR(?:OSS)?\.?\s*WT\.?\s*(?:KGS?|KG)?|GROSS\s+(?:WEIGHT|WT\.?|KG))$/
    : /^(?:NET\s*WT\.?\s*(?:KGS?|KG)?|NET\s+(?:WEIGHT|WT\.?|KG))$/;

  for (const page of canonical.pages) {
    const lines = page.lines ?? [];
    const labels = lines.filter(line => labelPattern.test(norm(line.text).replace(/\s+/g, " ")));
    for (const label of labels) {
      const lx = (label.bbox.x0 + label.bbox.x1) / 2;
      const ly = (label.bbox.y0 + label.bbox.y1) / 2;
      const candidates = lines
        .filter(line => line !== label)
        .filter(line => {
          const cy = (line.bbox.y0 + line.bbox.y1) / 2;
          const sameRow = Math.abs(cy - ly) <= Math.max(0.008, (label.bbox.y1 - label.bbox.y0) * 0.9);
          const below = cy > ly + 0.002 && cy <= ly + 0.065;
          return sameRow || below;
        })
        .filter(line => {
          const cx = (line.bbox.x0 + line.bbox.x1) / 2;
          const sameRow = Math.abs(((line.bbox.y0 + line.bbox.y1) / 2) - ly) <= Math.max(0.008, (label.bbox.y1 - label.bbox.y0) * 0.9);
          if (sameRow) return line.bbox.x0 >= label.bbox.x1 - 0.01 && line.bbox.x0 - label.bbox.x1 <= 0.12;
          return Math.abs(cx - lx) <= Math.max(0.08, (label.bbox.x1 - label.bbox.x0) * 0.9);
        })
        .filter(line => /^[:：]?\s*[\d.,]+(?:\s*(?:KG|KGS))?$/i.test(line.text.trim()))
        .sort((a,b) => Math.abs(((a.bbox.x0+a.bbox.x1)/2)-lx)-Math.abs(((b.bbox.x0+b.bbox.x1)/2)-lx) || a.bbox.y0-b.bbox.y0);
      if (candidates.length !== 1) continue;
      const value = parseNumber(candidates[0]!.text);
      if (value === undefined || value <= 0 || value > 1_000_000) continue;
      fields[field] = [{
        candidateId: `${segmentId}:shipment:${field}`,
        field, value, confidence: 0.99, extractor: EXTRACTOR,
        evidence: [{
          segmentId, pageNumber: page.pageNumber,
          bbox: { x0: Math.min(label.bbox.x0,candidates[0]!.bbox.x0), y0: Math.min(label.bbox.y0,candidates[0]!.bbox.y0), x1: Math.max(label.bbox.x1,candidates[0]!.bbox.x1), y1: Math.max(label.bbox.y1,candidates[0]!.bbox.y1) },
          text: `${label.text} | ${candidates[0]!.text}`,
          contentSource: label.source === "OCR" || candidates[0]!.source === "OCR" ? "OCR" : "NATIVE_TEXT"
        }]
      }];
      return;
    }
  }
}

function discoverLabeledWeight(
  fields: Record<string, FieldCandidate[]>,
  canonical: CanonicalDocument,
  segmentId: string,
  field: string,
  kind: "GROSS" | "NET",
) {
  const required =
    kind === "GROSS"
      ? ["TOPLAM", "BRUT", "AGIRLIK"]
      : ["TOPLAM", "NET", "AGIRLIK"];

  for (const page of canonical.pages) {
    const words = page.words
      .slice()
      .sort(
        (a, b) =>
          centerY(a) - centerY(b) ||
          a.bbox.x0 - b.bbox.x0,
      );

    for (let i = 0; i < words.length; i++) {
      const first = norm(words[i]!.text)
        .replace(/[^A-Z0-9.,-]/g, "");

      if (first !== "TOPLAM") {
        continue;
      }

      /*
       * OCR'da label kelimeleri arasına küçük parçalar veya punctuation
       * girebildiği için sabit bir string/regex yerine yakın canonical
       * word penceresinde label bileşenlerini arıyoruz.
       */
      const labelWindow = words.slice(
        i,
        Math.min(words.length, i + 10),
      );

      const normalized = labelWindow.map((w) =>
        norm(w.text).replace(/[^A-Z0-9.,-]/g, ""),
      );

      let cursor = 0;
      const labelWords: CanonicalWord[] = [];

      for (const token of required) {
        let found = -1;

        for (let j = cursor; j < normalized.length; j++) {
          if (
            normalized[j] === token ||
            normalized[j]?.includes(token)
          ) {
            found = j;
            break;
          }
        }

        if (found === -1) {
          labelWords.length = 0;
          break;
        }

        labelWords.push(labelWindow[found]!);
        cursor = found + 1;
      }

      if (labelWords.length !== required.length) {
        continue;
      }

      const labelBox = unionBox(labelWords);
      const labelY = centerY(labelWords[labelWords.length - 1]!);

      /*
       * Label'dan sonra gelen yakın canonical kelimeler içinden
       * ağırlık değerini buluyoruz. Aynı satır tercih edilir.
       */
      const nearby = words
        .filter((w) => {
          if (w.bbox.x0 < labelBox.x0 - 0.02) {
            return false;
          }

          if (centerY(w) < labelY - 0.025) {
            return false;
          }

          if (centerY(w) > labelY + 0.04) {
            return false;
          }

          return true;
        })
        .sort(
          (a, b) =>
            Math.abs(centerY(a) - labelY) -
              Math.abs(centerY(b) - labelY) ||
            a.bbox.x0 - b.bbox.x0,
        );

      for (const word of nearby) {
        const raw = word.text.trim();

        /*
         * "162,00", "162.00", "162,00KG" gibi OCR/native biçimleri.
         * Label'ın kendi kelimelerindeki sayıları dikkate almıyoruz.
         */
        if (!/\d/.test(raw)) {
          continue;
        }

        const value = parseNumber(raw);

        if (
          value === undefined ||
          value <= 0 ||
          value > 1_000_000
        ) {
          continue;
        }

        const evidence = [...labelWords, word];

        fields[field] = [
          makeCandidate(
            field,
            value,
            `${segmentId}:shipment:${field}`,
            segmentId,
            page,
            evidence,
            0.98,
          ),
        ];

        return;
      }
    }
  }
}

function discoverCompactWeightLabel(
  fields: Record<string, FieldCandidate[]>,
  canonical: CanonicalDocument,
  segmentId: string,
  field: string,
  kind: "GROSS" | "NET",
) {
  const labelRe = kind === "GROSS" ? /^(?:GR|GROSS)\.?\s*WT\.?\s*KGS?$/ : /^NET\s*WT\.?\s*KGS?$/;
  for (const page of canonical.pages) {
    const words = page.words.slice().sort((a,b) => centerY(a)-centerY(b) || a.bbox.x0-b.bbox.x0);
    const label = words.find(word => labelRe.test(norm(word.text).replace(/\s+/g," ")));
    if (!label) continue;
    const candidates = words.filter(word => word !== label)
      .filter(word => Math.abs(centerY(word)-centerY(label)) <= 0.02)
      .filter(word => word.bbox.x0 >= label.bbox.x1 - 0.01)
      .sort((a,b) => a.bbox.x0-b.bbox.x0);
    for (const word of candidates) {
      if (!/\d/.test(word.text)) continue;
      const value = parseNumber(word.text);
      if (value === undefined || value <= 0 || value > 1_000_000) continue;
      fields[field] = [makeCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, [label, word], 0.99)];
      return;
    }
  }
}

function discoverPackageType(
    fields: Record<string, FieldCandidate[]>,
    canonical: CanonicalDocument,
    segmentId: string,
  ) {
    for (const page of canonical.pages) {
      const words = page.words;
  
      const cinsiHeaders = words.filter(
        (w) =>
          norm(w.text).replace(/[^A-ZÇĞÖŞÜ]/g, "") === "CINSI",
      );
  
      for (const cinsi of cinsiHeaders) {
        const headerY = centerY(cinsi);
  
        const headerBand = words.filter(
          (w) => Math.abs(centerY(w) - headerY) < 0.04,
        );
  
        const kap = headerBand
          .filter(
            (w) =>
              norm(w.text).replace(/[^A-ZÇĞÖŞÜ]/g, "") === "KAP",
          )
          .sort(
            (a, b) =>
              Math.abs(centerX(a) - centerX(cinsi)) -
              Math.abs(centerX(b) - centerX(cinsi)),
          )[0];
  
        const esya = headerBand
          .filter(
            (w) =>
              norm(w.text).replace(/[^A-ZÇĞÖŞÜ]/g, "") === "ESYA",
          )
          .sort(
            (a, b) =>
              Math.abs(centerX(a) - centerX(cinsi)) -
              Math.abs(centerX(b) - centerX(cinsi)),
          )[0];
  
        if (!kap || !esya) {
          continue;
        }
  
        /*
         * "Eşya Kap Cinsi" dar bir PDF kolonunda birden fazla canonical
         * word olarak tutulabiliyor. Tek başına Cinsi'nin x koordinatını
         * kullanmak komşu Teslim Şartı kolonundaki FCA'yı seçebiliyor.
         *
         * Bu yüzden kolon merkezini başlığın tamamından çıkarıyoruz.
         */
        const headerWords = [esya, kap, cinsi];
        const headerBox = unionBox(headerWords);
        const columnCenterX = (headerBox.x0 + headerBox.x1) / 2;
  
        /*
         * Header'ın altında aynı dar kolonda tekrar eden metinleri ara.
         * Yatay toleransı header genişliğine göre dinamik tutuyoruz;
         * supplier/layout sabiti kullanmıyoruz.
         */
        const headerWidth = Math.max(
          0.012,
          headerBox.x1 - headerBox.x0,
        );
  
        const xTolerance = Math.max(
          0.012,
          Math.min(0.04, headerWidth * 0.55),
        );
  
        const below = words.filter((w) => {
          if (centerY(w) <= headerBox.y1 + 0.005) {
            return false;
          }
  
          if (
            Math.abs(centerX(w) - columnCenterX) >
            xTolerance
          ) {
            return false;
          }
  
          const text = w.text.trim();
  
          return /^[\p{L}][\p{L}.-]{1,15}$/u.test(text);
        });
  
        const groups = new Map<string, CanonicalWord[]>();
  
        for (const word of below) {
          const key = norm(word.text);
  
          if (
            [
              "ESYA",
              "KAP",
              "CINSI",
              "ADET",
              "NO",
              "TESLIM",
              "SARTI",
              "FCA",
              "EXW",
              "CIF",
              "CIP",
              "CPT",
              "DAP",
              "DPU",
              "DDP",
              "FAS",
              "FOB",
              "CFR",
            ].includes(key)
          ) {
            continue;
          }
  
          const group = groups.get(key) ?? [];
          group.push(word);
          groups.set(key, group);
        }
  
        const winner = [...groups.entries()]
          .sort((a, b) => b[1].length - a[1].length)[0];
  
        if (!winner || winner[1].length < 2) {
          continue;
        }
  
        const representative = winner[1][0]!;
  
        fields[PACKAGE_FIELD] = [
          makeCandidate(
            PACKAGE_FIELD,
            representative.text.trim(),
            `${segmentId}:shipment:packageType`,
            segmentId,
            page,
            [representative],
            0.96,
          ),
        ];
  
        return;
      }
    }
  }

export function discoverInvoiceShipmentFieldCandidates(canonical: CanonicalDocument, segmentId: string): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  addLabeledNumber(
    fields,
    canonical,
    segmentId,
    TOTAL_FIELD,
    /(?:TOPLAM\s+KAP|KAP\s+(?:ADET|SAYISI)|PALET\s+(?:ADEDI|SAYISI)|PALLET\s+(?:COUNT|QTY|QUANTITY)|TOTAL\s+(?:PACKAGES?|CARTONS?|PALLETS?))\s*[:：]?\s*([\d.,]+)/,
  );
  
  addSameLineLabeledNumber(
    fields,
    canonical,
    segmentId,
    GROSS_FIELD,
    /(?:TOPLAM\s+)?(?:BRUT\s+(?:AGIRLIK|KG)|(?:GROSS|GR\.?)\s+(?:WEIGHT|WT\.?)(?:\s*KGS?)?|GROSS\s+KG)[ \t]*[:：]?[ \t]*([\d.,]+)[ \t]*(?:KG|KGS)?/,
    true,
  );
  
  addSameLineLabeledNumber(
    fields,
    canonical,
    segmentId,
    NET_FIELD,
    /(?:TOPLAM\s+)?(?:NET\s+(?:AGIRLIK|KG)|NET\s+(?:WEIGHT|WT\.?)(?:\s*KGS?)?)[ \t]*[:：]?[ \t]*([\d.,]+)[ \t]*(?:KG|KGS)?/,
    true,
  );
  
  /*
   * Native-text exact match bulunamazsa OCR-tolerant canonical
   * geometry fallback kullan.
   */
  if (!fields[GROSS_FIELD]?.length) {
    discoverColumnBoundWeight(fields, canonical, segmentId, GROSS_FIELD, "GROSS");
  }
  if (!fields[GROSS_FIELD]?.length) {
    discoverLabeledWeight(
      fields,
      canonical,
      segmentId,
      GROSS_FIELD,
      "GROSS",
    );
  }
  
  if (!fields[NET_FIELD]?.length) {
    discoverColumnBoundWeight(fields, canonical, segmentId, NET_FIELD, "NET");
  }
  if (!fields[NET_FIELD]?.length) {
    discoverLabeledWeight(
      fields,
      canonical,
      segmentId,
      NET_FIELD,
      "NET",
    );
  }

  if (!fields[GROSS_FIELD]?.length) discoverCompactWeightLabel(fields, canonical, segmentId, GROSS_FIELD, "GROSS");
  if (!fields[NET_FIELD]?.length) discoverCompactWeightLabel(fields, canonical, segmentId, NET_FIELD, "NET");
  
  // Explicit summary labels such as "TOPLAM KAP: 18 PALET" carry both
  // package count and package type. Prefer this role-bound evidence before the
  // table-column heuristic; it is layout/supplier independent.
  if (!fields[PACKAGE_FIELD]?.length) {
    for (const page of canonical.pages) {
      const text = norm(pageText(page));
      const match = text.match(/(?:TOPLAM\s+KAP|KAP\s+(?:ADET|SAYISI)|PALET\s+(?:ADEDI|SAYISI)|PALLET\s+(?:COUNT|QTY|QUANTITY)|TOTAL\s+(?:PACKAGES?|CARTONS?|PALLETS?))\s*[:：]?\s*[\d.,]+\s+(PALET|PALLET|KOLI|KOLLI|CARTON|CARTONS|BOX|BOXES|BIN|PACKAGE|PACKAGES)\b/);
      if (!match?.[1]) continue;
      const evidenceText = match[0];
      const evidence = wordsForMatch(page, evidenceText);
      const value = match[1];
      fields[PACKAGE_FIELD] = [evidence.length
        ? makeCandidate(PACKAGE_FIELD, value, `${segmentId}:shipment:packageType`, segmentId, page, evidence, 0.99)
        : makeTextCandidate(PACKAGE_FIELD, value, `${segmentId}:shipment:packageType`, segmentId, page, evidenceText, 0.98)];
      break;
    }
  }
  if (!fields[PACKAGE_FIELD]?.length) discoverPackageType(fields, canonical, segmentId);
  return { version: "1", fields };
}
