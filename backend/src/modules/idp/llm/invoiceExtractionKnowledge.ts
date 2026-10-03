/**
 * Verified, supplier-independent invoice knowledge used by the runtime Qwen
 * extraction skill. Add rules here only after they are covered by deterministic
 * contract/generalization tests. Never add supplier names, invoice-specific
 * values, ground-truth answers or page-position shortcuts.
 */
export const INVOICE_EXTRACTION_KNOWLEDGE_VERSION = "invoice-knowledge-v1" as const;

export const INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE = `
Verified general invoice knowledge:
- invoiceDate is the invoice/document issue date. Order, delivery, shipment, due, payment, print and dispatch dates are different semantic roles.
- Page order is provenance, not authority. An invoice-level scalar may be supported on any page; page 1 is not automatically preferred.
- A critical scalar must be supported by visible label/context plus its raw visible value. If that support cannot be reproduced, leave the scalar null.
- Currency display aliases may require semantic normalization (for example TL -> TRY), but an ambiguous currency symbol must not be guessed.
- A goods row is a semantic commercial row. Description, quantity, unit, unit price and line total belong together even when columns are separated or appear in an unusual order.
- Product/catalog/model identifiers are not HS/GTIP codes merely because they are numeric-looking.
- Ambiguous or unsupported values stay null; do not repair them from supplier identity, expected answers or document-specific memory.
`.trim();
