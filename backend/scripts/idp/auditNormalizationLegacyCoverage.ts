import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedDocumentModel } from "../../src/modules/documents/document.model.js";

const fixtures = [
  { declarationId: "6aad3237ca6e4f9c2d1554f5", name: "0146" },
  { declarationId: "6aad3295ca6e4f9c2d155507", name: "0110" },
] as const;

const fields = [
  "header.invoiceNo","header.invoiceDate","header.currency","header.totalAmount",
  "parties.seller.name","parties.seller.taxNo","parties.seller.address","parties.seller.country",
  "parties.buyer.name","parties.buyer.taxNo","parties.buyer.address","parties.buyer.country",
  "parties.notify.name","parties.notify.taxNo","parties.notify.address","parties.notify.country",
  "trade.deliveryTerm","trade.paymentType","trade.origin","transport.mode",
  "packageInfo.totalPackage","packageInfo.packageType","packageInfo.grossKg","packageInfo.netKg"
] as const;

function get(obj: any, path: string): unknown {
  return path.split(".").reduce((cur, key) => cur == null ? undefined : cur[key], obj);
}
function present(v: unknown): boolean {
  return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
}
function classify(trace: any, value: unknown): string {
  if (!present(value)) return "MISSING";
  if (trace?.source === "IDP_GENERIC") return "CANONICAL";
  if (trace?.source === "HUMAN_REVIEW") return "HUMAN_REVIEW";
  if (trace?.source) return `LEGACY:${trace.source}`;
  return "DERIVED_OR_UNTRACED";
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const results: any[] = [];
    const aggregate = new Map<string, Set<string>>();

    for (const fixture of fixtures) {
      const declaration: any = await DeclarationModel.findById(fixture.declarationId).lean();
      assert(declaration, `declaration missing ${fixture.declarationId}`);
      const docs: any[] = await UploadedDocumentModel.find({
        companyId: declaration.companyId,
        declarationId: declaration._id
      }).lean();

      const rows = fields.map(field => {
        const value = get(declaration.normalizedData, field);
        const trace = declaration.sourceTrace?.[field];
        const status = classify(trace, value);
        (aggregate.get(field) ?? aggregate.set(field, new Set()).get(field)!).add(status);
        return { field, status, value: present(value) ? value : null, trace: trace ?? null };
      });

      const goods = Array.isArray(declaration.normalizedData?.goodsLines) ? declaration.normalizedData.goodsLines : [];
      const goodsSummary = {
        count: goods.length,
        originPresent: goods.filter((x:any)=>present(x.origin)).length,
        grossKgPresent: goods.filter((x:any)=>present(x.grossKg)).length,
        netKgPresent: goods.filter((x:any)=>present(x.netKg)).length,
      };

      results.push({
        fixture: fixture.name,
        declarationId: fixture.declarationId,
        normalizedStatus: declaration.status,
        fields: rows,
        goodsSummary,
        legacyDocumentSources: docs.map(doc => ({
          type: doc.type,
          extractionStatus: doc.extractionStatus,
          extractedTopLevelKeys: doc.extractedData && typeof doc.extractedData === "object"
            ? Object.keys(doc.extractedData).sort()
            : []
        }))
      });
    }

    const cleanupPlan = fields.map(field => ({
      field,
      observedStatuses: [...(aggregate.get(field) ?? new Set(["MISSING"]))].sort(),
      action:
        [...(aggregate.get(field) ?? [])].some(x => x.startsWith("LEGACY:"))
          ? "MIGRATE_FROM_LEGACY"
          : [...(aggregate.get(field) ?? [])].includes("DERIVED_OR_UNTRACED")
            ? "REMOVE_OR_REPLACE_DERIVATION"
            : [...(aggregate.get(field) ?? [])].every(x => x === "MISSING")
              ? "DEFINE_SOURCE_OR_DELETE_IF_UNUSED"
              : "KEEP"
    }));

    console.log(JSON.stringify({
      event: "idp.normalization.legacy-coverage-audit",
      fixtures: results,
      cleanupPlan
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
