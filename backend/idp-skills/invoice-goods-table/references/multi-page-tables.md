# Multi-page tables
A goods table may continue across pages with repeated headers or partial rows. Detect continuation from table semantics and column relationships, not fixed coordinates.

Read all continuation pages before declaring the table complete. Repeated table headers do not reset row identity. When printed row numbers continue across pages, use them as the strongest ordering signal. Page totals, package summaries, banking blocks, legal footers and amount-in-words text must not become continuation rows.

A long invoice with many row numbers but only a handful of fully populated extracted rows is incomplete even if many HS/GTIP tokens were found. Preserve the expected commercial-row count separately from the number of extracted fields.
