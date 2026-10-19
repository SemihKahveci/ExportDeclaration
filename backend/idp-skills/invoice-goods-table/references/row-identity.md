# Row identity
A row is supported by a shared visual/semantic structure: aligned cells, table headers, continuation context and/or coherent description-code-quantity-price relationships. A single token such as a commodity code is evidence for a field, not proof of a complete row.

When table structure is uncertain, preserve candidate row groups and request targeted recovery instead of flattening independent fields into numbered rows.

## Non-commercial rows
Legal notes, origin declarations, package/shipment summaries, amount-in-words / currency-prose totals and footer sentences are not commercial goods rows even when they contain a country word, a package count or a pallet/koli unit.
- Do not materialize a goods row from text such as an all-goods origin statement, a package-count summary lacking product/HS/price identity, or a totals line written in words (for example currency amount-in-words).
- An explicit document-scoped goods origin statement may authorize origin on the real commercial rows when wording clearly applies to all goods; it must not become its own goods line.
