import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);

const privateKeyPath = resolve(currentDirectory, "keys/private-key.pem");
const publicKeyPath = resolve(currentDirectory, "keys/public-key.pem");

mkdirSync(dirname(privateKeyPath), { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
});

writeFileSync(privateKeyPath, privateKey, {
  encoding: "utf8",
  mode: 0o600,
});

writeFileSync(publicKeyPath, publicKey, "utf8");

console.log("Lisans anahtarları oluşturuldu:");
console.log(`Private key: ${privateKeyPath}`);
console.log(`Public key:  ${publicKeyPath}`);
console.log("");
console.log("UYARI: private-key.pem dosyasını Git'e veya müşteriye gönderme.");