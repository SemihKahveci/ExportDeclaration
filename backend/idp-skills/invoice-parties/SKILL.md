---
name: invoice-parties
description: Resolve seller and buyer party identities and addresses without confusing legal or table text.
version: 1.0.0
capabilities: [party-roles, address-boundaries, country-evidence]
---
# Purpose
Identify seller and buyer as role-bound entities with names, addresses and explicitly supported country information.

# Rules
- Legal suffixes may continue a company name across lines.
- Address labels and address fragments are not party names.
- Table headers, registration/legal metadata and banking text terminate or interrupt party blocks when semantics indicate a new section.
- Do not infer customs country roles from a party address.
- Preserve uncertainty when a party or address boundary cannot be established from evidence.
