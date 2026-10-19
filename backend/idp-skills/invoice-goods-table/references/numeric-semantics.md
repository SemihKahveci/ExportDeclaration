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

## Evidence-role authority
When structured evidence is returned for a goods numeric, treat its visible header and raw token as the authority for that field.
- Do not emit a package-count value as commercial quantity when its evidence is bound to a packaging role.
- Do not emit shipment gross/net weight as unit price or line total when the evidence label names a weight role.
- Do not replace an evidence-backed line amount with a computed quantity × unit-price result. Arithmetic can flag a contradiction, but cannot rewrite the visible amount.
- Evidence fidelity: if the model emits a separator-stripped integer (e.g. `295700`) while `evidence.rawValue` still shows the visible token (`29,5700`), the locale parse of the evidence token is authority. Role-correct but lexically unfaithful evidence must not become final F6 authority.
- If explicit evidence contradicts the proposed field role, leave that field unresolved for fallback/review. If structured evidence is unavailable, preserve the ordinary semantic extraction path rather than inventing evidence.

## Packaging-reject commercial recovery
When quantity evidence is packaging-bound and therefore rejected, or when the commercial row still carries a packaging unit (koli/carton/pallet/box/…) with a missing or non-corroborated quantity, commercial quantity may be recovered only when:
1. unit price and line total are already role-consistent on the same row, and
2. line total ÷ unit price yields one clean commercial quantity, and
3. that quantity is not equal to the packaging count (when a packaging count is known).

Clear a packaging unit from the commercial row after such a rejection so a commercial unit can be rebound from evidence. Never invent a quantity when price/total corroboration is absent or ambiguous.

These rules are role-based and layout-independent. They apply equally to unseen suppliers, languages and table shapes.
