/**
 * Verified, supplier-independent invoice knowledge used by the runtime Qwen
 * extraction skill. Add rules here only after they are covered by deterministic
 * contract/generalization tests. Never add supplier names, invoice-specific
 * values, ground-truth answers or page-position shortcuts.
 */
export const INVOICE_EXTRACTION_KNOWLEDGE_VERSION = "invoice-knowledge-v2" as const;

export const INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE = `
Verified general invoice knowledge:
- invoiceDate is the invoice/document issue date. Order, delivery, shipment, due, payment, print and dispatch dates are different semantic roles.
- Page order is provenance, not authority. An invoice-level scalar may be supported on any page; page 1 is not automatically preferred.
- A critical scalar must be supported by visible label/context plus its raw visible value. If that support cannot be reproduced, leave the scalar null.
- Currency display aliases may require semantic normalization (for example TL -> TRY), but an ambiguous currency symbol must not be guessed.
- A goods row is a semantic commercial row. Description, quantity, unit, unit price and line total belong together even when columns are separated or appear in an unusual order.
- Product/catalog/model identifiers are not HS/GTIP codes merely because they are numeric-looking.
- Ambiguous or unsupported values stay null; do not repair them from supplier identity, expected answers or document-specific memory.
- Document-level scalar facts may appear in headers, footers, totals, shipping/summary blocks, or compact table/summary rows; do not assume they are outside tables or on a particular page.
- grossKg means explicitly supported gross/brut shipment weight and netKg means explicitly supported net shipment weight. Accept semantic label variants such as Gross Weight/Brüt Ağırlık/Brüt Kg and Net Weight/Net Ağırlık/Net Kg when the visible context makes the role and unit unambiguous; do not derive either weight from goods quantities or arithmetic.
- origin means explicit goods country of origin/menşe/origin. Accept semantically equivalent labels such as Country of Origin, Origin, Menşe or Menşei when visibly tied to the goods/shipment; do not substitute seller, buyer, address, destination, dispatch or bank country.
- During a narrow scalar recovery request, inspect the whole supplied page for each requested scalar independently, including scalar cells embedded in or adjacent to tables. Ignore goods-row extraction as an output task, but do not ignore a table/summary region that visibly contains a requested document-level scalar.
`.trim();
