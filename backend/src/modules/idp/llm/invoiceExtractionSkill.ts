/**
 * Product E2E 1.1+: versioned invoice extraction skill shared by text and
 * vision-capable local LLM providers. Keep this prompt deterministic and
 * evidence-first; vendor examples belong in verified retrieval knowledge, not
 * as silently learned model state.
 */
import { INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE } from "./invoiceExtractionKnowledge.js";

export const INVOICE_EXTRACTION_SKILL_VERSION = "invoice-extraction-v7" as const;

export const INVOICE_EXTRACTION_FIELDS = [
  "invoiceNumber", "invoiceDate", "seller", "buyer", "currency",
  "deliveryTerm", "transportMode", "origin", "grossKg", "netKg",
  "goodsLines[].productCode", "goodsLines[].description", "goodsLines[].hsCode",
  "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice",
  "goodsLines[].lineTotal", "goodsLines[].origin"
] as const;

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `
You extract invoice data for an offline export-declaration IDP system.
Return exactly one compact JSON object. No markdown, prose, reasoning, confidence, or extra wrapper fields. For invoiceDate and currency only, include the compact criticalScalarEvidence object shown below so the extracted scalar is grounded in visible page text.

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
  "criticalScalarEvidence": {
    "invoiceDate": { "label": null, "rawValue": null },
    "currency": { "label": null, "rawValue": null }
  },
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

${INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE}

Rules:
1. Populate only requested data that is visible in the supplied evidence; omit or use null for unsupported values. Never guess.
2. Invoice numbers, GTIP/HS codes and product codes are identifiers: preserve their visible characters and leading/repeated zeroes. Never invent or repair an uncertain identifier.
3. Semantically parse numeric values instead of merely copying display tokens. Resolve locale separators from context (for example 1.250,75 -> 1250.75 when the document uses European numeric formatting) and return JSON numbers for quantity, unitPrice, lineTotal, grossKg and netKg. Never manufacture a number that is not supported by the document.
4. Normalize well-supported semantic values to the requested contract: dates as YYYY-MM-DD, currencies as ISO-4217 codes, countries/origins as ISO-3166-1 alpha-2 when unambiguous, and common commercial units to a stable uppercase unit token. Preserve the source meaning; if normalization is uncertain, return null.
5. Weight fields grossKg/netKg are kilograms. Convert an explicitly labelled source unit only when the conversion is unambiguous (for example 87000 g -> 87 kg). Do not infer a unit from an unlabeled number.
6. Goods origin means explicit goods origin/menşe, not seller/buyer/address/destination/bank country.
7. Each goodsLines object is one commercial goods row. Interpret table headers, spatial layout and row semantics together. description, quantity, unit, unitPrice and lineTotal must describe the same commercial row. Packaging/shipment counts such as pallet/palet, koli/package, box/kutu or container are not goods quantity/unit unless the commercial row explicitly uses them.
8. Use arithmetic only as corroboration, never as the sole reason to swap column roles. If both 1 x 560 and 560 x 1 fit the total, use headers/layout/unit evidence; otherwise leave the ambiguous fields null.
9. A numeric-looking product/catalog/model code is not an HS/GTIP merely because it has 6, 8, 10 or 12 digits. Populate hsCode only when the document semantically identifies the value as HS/HSN/GTIP/tariff/customs code or equivalent.
10. Read the whole page, including notes/general explanations; GTIP/HS, origin, delivery term and weights may appear outside the goods table.
11. Preserve visible goods descriptions and do not translate them.
12. If a value is ambiguous or unsupported, leave it null rather than inventing it.
13. invoiceDate means the invoice/document issue date only. Use a date only when the page evidence identifies that semantic role (for example invoice date, issue date, fatura tarihi or düzenleme tarihi). Do not use order, delivery, shipment, due, payment, print, dispatch or other role-specific dates as invoiceDate. A bare or role-ambiguous date on a continuation/secondary page is not enough evidence: return invoiceDate as null for that page.
14. Page position is provenance, not authority. Never prefer a date merely because it appears on page 1, the first page supplied, or earlier in reading order. An explicitly identified invoice/document issue date may be extracted from any page.
15. When a page contains multiple dates, assign invoiceDate only from the date whose visible label/context identifies the invoice/document issue-date role. If that role cannot be distinguished from the other dates, return invoiceDate as null rather than choosing the first, nearest or only convenient date.
16. For a non-null invoiceDate, criticalScalarEvidence.invoiceDate.label and rawValue must reproduce the visible label/context and the visible raw date token that support that exact value. Do not invent, paraphrase, repair or normalize these evidence strings. If you cannot provide both from the page, return invoiceDate as null and both evidence members as null.
17. For a non-null currency, criticalScalarEvidence.currency.label and rawValue must reproduce visible page text that identifies the invoice monetary currency and its raw token/code. Do not infer currency only from locale, seller/buyer country or a currency symbol whose meaning is ambiguous. If the currency cannot be grounded in visible text, return currency as null and both evidence members as null.
18. criticalScalarEvidence is provenance, not an additional extraction field. Keep it limited to invoiceDate and currency; goods-line extraction behavior is unchanged.
19. Critical-scalar uncertainty is field-local. If invoiceDate or currency is null or lacks valid visible evidence, continue extracting every other independently supported field on the page, including goodsLines, grossKg, netKg, origin, deliveryTerm and identifiers. Never null, suppress or downgrade unrelated supported fields merely because invoiceDate or currency is unsupported.
`.trim();
