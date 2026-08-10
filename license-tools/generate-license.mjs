import { createPrivateKey, randomUUID, sign } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);

function parseArguments(args) {
  const result = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Eksik değer: --${key}`);
    }

    result[key] = value;
    index += 1;
  }

  return result;
}

function requireArgument(args, name) {
  const value = args[name];

  if (!value || !value.trim()) {
    throw new Error(`Zorunlu parametre eksik: --${name}`);
  }

  return value.trim();
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} pozitif tam sayı olmalı.`);
  }

  return parsed;
}

function parseDate(value, name) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} geçerli bir tarih olmalı.`);
  }

  return date;
}

const args = parseArguments(process.argv.slice(2));

const customer = requireArgument(args, "customer");
const installationId = requireArgument(args, "installation-id");

const privateKeyPath = resolve(
  currentDirectory,
  "keys/private-key.pem"
);

if (!existsSync(privateKeyPath)) {
  throw new Error(`Private key bulunamadı: ${privateKeyPath}`);
}

const issuedAt = args["issued-at"]
  ? parseDate(args["issued-at"], "--issued-at")
  : new Date();

let expiresAt;

if (args["expires-at"]) {
  expiresAt = parseDate(args["expires-at"], "--expires-at");
} else {
  const days = args.days
    ? parsePositiveInteger(args.days, "--days")
    : 365;

  expiresAt = new Date(
    issuedAt.getTime() + days * 24 * 60 * 60 * 1000
  );
}

if (expiresAt.getTime() <= issuedAt.getTime()) {
  throw new Error("Bitiş tarihi başlangıç tarihinden sonra olmalı.");
}

const features = args.features
  ? args.features
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean)
  : [
      "invoice-parser",
      "gtip-management",
    ];

if (features.length === 0) {
  throw new Error("En az bir özellik tanımlanmalı.");
}

const safeCustomerName = customer
  .normalize("NFKD")
  .replace(/[^\w\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-")
  .toLowerCase();

const licenseId =
  args["license-id"] ??
  `LIC-${issuedAt.getUTCFullYear()}-${randomUUID()}`;

const payload = {
  licenseId,
  customer,
  installationId,
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  features,
};

const serializedPayload = JSON.stringify(payload);
const privateKeyPem = readFileSync(privateKeyPath, "utf8");
const privateKey = createPrivateKey(privateKeyPem);

const signature = sign(
  null,
  Buffer.from(serializedPayload, "utf8"),
  privateKey
).toString("base64");

const licenseDocument = {
  payload,
  signature,
};

const outputDirectory = resolve(
  currentDirectory,
  "../generated-licenses",
  safeCustomerName || "customer"
);

mkdirSync(outputDirectory, {
  recursive: true,
});

const outputPath = resolve(
  outputDirectory,
  `${licenseId}.license.json`
);

writeFileSync(
  outputPath,
  JSON.stringify(licenseDocument, null, 2),
  "utf8"
);

console.log("Lisans oluşturuldu:");
console.log(outputPath);
console.log("");
console.log(`Müşteri: ${customer}`);
console.log(`Lisans ID: ${licenseId}`);
console.log(`Kurulum ID: ${installationId}`);
console.log(`Başlangıç: ${payload.issuedAt}`);
console.log(`Bitiş: ${payload.expiresAt}`);
console.log(`Özellikler: ${features.join(", ")}`);