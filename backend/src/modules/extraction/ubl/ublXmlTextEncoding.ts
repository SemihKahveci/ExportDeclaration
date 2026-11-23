/**
 * UBL XML metin encoding + bozuk Türkçe karakter onarımı.
 *
 * Bazı e-ihracat XML'leri `encoding="iso-8859-9"` der ama içerik UTF-8'dir
 * (veya UTF-8 replacement U+FFFD taşır). Bunları windows-1254 ile okumak
 * `ï¿½` üçlü mojibake üretir. Gerçek latin5 dosyalar fatal UTF-8'de düşer.
 */

/** Yaygın U+FFFD kalıpları — Vekmar tarzı bozuk paket XML'leri. */
export function repairTurkishReplacementChars(text: string): string {
  if (!text) return text;
  // Önce latin5-yanlış-okuma üçlüsünü tek replacement'a indir.
  let s = text.replace(/\u00ef\u00bf\u00bd/g, "\uFFFD").replace(/ï¿½/g, "\uFFFD");
  if (!s.includes("\uFFFD")) return s;

  return s
    .replace(/A\.\uFFFD\./g, "A.Ş.")
    .replace(/a\.\uFFFD\./g, "a.ş.")
    .replace(/\uFFFDSTANBUL/g, "İSTANBUL")
    .replace(/\uFFFDstanbul/g, "İstanbul")
    .replace(/SOF\uFFFDA/g, "SOFİA")
    .replace(/Sof\uFFFDa/g, "Sofia")
    .replace(/T\uFFFDRK\uFFFDYE/g, "TÜRKİYE")
    .replace(/T\uFFFDrkiye/g, "Türkiye")
    .replace(/BULGAR\uFFFDSTAN/g, "BULGARİSTAN")
    .replace(/Bulgar\uFFFDstan/g, "Bulgaristan")
    .replace(/\uFFFDniversiteler/g, "Üniversiteler")
    .replace(/Dumlup\uFFFDnar/g, "Dumlupınar")
    .replace(/Bulvar\uFFFD/g, "Bulvarı")
    .replace(/BAKANLI\uFFFD/g, "BAKANLIĞI")
    .replace(/TEKNOLOJ\uFFFD/g, "TEKNOLOJİ")
    .replace(/M\uFFFD D\uFFFD RL\uFFFD\uFFFD\uFFFD/g, "MÜDÜRLÜĞÜ")
    .replace(/M\uFFFD D\./g, "MÜD.")
    .replace(/VERG\uFFFD/g, "VERGİ")
    .replace(/DA\uFFFD RES\uFFFD/g, "DAİRESİ")
    .replace(/B\uFFFD LG\uFFFD/g, "BİLGİ")
    .replace(/GENEL M\uFFFD/g, "GENEL MÜ")
    .replace(/T\uFFFD CARET/g, "TİCARET")
    .replace(/\uFFFDtosb/gi, "ITOSB");
}

function declaredEncoding(buf: Buffer): string {
  const head = buf.subarray(0, 240).toString("ascii");
  return (head.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1] ?? "utf-8").toLowerCase();
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function isLatin5Family(encoding: string): boolean {
  return (
    encoding.includes("iso-8859-9")
    || encoding.includes("windows-1254")
    || encoding.includes("latin5")
  );
}

/**
 * XML baytlarını doğru metne çevirir; Türkçe replacement kalıplarını onarır.
 */
export function decodeUblXmlBuffer(buf: Buffer): string {
  if (buf.length === 0) return "";

  // UTF-8 BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return repairTurkishReplacementChars(buf.subarray(3).toString("utf8"));
  }

  const encoding = declaredEncoding(buf);
  let text: string;

  if (isLatin5Family(encoding)) {
    // Bildirim latin5 olsa bile içerik geçerli UTF-8 ise (veya U+FFFD taşıyorsa) UTF-8 tercih et.
    // Aksi halde gerçek iso-8859-9 dosyayı windows-1254 ile oku.
    if (isValidUtf8(buf)) {
      text = buf.toString("utf8");
    } else {
      text = new TextDecoder("windows-1254").decode(buf);
    }
  } else {
    text = isValidUtf8(buf) ? buf.toString("utf8") : new TextDecoder("windows-1254").decode(buf);
  }

  return repairTurkishReplacementChars(text);
}
