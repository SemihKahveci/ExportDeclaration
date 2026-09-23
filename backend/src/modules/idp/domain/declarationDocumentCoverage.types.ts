import type { DocumentTypeValue } from "../../../common/enums/documentType.js";

export interface DeclarationDocumentRequirement {
  documentType: DocumentTypeValue;
  required: boolean;
  minCount?: number;
  maxCount?: number;
}

export interface DeclarationDocumentCoverageProfile {
  version: "1";
  requirements: DeclarationDocumentRequirement[];
}

export interface DeclarationDocumentRoleCoverage {
  documentType: DocumentTypeValue;
  required: boolean;
  minCount: number;
  maxCount?: number;
  actualCount: number;
  logicalDocumentIds: string[];
  uploadedFileIds: string[];
  status: "SATISFIED" | "MISSING" | "EXCESS";
}

export interface DeclarationDocumentCoverageResult {
  status: "COMPLETE" | "INCOMPLETE" | "INVALID_PROFILE";
  roles: DeclarationDocumentRoleCoverage[];
  missingRequiredTypes: DocumentTypeValue[];
  excessTypes: DocumentTypeValue[];
  unconfiguredPresentTypes: DocumentTypeValue[];
  physicalFileCount: number;
  logicalDocumentCount: number;
}
