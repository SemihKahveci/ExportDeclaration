import type { DeclarationApprovalRulesDoc } from "./declarationApprovalRules.model.js";
import { DEFAULT_DECLARATION_APPROVAL_RULES } from "./declarationApprovalRules.model.js";

export interface DeclarationApprovalRulesDto {
  ithalat: 1 | 2;
  ihracat: 1 | 2;
  transit: 1 | 2;
  antrepo: 1 | 2;
}

export function toDeclarationApprovalRulesDto(
  doc: DeclarationApprovalRulesDoc
): DeclarationApprovalRulesDto {
  return {
    ithalat: doc.ithalat,
    ihracat: doc.ihracat,
    transit: doc.transit,
    antrepo: doc.antrepo
  };
}

export function defaultDeclarationApprovalRulesDto(): DeclarationApprovalRulesDto {
  return { ...DEFAULT_DECLARATION_APPROVAL_RULES };
}
