# Row identity
A row is supported by a shared visual/semantic structure: aligned cells, table headers, continuation context and/or coherent description-code-quantity-price relationships. A single token such as a commodity code is evidence for a field, not proof of a complete row.

When table structure is uncertain, preserve candidate row groups and request targeted recovery instead of flattening independent fields into numbered rows.

## Non-commercial rows
Legal notes, origin declarations, package/shipment summaries, amount-in-words / currency-prose totals and footer sentences are not commercial goods rows even when they contain a country word, a package count or a pallet/koli unit.
- Do not materialize a goods row from text such as an all-goods origin statement, a package-count summary lacking product/HS/price identity, or a totals line written in words (for example currency amount-in-words). Amount-in-words descriptions are never commercial goods rows even when nearby numbers look like quantity/price/HS.
- An explicit document-scoped goods origin statement may authorize origin on the real commercial rows when wording clearly applies to all goods; it must not become its own goods line.
- When every commercial row shares one origin that conflicts with that document-scoped goods-origin statement, prefer the document statement (party/buyer geography must not override goods menşe). Mixed per-row origin columns stay as-is.
- European unit-price tokens such as `106,800` / `106.800` are disambiguated with qty × price = lineTotal corroboration (decimal 106.8 vs thousands 106800).
- Packaging-unit export/shipment footer lines (mal ihracatı / goods export) are not goods rows even when Vision invents price/total or order-like HS tokens.
- After packaging→commercial quantity recovery, do not re-bind the old packaging/display quantity evidence token over the recovered value.
- Apostrophe/prime thousands grouping (`10’500.00`) must keep full magnitude; German/Swiss headers `Menge` / `Stückpreis` / `Einheit` / `Ursprung` bind quantity / unitPrice / unit / origin.
- When qty and unitPrice are grounded but lineTotal is missing or non-corroborating and no role-valid amount evidence exists, complete lineTotal from qty×price only for clean cent magnitudes. Do not invent origin when the document has no goods COO column/statement.
