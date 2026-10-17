import type { InvoiceSpecialistDomain } from "./invoiceUnderstandingOrchestration.js";

export const InvoiceEvidenceAuthorityRole = {
  SEMANTIC_PRIMARY: "SEMANTIC_PRIMARY",
  CORROBORATION: "CORROBORATION",
  RECOVERY_EVIDENCE: "RECOVERY_EVIDENCE",
  LEGACY_FALLBACK: "LEGACY_FALLBACK"
} as const;

export type InvoiceEvidenceAuthorityRoleValue =
  (typeof InvoiceEvidenceAuthorityRole)[keyof typeof InvoiceEvidenceAuthorityRole];

export const InvoiceEvidenceProducer = {
  SPECIALIST_UNDERSTANDING: "SPECIALIST_UNDERSTANDING",
  ROLE_BOUND_NATIVE: "ROLE_BOUND_NATIVE",
  VALIDATED_NATIVE_GOODS_ROW: "VALIDATED_NATIVE_GOODS_ROW",
  NATIVE_HS_TOKEN: "NATIVE_HS_TOKEN",
  LEGACY_DETERMINISTIC: "LEGACY_DETERMINISTIC",
  OCR: "OCR",
  VISION: "VISION"
} as const;

export type InvoiceEvidenceProducerValue =
  (typeof InvoiceEvidenceProducer)[keyof typeof InvoiceEvidenceProducer];

export interface InvoiceAuthorityDecision {
  producer: InvoiceEvidenceProducerValue;
  role: InvoiceEvidenceAuthorityRoleValue;
  mayCreateSemanticSection: boolean;
  mayCreateGoodsRow: boolean;
  mayReplaceGroundedSemanticValue: boolean;
  mayTriggerTargetedRecovery: boolean;
  rationale: string;
}

/** Foundation 8 authority policy: deterministic/native readers remain evidence, not a second semantic parser. */
export function authorityDecisionFor(
  producer: InvoiceEvidenceProducerValue,
  domain?: InvoiceSpecialistDomain
): InvoiceAuthorityDecision {
  switch (producer) {
    case InvoiceEvidenceProducer.SPECIALIST_UNDERSTANDING:
      return { producer, role: InvoiceEvidenceAuthorityRole.SEMANTIC_PRIMARY, mayCreateSemanticSection: true, mayCreateGoodsRow: domain === "GOODS", mayReplaceGroundedSemanticValue: true, mayTriggerTargetedRecovery: true, rationale: "Bounded specialist output owns its semantic domain and remains evidence-grounded." };
    case InvoiceEvidenceProducer.ROLE_BOUND_NATIVE:
      return { producer, role: InvoiceEvidenceAuthorityRole.CORROBORATION, mayCreateSemanticSection: false, mayCreateGoodsRow: false, mayReplaceGroundedSemanticValue: false, mayTriggerTargetedRecovery: true, rationale: "Explicit role-bound native evidence corroborates or challenges semantic output; it does not overwrite it." };
    case InvoiceEvidenceProducer.VALIDATED_NATIVE_GOODS_ROW:
      return { producer, role: InvoiceEvidenceAuthorityRole.CORROBORATION, mayCreateSemanticSection: false, mayCreateGoodsRow: false, mayReplaceGroundedSemanticValue: false, mayTriggerTargetedRecovery: true, rationale: "Validated deterministic rows may corroborate an already-identified atomic row but cannot define row identity." };
    case InvoiceEvidenceProducer.NATIVE_HS_TOKEN:
      return { producer, role: InvoiceEvidenceAuthorityRole.CORROBORATION, mayCreateSemanticSection: false, mayCreateGoodsRow: false, mayReplaceGroundedSemanticValue: false, mayTriggerTargetedRecovery: true, rationale: "An isolated exact HS/GTIP token is strong field evidence but is not a commercial row." };
    case InvoiceEvidenceProducer.OCR:
    case InvoiceEvidenceProducer.VISION:
      return { producer, role: InvoiceEvidenceAuthorityRole.RECOVERY_EVIDENCE, mayCreateSemanticSection: false, mayCreateGoodsRow: false, mayReplaceGroundedSemanticValue: false, mayTriggerTargetedRecovery: true, rationale: "Raw OCR/Vision observations are evidence inputs to bounded semantic interpretation, not direct declaration authority." };
    case InvoiceEvidenceProducer.LEGACY_DETERMINISTIC:
      return { producer, role: InvoiceEvidenceAuthorityRole.LEGACY_FALLBACK, mayCreateSemanticSection: false, mayCreateGoodsRow: false, mayReplaceGroundedSemanticValue: false, mayTriggerTargetedRecovery: true, rationale: "Legacy field-index extraction is retained only as degraded evidence/fallback during migration." };
  }
}

export function assertAuthorityPolicyInvariant(decision: InvoiceAuthorityDecision): void {
  if (decision.role !== InvoiceEvidenceAuthorityRole.SEMANTIC_PRIMARY && (decision.mayCreateSemanticSection || decision.mayCreateGoodsRow || decision.mayReplaceGroundedSemanticValue)) {
    throw new Error(`Non-semantic producer ${decision.producer} cannot own or overwrite semantic truth`);
  }
}
