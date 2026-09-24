import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, basename } from "node:path";

const root = process.cwd();
const sourceExts = new Set([".ts", ".tsx", ".js", ".jsx", ".py"]);
const ignored = new Set(["node_modules", ".git", "dist", "__pycache__", ".pytest_cache"]);
const sourceFiles: string[] = [];

function walk(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (sourceExts.has(extname(name))) sourceFiles.push(full);
  }
}

walk(join(root, "backend"));
walk(join(root, "frontend", "src"));

const texts = new Map(sourceFiles.map((file) => [file, readFileSync(file, "utf8")]));
const candidates: string[] = [];

for (const file of sourceFiles) {
  const rel = relative(root, file).replaceAll("\\\\", "/");
  // Verification/migration/CLI scripts are entrypoints by design and cannot be classified as dead by import graph.
  if (rel.includes("/scripts/")) continue;
  const name = basename(file);
  const stem = name.replace(/\.[^.]+$/, "");
  let referenced = false;
  for (const [other, text] of texts) {
    if (other === file) continue;
    if (text.includes(name) || text.includes(stem)) {
      referenced = true;
      break;
    }
  }
  if (!referenced) candidates.push(rel);
}

console.log(JSON.stringify({
  event: "production-cleanup.dead-code-audit.completed",
  sourceFilesScanned: sourceFiles.length,
  heuristicCandidates: candidates,
  automaticDeletionPerformed: false,
  note: "Candidates are evidence only; dynamic entrypoints, route mounts and model registration require manual confirmation before deletion."
}, null, 2));
