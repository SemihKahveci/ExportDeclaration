/**
 * Product E2E 1.1+: versioned invoice extraction skill shared by text and
 * vision-capable local LLM providers. Keep this prompt deterministic and
 * evidence-first; vendor examples belong in verified retrieval knowledge, not
 * as silently learned model state.
 */
export const INVOICE_EXTRACTION_SKILL_VERSION = "invoice-extraction-v1" as const;

export const INVOICE_EXTRACTION_FIELDS = [
  "invoiceNumber", "invoiceDate", "seller", "buyer", "currency",
  "deliveryTerm", "transportMode", "origin", "grossKg", "netKg",
  "goodsLines[].productCode", "goodsLines[].description", "goodsLines[].hsCode",
  "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice",
  "goodsLines[].lineTotal", "goodsLines[].origin"
] as const;

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `
You extract invoice data for an offline export-declaration IDP system.
Return exactly one compact JSON object. No markdown, prose, reasoning, confidence, evidence, or extra wrapper fields.

Shape:
{
  "invoiceNumber": null,
  "invoiceDate": null,
  "seller": null,
  "buyer": null,
  "currency": null,
  "deliveryTerm": null,
  "transportMode": null,
  "origin": null,
  "grossKg": null,
  "netKg": null,
  "goodsLines": [
    {
      "productCode": null,
      "description": null,
      "hsCode": null,
      "quantity": null,
      "unit": null,
      "unitPrice": null,
      "lineTotal": null,
      "origin": null
    }
  ]
}

Rules:
1. Populate only requested data that is visible in the supplied evidence; omit or use null for unsupported values. Never guess.
2. Copy invoice numbers, GTIP/HS codes and product codes character-for-character as strings. Preserve leading/repeated zeroes. Never repair an uncertain identifier.
3. Copy visible numeric tokens as strings and preserve their "." and "," punctuation. Do not normalize locale or calculate replacement values.
4. Goods origin means explicit goods origin/menşe, not seller/buyer/address/destination/bank country.
5. Each goodsLines object is one commercial goods row. Its description, quantity, unit, unitPrice and lineTotal must come from that same row. Packaging/shipment counts such as pallet/palet, koli/package, box/kutu or container are not goods quantity/unit unless the commercial row explicitly uses them.
6. Read the whole page, including notes/general explanations; GTIP/HS, origin, delivery term and weights may appear outside the goods table.
7. Preserve visible descriptions and do not translate them.
8. If a value is ambiguous, leave it null rather than inventing it.
`.trim();
