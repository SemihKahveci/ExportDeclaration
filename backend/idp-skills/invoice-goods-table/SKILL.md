---
name: invoice-goods-table
description: Extract goods as atomic row entities while preserving row identity across columns and pages.
version: 1.2.0
capabilities: [goods-row-identity, multi-page-tables, numeric-semantics, code-semantics, origin-semantics]
---
# Purpose
Produce goods rows as atomic commercial entities. Establish row identity first; attach fields only when evidence supports membership in that same row.

# Invariants
- Return every commercial goods row in document order. If printed row numbers exist, printed row N maps to zero-based `goodsLines.(N-1)`; do not restart numbering on a new page.
- Return `goodsTable.expectedRowCount` when the table structure or explicit row numbering supports the count. Count commercial rows, not HS/GTIP tokens.
- An HS/GTIP token alone cannot materialize a goods row.
- Never complete a row by borrowing a field from another row solely because indexes align.
- Bind numeric cells by their semantic column headers before considering arithmetic: quantity/Miktar/Menge, unit price/Birim Fiyat/Rate/Stückpreis, and amount/Tutar/Amount/Total are different roles. When several numeric columns coexist, explicitly resolve header → cell → unit role before emitting the row.
- Package/carton/pallet/box counts are not commercial goods quantity. A packaging count may sit next to a goods quantity on the same row and must remain separate. A visible quantity+commercial-unit pair (for example KG/PCS/ADET) outranks a neighboring package count for the goods quantity role.
- Product/model/material/stock/part code is distinct from description. Preserve an explicit code such as a model, stock, drawing or material number when it is bound to the row; do not replace it with a short token taken from the description.
- HS/HSN/commodity codes must preserve source granularity. Never pad a 6- or 8-digit source code into a 12-digit GTIP.
- Goods origin requires explicit row-local origin evidence or an explicit document statement that applies to all goods. Buyer/seller country, destination, port or company location is not goods origin.
- Arithmetic validates an extraction; it must not manufacture missing source values or make a semantically wrong quantity look valid.
- Multi-page continuation must preserve row/table identity and distinguish repeated headers, subtotals, summaries and footers from goods.
- Continue through the entire table. Do not stop after the first page, first rows, first HS codes, or because an output is already long.
- Report incompleteness or conflict to reconciliation rather than creating skeleton rows.

# Recovery discipline
Perform one semantic reading per bounded evidence chunk. If a field remains ambiguous, identify the exact missing role/evidence and return review/recovery; do not repeatedly reread the same page with broad prompts. Recovery must be domain-local and evidence-targeted.
