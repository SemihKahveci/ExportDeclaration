import type { DeclarationApprovalRules } from '../types';
import {
  getDeclarationApprovalRules,
  saveDeclarationApprovalRules,
} from '../api/declarationApprovalRulesApi';

export const DEFAULT_DECLARATION_APPROVAL_RULES: DeclarationApprovalRules = {
  ithalat: 1,
  ihracat: 1,
  transit: 1,
  antrepo: 1,
};

export const declarationApprovalRulesService = {
  get: async (): Promise<DeclarationApprovalRules> => {
    return getDeclarationApprovalRules();
  },
  save: async (rules: DeclarationApprovalRules): Promise<DeclarationApprovalRules> => {
    return saveDeclarationApprovalRules(rules);
  },
};
