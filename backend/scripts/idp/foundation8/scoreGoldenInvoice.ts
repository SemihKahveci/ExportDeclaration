import fs from "node:fs";
import { loadGoldenCase } from "./goldenCorpus.js";
import { scoreGoldenInvoice } from "./goldenCorpusScorer.js";
import type { Foundation8ActualInvoice } from "./goldenCorpus.types.js";

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const caseId = value("--case");
const actualPath = value("--actual");
if (!caseId || !actualPath) throw new Error("Usage: npx tsx .../scoreGoldenInvoice.ts --case <id> --actual <actual.json>");
const actual = JSON.parse(fs.readFileSync(actualPath, "utf8")) as Foundation8ActualInvoice;
const result = scoreGoldenInvoice(loadGoldenCase(caseId), actual);
console.log(JSON.stringify({ event: "foundation-8.0.golden-invoice-scored", ...result }, null, 2));
if (!result.pass) process.exitCode = 1;
