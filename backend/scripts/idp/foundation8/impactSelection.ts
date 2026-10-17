import fs from "node:fs";
import path from "node:path";
import type {
  Foundation8ImpactManifest,
  Foundation8ImpactSelection,
  GoldenCorpusAdmissionDecision
} from "./impactSelection.types.js";

export const FOUNDATION8_IMPACT_MANIFEST = path.resolve(
  process.cwd(),
  "backend", "scripts", "idp", "foundation8", "evals", "impact-manifest.json"
);

export function loadImpactManifest(): Foundation8ImpactManifest {
  const parsed = JSON.parse(fs.readFileSync(FOUNDATION8_IMPACT_MANIFEST, "utf8")) as Foundation8ImpactManifest;
  if (parsed.schemaVersion !== "foundation8-impact-v1") {
    throw new Error(`Unsupported Foundation 8 impact manifest: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function selectGoldenCasesByImpact(
  requestedTags: string[],
  manifest: Foundation8ImpactManifest = loadImpactManifest()
): Foundation8ImpactSelection {
  const normalizedTags = uniqueSorted(requestedTags.map(tag => tag.trim()).filter(Boolean));
  const matchedTags = normalizedTags.filter(tag => Object.hasOwn(manifest.tags, tag));
  const unknownTags = normalizedTags.filter(tag => !Object.hasOwn(manifest.tags, tag));
  const caseIds = uniqueSorted(matchedTags.flatMap(tag => manifest.tags[tag] ?? []));
  return { requestedTags: normalizedTags, matchedTags, unknownTags, caseIds };
}

export function decideGoldenCorpusAdmission(
  candidateTags: string[],
  manifest: Foundation8ImpactManifest = loadImpactManifest()
): GoldenCorpusAdmissionDecision {
  const tags = uniqueSorted(candidateTags.map(tag => tag.trim()).filter(Boolean));
  const coveredTags = tags.filter(tag => Object.hasOwn(manifest.tags, tag));
  const novelTags = tags.filter(tag => !Object.hasOwn(manifest.tags, tag));
  return {
    admit: novelTags.length > 0,
    novelTags,
    coveredTags,
    reason: novelTags.length > 0 ? "NOVEL_CAPABILITY_OR_FAILURE_CLASS" : "ALREADY_COVERED"
  };
}
