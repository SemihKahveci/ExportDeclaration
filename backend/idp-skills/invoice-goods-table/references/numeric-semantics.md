# Numeric semantics
Numbers acquire meaning from headers, units, neighboring labels and row structure. Column semantics outrank numeric coincidence.

- Quantity belongs to quantity/Miktar/Menge/Qty columns and normally carries a commercial unit such as PCS/ADET/KG.
- Package/Koli/Carton/Box/Pallet count belongs to packaging, never to goods quantity merely because it is nearby.
- Unit price/Rate/Stückpreis is not line amount/Amount/Tutar/Total.
- A line amount can equal another visible number by coincidence; preserve the source column role.
- Use quantity × unit price ≈ line amount only as a consistency check after semantic extraction. Never derive or replace a value merely to make arithmetic consistent.

## Role-disambiguation procedure
When a row exposes several nearby counts or amounts, resolve roles in this order before emitting JSON:
1. Bind each visible value to its printed column header/label.
2. Bind the commercial unit to the quantity column; a quantity/unit pair such as `12.345 KG` outranks an adjacent package count such as `640 Koli`.
3. Keep package/carton/pallet/box counts outside the commercial goods row quantity even when they are the nearest integer.
4. Distinguish unit price from line total using the printed monetary headers. Never swap them merely because another arrangement makes arithmetic work.
5. Only after roles are fixed, use quantity × unit price ≈ line total as corroboration. If arithmetic and header semantics disagree, preserve the source roles and request review/recovery rather than rebinding columns.

A semantically wrong row can be perfectly arithmetic-consistent. Arithmetic consistency therefore never proves column identity.
