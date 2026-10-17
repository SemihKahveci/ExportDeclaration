import fs from "node:fs";
import path from "node:path";
import type { GoldenInvoiceCase } from "./goldenCorpus.types.js";

export const FOUNDATION8_GOLDEN_ROOT = path.resolve(process.cwd(), "backend", "scripts", "idp", "foundation8", "evals", "invoices");

export function loadGoldenCase(id: string): GoldenInvoiceCase {
  const file = path.join(FOUNDATION8_GOLDEN_ROOT, `${id}.expected.json`);
  if (!fs.existsSync(file)) throw new Error(`Unknown Foundation 8 golden case: ${id}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as GoldenInvoiceCase;
}

export function loadAllGoldenCases(): GoldenInvoiceCase[] {
  return fs.readdirSync(FOUNDATION8_GOLDEN_ROOT)
    .filter(name => name.endsWith(".expected.json"))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(FOUNDATION8_GOLDEN_ROOT, name), "utf8")) as GoldenInvoiceCase);
}
