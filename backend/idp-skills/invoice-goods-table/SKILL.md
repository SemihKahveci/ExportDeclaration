---
name: invoice-goods-table
description: Extract goods as atomic row entities while preserving row identity across columns and pages.
version: 1.0.0
capabilities: [goods-row-identity, multi-page-tables, numeric-semantics]
---
# Purpose
Produce goods rows as atomic commercial entities. Establish row identity first; attach fields only when evidence supports membership in that same row.

# Invariants
- An HS/GTIP token alone cannot materialize a goods row.
- Never complete a row by borrowing a field from another row solely because indexes align.
- Commercial quantity, package count, unit price and line amount are different semantic roles even when all are numeric.
- Arithmetic validates an extraction; it must not manufacture missing source values.
- Multi-page continuation must preserve row/table identity and distinguish repeated headers, subtotals, summaries and footers from goods.
- Report incompleteness or conflict to reconciliation rather than creating skeleton rows.
