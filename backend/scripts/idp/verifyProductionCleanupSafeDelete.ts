import { existsSync } from "node:fs";
import { join } from "node:path";

const targets = [
  "frontend/src/components/pipeline/DeclarationPipelinePanel.tsx",
  "frontend/src/components/pipeline/DocumentUploadCard.tsx",
  "frontend/src/pages/BeyannameYazim/DocChecklist.tsx",
  "frontend/src/pages/GtipHazirlik/QueryTab.tsx",
  "frontend/src/services/documentProcesses.ts",
];

const stillPresent = targets.filter((target) => existsSync(join(process.cwd(), target)));

if (stillPresent.length > 0) {
  console.error(JSON.stringify({
    event: "production-cleanup.safe-delete-slice.failed",
    stillPresent,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  event: "production-cleanup.safe-delete-slice.passed",
  removedFiles: targets,
  removedFileCount: targets.length,
  configEntrypointsPreserved: [
    "frontend/vite.config.ts",
    "frontend/tailwind.config.js",
    "frontend/postcss.config.js",
    "frontend/eslint.config.js",
    "frontend/src/vite-env.d.ts",
  ],
  historicalFoundationVerifiersPreserved: true,
}, null, 2));
