---
name: invoice-parties
description: Resolve seller and buyer party identities and addresses without confusing legal or table text.
version: 1.1.0
capabilities: [party-roles, address-boundaries, country-evidence, multiline-addresses]
---
# Purpose
Identify seller and buyer as role-bound entities with names, addresses and explicitly supported country information.

# Rules
- Resolve the complete party block, not only the company name. Preserve explicit multiline postal addresses under Exporter/Seller/Supplier and Buyer/Bill To/Consignee/TO blocks until a clear section boundary.
- Legal suffixes may continue a company name across lines.
- Address labels and address fragments are not party names.
- Registration identifiers, tax numbers, phones and banking text may appear inside/after a party block; do not replace the postal address with those identifiers.
- Table headers, unrelated registration/legal metadata and banking text terminate or interrupt party blocks when semantics indicate a new section.
- A buyer block may be introduced by `TO:` or by layout rather than a literal Buyer label; use the document role, not a supplier-specific phrase.
- Do not infer customs country roles from a party address.
- Preserve uncertainty when a party or address boundary cannot be established from evidence.
