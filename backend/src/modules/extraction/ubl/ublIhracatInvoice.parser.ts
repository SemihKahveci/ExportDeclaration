import type { UblParsedGoodsLine, UblParsedInvoice, UblParsedParty } from "./ublIhracatInvoice.types.js";

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#42;/g, "*")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&apos;/g, "'");
}

function textOf(block: string, localName: string): string | undefined {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${localName}>`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  const value = decodeXml(m[1]!.replace(/<[^>]+>/g, "").trim());
  return value || undefined;
}

function attrOf(block: string, localName: string, attr: string): string | undefined {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${localName}\\b([^>]*)>`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  const attrs = m[1] ?? "";
  const am = attrs.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return am?.[1];
}

function firstBlock(xml: string, localName: string): string | undefined {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${localName}\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_]+:)?${localName}>`, "i");
  return xml.match(re)?.[0];
}

function allBlocks(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${localName}\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_]+:)?${localName}>`, "gi");
  return xml.match(re) ?? [];
}

function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function partyFrom(block: string | undefined): UblParsedParty | undefined {
  if (!block) return undefined;
  const party = firstBlock(block, "Party") ?? block;
  const name =
    textOf(firstBlock(party, "PartyName") ?? "", "Name")
    ?? textOf(firstBlock(party, "Person") ?? "", "FirstName");
  const taxSchemeIds = allBlocks(party, "PartyIdentification")
    .map((idBlock) => {
      const id = textOf(idBlock, "ID");
      const scheme = attrOf(idBlock, "ID", "schemeID") ?? "";
      return { id, scheme: scheme.toUpperCase() };
    })
    .filter((row) => row.id);
  const taxNo =
    taxSchemeIds.find((row) => row.scheme === "VKN" || row.scheme === "TCKN")?.id
    ?? taxSchemeIds.find((row) => /^\d{10,11}$/.test(row.id ?? ""))?.id;
  const countryCode = textOf(firstBlock(party, "Country") ?? "", "IdentificationCode");
  const addressParts = [
    textOf(firstBlock(party, "PostalAddress") ?? "", "StreetName"),
    textOf(firstBlock(party, "PostalAddress") ?? "", "CityName"),
  ].filter(Boolean);
  return {
    ...(name ? { name: name.trim() } : {}),
    ...(taxNo ? { taxNo: taxNo.trim() } : {}),
    ...(countryCode ? { countryCode: countryCode.trim().toUpperCase() } : {}),
    ...(addressParts.length ? { address: addressParts.join(", ") } : {}),
  };
}

function pickDescription(itemBlock: string): string | undefined {
  return textOf(itemBlock, "Description") ?? textOf(itemBlock, "Name");
}

function pickProductCode(itemBlock: string, lineBlock: string): string | undefined {
  const buyers = textOf(firstBlock(itemBlock, "BuyersItemIdentification") ?? "", "ID");
  const sellers = textOf(firstBlock(itemBlock, "SellersItemIdentification") ?? "", "ID");
  const name = textOf(itemBlock, "Name");
  const description = textOf(itemBlock, "Description");
  // Firma farkı: Name ürün koduysa (Description ayrı tanım) Name; aksi Name tanımsa Sellers/Buyers.
  if (description && name && name !== description) return name;
  return buyers ?? sellers ?? name;
}

function pickOrigin(lineBlock: string): string | undefined {
  const originCountry = firstBlock(lineBlock, "OriginCountry");
  const code = textOf(originCountry ?? "", "IdentificationCode");
  if (code) return code.trim().toUpperCase();
  const note = textOf(lineBlock, "Note");
  if (note && /^[A-Za-zÇĞİÖŞÜçğıöşü\s-]{2,40}$/.test(note.trim()) && !note.includes("#") && !note.includes(":")) {
    return note.trim();
  }
  return undefined;
}

function parseLine(lineBlock: string, index: number): UblParsedGoodsLine {
  const item = firstBlock(lineBlock, "Item") ?? "";
  const qtyText = textOf(lineBlock, "InvoicedQuantity");
  const unit = attrOf(lineBlock, "InvoicedQuantity", "unitCode")?.toUpperCase();
  const quantity = num(qtyText);
  const unitPrice = num(textOf(firstBlock(lineBlock, "Price") ?? "", "PriceAmount"));
  const lineTotal = num(textOf(lineBlock, "LineExtensionAmount"));
  // GTİP UBL-TR e-ihracatta çoğunlukla GoodsItem/RequiredCustomsID (Item altında değil).
  const requiredCustoms =
    textOf(firstBlock(lineBlock, "GoodsItem") ?? "", "RequiredCustomsID")
    ?? textOf(lineBlock, "RequiredCustomsID")
    ?? textOf(item, "RequiredCustomsID");
  const deliveryTerm = textOf(firstBlock(lineBlock, "DeliveryTerms") ?? "", "ID")?.toUpperCase();
  const rawPackageType = textOf(firstBlock(lineBlock, "ActualPackage") ?? lineBlock, "PackagingTypeCode")?.trim().toUpperCase();
  const packageType = rawPackageType && /^[A-Z0-9]{1,10}$/.test(rawPackageType) ? rawPackageType : undefined;
  const lineNote = textOf(lineBlock, "Note");
  const description = pickDescription(item);
  const productCode = pickProductCode(item, lineBlock);
  const origin = pickOrigin(lineBlock);
  const netKg = unit === "KGM" && quantity != null ? quantity : undefined;

  return {
    lineNo: index + 1,
    ...(requiredCustoms ? { hsCode: requiredCustoms.replace(/\D/g, "").slice(0, 12) || requiredCustoms.trim() } : {}),
    ...(productCode ? { productCode: productCode.trim() } : {}),
    ...(description ? { description: description.trim() } : {}),
    ...(quantity != null ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(unitPrice != null ? { unitPrice } : {}),
    ...(lineTotal != null ? { lineTotal } : {}),
    ...(origin ? { origin } : {}),
    ...(deliveryTerm ? { deliveryTerm } : {}),
    ...(packageType ? { packageType } : {}),
    ...(lineNote ? { lineNote: lineNote.trim() } : {}),
    ...(netKg != null ? { netKg } : {}),
  };
}

/**
 * UBL-TR e-ihracat (ProfileID=IHRACAT) faturasını deterministik parse eder.
 * Vision/LLM kullanmaz.
 */
export function parseUblIhracatInvoiceXml(xml: string): UblParsedInvoice {
  const invoiceNo = textOf(xml, "ID");
  // Root-level ID is first cbc:ID — but many nested IDs exist. Prefer Invoice/cbc:ID near top.
  const headerSlice = xml.slice(0, Math.min(xml.length, 8000));
  const profileId = textOf(headerSlice, "ProfileID");
  const invoiceDate = textOf(headerSlice, "IssueDate");
  const currency = textOf(headerSlice, "DocumentCurrencyCode")?.toUpperCase();
  const monetary = firstBlock(xml, "LegalMonetaryTotal") ?? "";
  const totalAmount = num(textOf(monetary, "PayableAmount"));

  const seller = partyFrom(firstBlock(xml, "AccountingSupplierParty"));
  const buyer = partyFrom(firstBlock(xml, "BuyerCustomerParty"));
  const accountingCustomer = partyFrom(firstBlock(xml, "AccountingCustomerParty"));

  const lineBlocks = allBlocks(xml, "InvoiceLine");
  const goodsLines = lineBlocks.map((block, index) => parseLine(block, index));

  const invoiceNotes = allBlocks(xml, "Note")
    .map((block) => textOf(block, "Note") ?? block.replace(/<[^>]+>/g, "").trim())
    .map((n) => decodeXml(n).replace(/\s+/g, " ").trim())
    .filter((n) => n && !n.startsWith("#DOVIZ") && n.length > 2);

  // Root-level notes only: Notes that appear before first InvoiceLine
  const beforeLines = xml.split(/<(?:[A-Za-z0-9_]+:)?InvoiceLine\b/i)[0] ?? xml;
  const rootNotes = allBlocks(beforeLines, "Note")
    .map((block) => {
      const inner = block.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>$/, "");
      return decodeXml(inner.replace(/<[^>]+>/g, "").trim()).replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);

  const deliveryTerm =
    goodsLines.find((line) => line.deliveryTerm)?.deliveryTerm
    ?? textOf(firstBlock(xml, "DeliveryTerms") ?? "", "ID")?.toUpperCase();

  const packageType = goodsLines.find((line) => line.packageType)?.packageType;

  // Prefer Invoice ID from early header (avoid nested Party Identification)
  const earlyId = textOf(headerSlice, "ID");

  return {
    ...(profileId ? { profileId } : {}),
    invoiceNo: earlyId ?? invoiceNo,
    ...(invoiceDate ? { invoiceDate } : {}),
    ...(currency ? { currency } : {}),
    ...(totalAmount != null ? { totalAmount } : {}),
    ...(seller ? { seller } : {}),
    ...(buyer ? { buyer } : {}),
    ...(accountingCustomer ? { accountingCustomer } : {}),
    ...(deliveryTerm ? { deliveryTerm } : {}),
    invoiceNotes: rootNotes.length ? rootNotes : invoiceNotes.slice(0, 20),
    ...(packageType ? { packageType } : {}),
    goodsLines,
  };
}
