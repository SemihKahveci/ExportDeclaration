# Numeric semantics
Numbers acquire meaning from headers, units, neighboring labels and row structure. Column semantics outrank numeric coincidence.

- Quantity belongs to quantity/Miktar/Menge/Qty columns and normally carries a commercial unit such as PCS/ADET/KG.
- Package/Koli/Carton/Box/Pallet count belongs to packaging, never to goods quantity merely because it is nearby.
- Unit price/Rate/Stückpreis is not line amount/Amount/Tutar/Total.
- A line amount can equal another visible number by coincidence; preserve the source column role.
- Use quantity × unit price ≈ line amount only as a consistency check after semantic extraction. Never derive or replace a value merely to make arithmetic consistent.
