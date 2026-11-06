import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIELD_LABELS: Record<string, string> = {
  invoiceNo: "Fatura No",
  invoiceDate: "Fatura Tarihi",
  packageType: "Kap Cinsi",
  totalPackage: "Kap Adedi",
  address: "Adres",
  name: "Unvan",
  description: "Mal Tanımı",
};

function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const goods = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/.exec(field);
  if (goods) {
    const leaf = FIELD_LABELS[goods[2]!] ?? goods[2]!;
    return `${Number(goods[1]) + 1}. kalem · ${leaf}`;
  }
  const dotted = field.split(".");
  const leaf = dotted[dotted.length - 1] ?? field;
  if (FIELD_LABELS[leaf]) {
    if (field.includes("buyer")) return `Alıcı · ${FIELD_LABELS[leaf]}`;
    if (field.includes("seller")) return `Satıcı · ${FIELD_LABELS[leaf]}`;
    return FIELD_LABELS[leaf];
  }
  return field;
}

assert.equal(fieldLabel("invoiceDate"), "Fatura Tarihi");
assert.equal(fieldLabel("packageType"), "Kap Cinsi");
assert.equal(fieldLabel("parties.buyer.address"), "Alıcı · Adres");
assert.equal(fieldLabel("goodsLines.0.description"), "1. kalem · Mal Tanımı");
assert.equal(fieldLabel("unknownField"), "unknownField");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const documentsTs = fs.readFileSync(path.join(root, "frontend/src/services/documents.ts"), "utf8");
const optionsMatch = documentsTs.match(/export const DOCUMENT_TYPE_OPTIONS: string\[] = \[([\s\S]*?)\];/);
assert.ok(optionsMatch, "DOCUMENT_TYPE_OPTIONS bulunamadı");
const labels = [...optionsMatch[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
assert.equal(labels[0], "Fatura");
assert.equal(labels[1], "Invoice");

const liveApi = fs.readFileSync(path.join(root, "frontend/src/services/liveApi.ts"), "utf8");
assert.match(liveApi, /Invoice:\s*"EXPORT_INVOICE"/);

const fieldLabelsTs = fs.readFileSync(
  path.join(root, "frontend/src/pages/EvrakHazirlik/fieldLabels.ts"),
  "utf8"
);
assert.match(fieldLabelsTs, /invoiceDate:\s*'Fatura Tarihi'/);
assert.match(fieldLabelsTs, /packageType:\s*'Kap Cinsi'/);

const reviewTs = fs.readFileSync(
  path.join(root, "frontend/src/pages/EvrakHazirlik/IdpReviewTab.tsx"),
  "utf8"
);
assert.match(reviewTs, /Ne yapmalısınız/);
assert.doesNotMatch(reviewTs, /contentSource === 'DERIVED'\) return/);
assert.match(reviewTs, /Konum yok/);

const viewerTs = fs.readFileSync(
  path.join(root, "frontend/src/components/documents/DocumentEvidenceViewer.tsx"),
  "utf8"
);
assert.match(viewerTs, /işaretli bir kutuya bağlı değil/);

console.log("verifyFieldLabels: ok");
