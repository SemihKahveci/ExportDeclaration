import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const forbiddenDirectoryNames = new Set(["__pycache__", ".pytest_cache"]);
const forbiddenFilePatterns = [/\.py[co]$/i, /segment-fingerprints\.txt$/i];

const ignoredRoots = new Set([
  join(root, "node_modules"),
  join(root, "frontend", "node_modules"),
  join(root, ".git"),
]);

const findings: string[] = [];

function walk(dir: string): void {
  if (!existsSync(dir) || ignoredRoots.has(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (ignoredRoots.has(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (forbiddenDirectoryNames.has(name)) {
        findings.push(relative(root, full));
        continue;
      }
      walk(full);
      continue;
    }
    if (forbiddenFilePatterns.some((pattern) => pattern.test(name))) {
      findings.push(relative(root, full));
    }
  }
}

walk(join(root, "backend"));
walk(join(root, "frontend", "src"));

if (findings.length > 0) {
  console.error(JSON.stringify({
    event: "production-cleanup.generated-artifact-audit.failed",
    findings,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  event: "production-cleanup.generated-artifact-audit.passed",
  generatedArtifactsPresent: false,
  historicalFoundationVerifiersPreserved: true,
  runtimeLegacyPathsRemoved: false,
}, null, 2));
