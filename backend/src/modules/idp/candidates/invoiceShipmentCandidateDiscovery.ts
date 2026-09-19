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
  return page.words.slice().sort((a,b) => centerY(a)-centerY(b) || a.bbox.x0-b.bbox.x0).map(w => w.text).join(" ");
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
    if (!evidence.length) continue;
    fields[field] = [makeCandidate(field, value, `${segmentId}:shipment:${field}`, segmentId, page, evidence, unitRequired ? 0.99 : 0.98)];
    return;
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
    /TOPLAM\s+KAP\s*[:：]?\s*([\d.,]+)/,
  );
  
  addLabeledNumber(
    fields,
    canonical,
    segmentId,
    GROSS_FIELD,
    /TOPLAM\s+BRUT\s+AGIRLIK\s*[:：]?\s*([\d.,]+)\s*KG/,
    true,
  );
  
  addLabeledNumber(
    fields,
    canonical,
    segmentId,
    NET_FIELD,
    /TOPLAM\s+NET\s+AGIRLIK\s*[:：]?\s*([\d.,]+)\s*KG/,
    true,
  );
  
  /*
   * Native-text exact match bulunamazsa OCR-tolerant canonical
   * geometry fallback kullan.
   */
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
    discoverLabeledWeight(
      fields,
      canonical,
      segmentId,
      NET_FIELD,
      "NET",
    );
  }
  
  discoverPackageType(fields, canonical, segmentId);
  return { version: "1", fields };
}
