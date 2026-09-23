import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { DeclarationDocumentSet } from "./declarationDocumentSet.types.js";
import type {
  DeclarationDocumentCoverageProfile,
  DeclarationDocumentCoverageResult,
  DeclarationDocumentRoleCoverage,
  DeclarationDocumentRequirement
} from "./declarationDocumentCoverage.types.js";

function normalizeRequirement(requirement: DeclarationDocumentRequirement): Required<Pick<DeclarationDocumentRequirement, "documentType" | "required">> & Pick<DeclarationDocumentRequirement, "maxCount"> & { minCount: number } {
  const minCount = requirement.minCount ?? (requirement.required ? 1 : 0);
  return { ...requirement, minCount };
}

function invalidProfile(profile: DeclarationDocumentCoverageProfile): boolean {
  const seen = new Set<DocumentTypeValue>();
  for (const raw of profile.requirements) {
    const requirement = normalizeRequirement(raw);
    if (seen.has(requirement.documentType)) return true;
    seen.add(requirement.documentType);
    if (!Number.isInteger(requirement.minCount) || requirement.minCount < 0) return true;
    if (requirement.required && requirement.minCount < 1) return true;
    if (requirement.maxCount !== undefined && (!Number.isInteger(requirement.maxCount) || requirement.maxCount < requirement.minCount)) return true;
  }
  return false;
}

/**
 * Evaluates declaration document coverage only against an explicit caller-owned
 * profile. It does not invent customs/company document requirements and does
 * not treat unconfigured document roles as errors.
 */
export function assessDeclarationDocumentCoverage(
  set: DeclarationDocumentSet,
  profile: DeclarationDocumentCoverageProfile
): DeclarationDocumentCoverageResult {
  const physicalFileCount = new Set(set.documents.map((document) => document.uploadedFileId)).size;
  const logicalDocumentCount = set.documents.length;

  if (invalidProfile(profile)) {
    return {
      status: "INVALID_PROFILE",
      roles: [],
      missingRequiredTypes: [],
      excessTypes: [],
      unconfiguredPresentTypes: [],
      physicalFileCount,
      logicalDocumentCount
    };
  }

  const configured = new Set(profile.requirements.map((requirement) => requirement.documentType));
  const roles: DeclarationDocumentRoleCoverage[] = profile.requirements.map((raw) => {
    const requirement = normalizeRequirement(raw);
    const documents = set.roles[requirement.documentType] ?? [];
    const actualCount = documents.length;
    const status: DeclarationDocumentRoleCoverage["status"] =
      actualCount < requirement.minCount
        ? "MISSING"
        : requirement.maxCount !== undefined && actualCount > requirement.maxCount
          ? "EXCESS"
          : "SATISFIED";

    return {
      documentType: requirement.documentType,
      required: requirement.required,
      minCount: requirement.minCount,
      ...(requirement.maxCount !== undefined ? { maxCount: requirement.maxCount } : {}),
      actualCount,
      logicalDocumentIds: documents.map((document) => document.logicalDocumentId),
      uploadedFileIds: [...new Set(documents.map((document) => document.uploadedFileId))],
      status
    };
  });

  const missingRequiredTypes = roles
    .filter((role) => role.required && role.status === "MISSING")
    .map((role) => role.documentType);
  const excessTypes = roles
    .filter((role) => role.status === "EXCESS")
    .map((role) => role.documentType);
  const unconfiguredPresentTypes = (Object.keys(set.roles) as DocumentTypeValue[])
    .filter((documentType) => !configured.has(documentType) && (set.roles[documentType]?.length ?? 0) > 0)
    .sort();

  return {
    status: missingRequiredTypes.length === 0 && excessTypes.length === 0 ? "COMPLETE" : "INCOMPLETE",
    roles,
    missingRequiredTypes,
    excessTypes,
    unconfiguredPresentTypes,
    physicalFileCount,
    logicalDocumentCount
  };
}
