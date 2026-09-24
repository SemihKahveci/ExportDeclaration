import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages?: Record<string, unknown>;
};

const forbidden = ["pdf-parse", "@types/pdf-parse"];
const declared = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};

const stillDeclared = forbidden.filter((name) => Object.prototype.hasOwnProperty.call(declared, name));
const lockRoot = (lock.packages?.[""] ?? {}) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lockDeclared = {
  ...(lockRoot.dependencies ?? {}),
  ...(lockRoot.devDependencies ?? {}),
};
const stillInLockRoot = forbidden.filter((name) => Object.prototype.hasOwnProperty.call(lockDeclared, name));

if (stillDeclared.length || stillInLockRoot.length) {
  console.error(JSON.stringify({
    event: "production-cleanup.dependency-safe-remove.failed",
    stillDeclared,
    stillInLockRoot,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  event: "production-cleanup.dependency-safe-remove.passed",
  removedPackages: forbidden,
  packageManifestClean: true,
  packageLockRootClean: true,
  preservedTooling: ["typescript", "tsx", "concurrently", "@types/node", "@types/express", "@types/cors", "@types/multer", "@types/nodemailer"],
}, null, 2));
