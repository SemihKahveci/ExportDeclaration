# Row identity
A row is supported by a shared visual/semantic structure: aligned cells, table headers, continuation context and/or coherent description-code-quantity-price relationships. A single token such as a commodity code is evidence for a field, not proof of a complete row.

When table structure is uncertain, preserve candidate row groups and request targeted recovery instead of flattening independent fields into numbered rows.

## Non-commercial rows
Legal notes, origin declarations, package/shipment summaries, amount-in-words / currency-prose totals and footer sentences are not commercial goods rows even when they contain a country word, a package count or a pallet/koli unit.
- Do not materialize a goods row from text such as an all-goods origin statement, a package-count summary lacking product/HS/price identity, or a totals line written in words (for example currency amount-in-words). Amount-in-words descriptions are never commercial goods rows even when nearby numbers look like quantity/price/HS.
- An explicit document-scoped goods origin statement may authorize origin on the real commercial rows when wording clearly applies to all goods; it must not become its own goods line.
- When every commercial row shares one origin that conflicts with that document-scoped goods-origin statement, prefer the document statement (party/buyer geography must not override goods menşe). Mixed per-row origin columns stay as-is.
- European unit-price tokens such as `106,800` / `106.800` are disambiguated with qty × price = lineTotal corroboration (decimal 106.8 vs thousands 106800).
- European quantity tokens such as `1.600` / `1.368` are disambiguated the same way (thousands 1600 vs decimal 1.6) when price × quantity matches the visible line total.
- Packaging-unit export/shipment footer lines (mal ihracatı / goods export) are not goods rows even when Vision invents price/total or order-like HS tokens.
- After packaging→commercial quantity recovery, do not re-bind the old packaging/display quantity evidence token over the recovered value.
- Apostrophe/prime thousands grouping (`10’500.00`) must keep full magnitude; German/Swiss headers `Menge` / `Stückpreis` / `Einheit` / `Ursprung` bind quantity / unitPrice / unit / origin.
- When qty and unitPrice are grounded but lineTotal is missing, complete from qty×price for clean cent magnitudes only. When a visible amount cell exists, recover lineTotal from locale-aware evidence (`29,5700` → 29.57); arithmetic may flag a contradiction and reject a broken candidate, but must not overwrite lineTotal with qty×price. Keep explicit 0/FOC totals and modest discount/surcharge differences. Do not invent origin when the document has no goods COO column/statement.
- When Vision omits hsCode but a stable HS/HSN/GTIP digit column is present, fill empty row hsCode from that column (6–14 digits). Never overwrite a Vision hsCode. Ambiguous/glued tariff tokens stay fail-closed for human review.
