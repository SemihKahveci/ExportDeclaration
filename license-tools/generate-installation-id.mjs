import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);

const outputPath = resolve(
  currentDirectory,
  "../license-data/installation-id.txt"
);

if (existsSync(outputPath)) {
  console.error("Kurulum kimliği zaten mevcut:");
  console.error(outputPath);
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });

const installationId = randomUUID();

writeFileSync(outputPath, installationId, "utf8");

console.log("Kurulum kimliği oluşturuldu:");
console.log(installationId);
console.log("");
console.log(`Dosya: ${outputPath}`);