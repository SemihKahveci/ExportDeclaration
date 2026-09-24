import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const root = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredNames = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const sourceFiles: string[] = [];

function walk(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (ignoredNames.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (sourceExtensions.has(extname(name))) sourceFiles.push(full);
  }
}

walk(join(root, "backend"));
walk(join(root, "frontend", "src"));
for (const config of [
  "frontend/vite.config.ts",
  "frontend/eslint.config.js",
  "frontend/tailwind.config.js",
  "frontend/postcss.config.js",
]) {
  const full = join(root, config);
  if (existsSync(full)) sourceFiles.push(full);
}

const texts = sourceFiles.map((file) => ({
  file,
  text: readFileSync(file, "utf8"),
}));

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function packageUsed(name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`from\\s+["']${escaped}(?:/[^"']*)?["']`),
    new RegExp(`import\\s*\\(\\s*["']${escaped}(?:/[^"']*)?["']\\s*\\)`),
    new RegExp(`require\\(\\s*["']${escaped}(?:/[^"']*)?["']\\s*\\)`),
  ];
  return texts.some(({ text }) => patterns.some((pattern) => pattern.test(text)));
}

function auditPackage(packageJsonPath: string) {
  const pkg = readPackageJson(packageJsonPath);
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  return Object.keys(deps)
    .filter((name) => !packageUsed(name))
    .sort();
}

const rootPackage = join(root, "package.json");
const frontendPackage = join(root, "frontend", "package.json");

const report = {
  event: "production-cleanup.dependency-runtime-audit.completed",
  sourceFilesScanned: sourceFiles.length,
  packageEvidence: {
    rootUnreferencedCandidates: existsSync(rootPackage) ? auditPackage(rootPackage) : [],
    frontendUnreferencedCandidates: existsSync(frontendPackage) ? auditPackage(frontendPackage) : [],
  },
  protectedDynamicEntrypoints: [
    "npm scripts and CLI packages may be valid without source imports",
    "TypeScript/compiler/build/test packages may be valid without source imports",
    "Express route/model/worker registration may be dynamic",
    "historical Foundation verifier scripts remain protected",
  ],
  automaticDeletionPerformed: false,
  decision: "AUDIT_ONLY",
};

console.log(JSON.stringify(report, null, 2));
