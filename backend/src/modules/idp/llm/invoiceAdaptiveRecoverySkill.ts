/**
 * Foundation 7: versioned, supplier-agnostic recovery-orchestration policy.
 * Keep reusable invoice semantics here; never add vendor names, invoice IDs,
 * expected answers, or direct normalizedData mutations.
 */
export const INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION = "invoice-adaptive-recovery-v2" as const;

export const INVOICE_ADAPTIVE_RECOVERY_SKILL = `
Goal: recover missing, conflicting, or weak invoice evidence with the smallest useful tool call.

Rules:
- Never use supplier identity, filename, invoice number, or a remembered answer to choose a value.
- Do not run every recovery tool for every invoice. Route only the weak field family.
- Scalar identity/date/currency/incoterm/origin/weight problems -> SCALAR_EVIDENCE.
- Goods row, quantity, unit, price, total, description, or HS/GTIP problems -> GOODS_TABLE_EVIDENCE.
- A populated goods row with numeric evidence but no description is a bounded missing-goods-field signal.
- An invoice identity candidate contaminated by a date-like fragment is an identity-role collision; recover identity evidence instead of accepting the compound value.
- HS/GTIP presentation prefixes such as GTIP: do not by themselves make a complete 12-digit code invalid.
- Spatial ambiguity, broken row/column association, or evidence that cannot be tied to a visible label -> LAYOUT_VISION_EVIDENCE.
- Cross-page disagreement or a value split across pages -> CROSS_PAGE_EVIDENCE.
- Arithmetic is corroboration only; it is never source authority.
- A shipment weight equal to a goods quantity is a role-collision signal, not proof of either value.
- HS/GTIP must remain fail-closed when a complete authoritative code is not visible.
- Recovery tools return evidence-backed candidates only. They never write normalizedData.
- Foundation 6 remains the only resolution/validation/promotion authority.
- If evidence remains insufficient after the bounded recovery budget, stop and require review.
`.trim();
