import {
  loadIdpSkill,
  renderIdpSkillContext,
  type LoadedIdpSkill
} from "../skills/skillRegistry.js";
import type { InvoiceUnderstandingEvidenceRef } from "./invoiceUnderstanding.types.js";

export const INVOICE_SPECIALIST_DOMAINS = [
  "PARTIES",
  "COMMERCIAL",
  "GOODS",
  "LOGISTICS"
] as const;

export type InvoiceSpecialistDomain = (typeof INVOICE_SPECIALIST_DOMAINS)[number];

export type InvoiceUnderstandingEvidenceBundle = {
  documentId: string;
  evidence: InvoiceUnderstandingEvidenceRef[];
  canonicalText?: string;
};

export type InvoiceSpecialistDefinition = {
  domain: InvoiceSpecialistDomain;
  skillName: string;
  owns: readonly string[];
  forbidden: readonly string[];
};

export type InvoiceSpecialistRequest = {
  documentId: string;
  domain: InvoiceSpecialistDomain;
  skillName: string;
  skillVersion: string;
  skillContext: string;
  owns: readonly string[];
  forbidden: readonly string[];
  evidence: InvoiceUnderstandingEvidenceRef[];
  canonicalText?: string;
};

/**
 * Ownership is deliberately disjoint at the semantic section boundary.
 * Specialists may observe the same canonical evidence, but they may only emit their owned section.
 */
export const INVOICE_SPECIALISTS: readonly InvoiceSpecialistDefinition[] = [
  {
    domain: "PARTIES",
    skillName: "invoice-parties",
    owns: ["parties"],
    forbidden: ["commercialTerms", "logistics", "packageSummary", "goodsTable"]
  },
  {
    domain: "COMMERCIAL",
    skillName: "invoice-commercial",
    owns: ["documentIdentity", "commercialTerms"],
    forbidden: ["parties", "logistics", "packageSummary", "goodsTable"]
  },
  {
    domain: "GOODS",
    skillName: "invoice-goods-table",
    owns: ["goodsTable"],
    forbidden: ["documentIdentity", "parties", "commercialTerms", "logistics", "packageSummary"]
  },
  {
    domain: "LOGISTICS",
    skillName: "invoice-logistics",
    owns: ["logistics", "packageSummary"],
    forbidden: ["documentIdentity", "parties", "commercialTerms", "goodsTable"]
  }
] as const;

export function loadInvoiceSpecialistSkill(
  definition: InvoiceSpecialistDefinition
): LoadedIdpSkill {
  return loadIdpSkill(definition.skillName);
}

export function buildInvoiceSpecialistRequest(
  definition: InvoiceSpecialistDefinition,
  bundle: InvoiceUnderstandingEvidenceBundle
): InvoiceSpecialistRequest {
  if (!bundle.documentId.trim()) throw new Error("documentId is required");
  const skill = loadInvoiceSpecialistSkill(definition);
  return {
    documentId: bundle.documentId,
    domain: definition.domain,
    skillName: skill.metadata.name,
    skillVersion: skill.metadata.version,
    skillContext: renderIdpSkillContext(skill),
    owns: definition.owns,
    forbidden: definition.forbidden,
    evidence: bundle.evidence,
    canonicalText: bundle.canonicalText
  };
}

/**
 * Manager planning is intentionally model-independent. It performs no extraction and makes no
 * invoice-specific decision; it only creates bounded specialist work from the same evidence bundle.
 */
export function planInvoiceUnderstandingSpecialists(
  bundle: InvoiceUnderstandingEvidenceBundle
): InvoiceSpecialistRequest[] {
  return INVOICE_SPECIALISTS.map(definition => buildInvoiceSpecialistRequest(definition, bundle));
}

export function assertDisjointSpecialistOwnership(
  definitions: readonly InvoiceSpecialistDefinition[] = INVOICE_SPECIALISTS
): void {
  const ownerByPath = new Map<string, InvoiceSpecialistDomain>();
  for (const definition of definitions) {
    for (const path of definition.owns) {
      const previous = ownerByPath.get(path);
      if (previous) throw new Error(`Semantic ownership collision: ${path} owned by ${previous} and ${definition.domain}`);
      ownerByPath.set(path, definition.domain);
    }
  }
}
