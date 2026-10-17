export type Foundation8ImpactManifest = {
  schemaVersion: "foundation8-impact-v1";
  policy: string;
  tags: Record<string, string[]>;
};

export type Foundation8ImpactSelection = {
  requestedTags: string[];
  matchedTags: string[];
  unknownTags: string[];
  caseIds: string[];
};

export type GoldenCorpusAdmissionDecision = {
  admit: boolean;
  novelTags: string[];
  coveredTags: string[];
  reason: "NOVEL_CAPABILITY_OR_FAILURE_CLASS" | "ALREADY_COVERED";
};
