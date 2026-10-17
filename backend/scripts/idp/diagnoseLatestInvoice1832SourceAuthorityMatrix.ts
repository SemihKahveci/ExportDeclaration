import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";

type Target = { ui: string; f6: string; normalized: string };

const targets: Target[] = [
  { ui: "Fatura No", f6: "header.invoiceNo", normalized: "header.invoiceNo" },
  { ui: "Fatura Tarihi", f6: "header.invoiceDate", normalized: "header.invoiceDate" },
  { ui: "Fatura Toplamı", f6: "totalAmount", normalized: "header.totalAmount" },
  { ui: "Döviz", f6: "currency", normalized: "header.currency" },
  { ui: "Gönderici", f6: "parties.seller.name", normalized: "parties.seller.name" },
  { ui: "Gönderici Adresi", f6: "parties.seller.address", normalized: "parties.seller.address" },
  { ui: "Gönderici Ülke", f6: "parties.seller.country", normalized: "parties.seller.country" },
  { ui: "Alıcı", f6: "parties.buyer.name", normalized: "parties.buyer.name" },
  { ui: "Alıcı Adresi", f6: "parties.buyer.address", normalized: "parties.buyer.address" },
  { ui: "Alıcı Ülke", f6: "parties.buyer.country", normalized: "parties.buyer.country" },
  { ui: "Teslim Şekli", f6: "deliveryTerm", normalized: "trade.deliveryTerm" },
  { ui: "Ödeme Şekli", f6: "paymentType", normalized: "trade.paymentType" },
  { ui: "Menşe Ülke", f6: "originCountry", normalized: "trade.origin" },
  { ui: "Çıkış Ülkesi", f6: "exitCountry", normalized: "trade.exitCountry" },
  { ui: "Varış Ülkesi", f6: "arrivalCountry", normalized: "trade.arrivalCountry" },
  { ui: "Gideceği Ülke", f6: "destinationCountry", normalized: "trade.destinationCountry" },
  { ui: "Ticaret Yapılan Ülke", f6: "tradeCountry", normalized: "trade.tradeCountry" },
  { ui: "Taşıma Şekli", f6: "transportMode", normalized: "transport.mode" },
  { ui: "Taşıyıcı", f6: "carrier", normalized: "transport.carrier" },
  { ui: "Çıkış Araç Kimliği", f6: "departureVehicleId", normalized: "transport.departureVehicleId" },
  { ui: "Sınır Araç Kimliği", f6: "borderVehicleId", normalized: "transport.borderVehicleId" },
  { ui: "Araç Plakası", f6: "vehiclePlate", normalized: "transport.vehiclePlate" },
  { ui: "Konteyner No", f6: "containerNo", normalized: "transport.containerNo" },
  { ui: "Konşimento No", f6: "billOfLadingNo", normalized: "transport.billOfLadingNo" },
  { ui: "CMR No", f6: "cmrNo", normalized: "transport.cmrNo" },
  { ui: "AWB No", f6: "awbNo", normalized: "transport.awbNo" },
  { ui: "Taşıma Belgesi No", f6: "transportDocumentNo", normalized: "transport.transportDocumentNo" },
  { ui: "Döviz Kuru", f6: "exchangeRate", normalized: "finance.exchangeRate" },
  { ui: "Navlun", f6: "freight", normalized: "finance.freight" },
  { ui: "Sigorta", f6: "insurance", normalized: "finance.insurance" },
  { ui: "Finansal / Banka Bilgisi", f6: "bankInfo", normalized: "finance.bankInfo" },
  { ui: "Kap Adedi", f6: "totalPackage", normalized: "packageInfo.totalPackage" },
  { ui: "Kap Cinsi", f6: "packageType", normalized: "packageInfo.packageType" },
  { ui: "Brüt Kilo", f6: "grossWeight", normalized: "packageInfo.grossKg" },
  { ui: "Net Kilo", f6: "netWeight", normalized: "packageInfo.netKg" }
];

function get(obj: any, path: string): unknown {
  return path.split(".").reduce((v: any, key) => v == null ? undefined : v[key], obj);
}
function present(v: unknown): boolean {
  return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run, "No completed ProcessingRun found for latest INVOICE upload.");
    const declaration: any = await DeclarationModel.findById(upload.declarationId).lean();
    assert(declaration, "No declaration found for latest INVOICE upload.");
    const resolutionRun: any = await DeclarationFieldResolutionRunModel.findOne({ declarationId: upload.declarationId }).sort({ createdAt: -1 }).lean();

    const fields = run?.declarationCandidates?.fields ?? {};
    const resolutionFields = resolutionRun?.resolution?.fields ?? {};
    const rows = targets.map((target) => {
      const candidates = Array.isArray(fields[target.f6]) ? fields[target.f6] : [];
      const f6 = resolutionFields[target.f6];
      const normalizedValue = get(declaration.normalizedData, target.normalized);
      const sourcePresent = candidates.length > 0;
      const f6Resolved = f6?.status === "RESOLVED";
      let classification: string;
      if (sourcePresent && f6Resolved && present(normalizedValue)) classification = "SOURCE_PRESENT_RESOLVED_PROMOTED";
      else if (sourcePresent && f6Resolved) classification = "SOURCE_PRESENT_RESOLVED_NOT_PROMOTED";
      else if (sourcePresent && f6?.status === "REVIEW_REQUIRED") classification = "SOURCE_PRESENT_REVIEW_REQUIRED";
      else if (sourcePresent) classification = "SOURCE_PRESENT_UNRESOLVED";
      else if (present(normalizedValue)) classification = "NORMALIZED_WITHOUT_CURRENT_DOCUMENT_CANDIDATE";
      else classification = "SOURCE_ABSENT_FAIL_CLOSED";
      return {
        ui: target.ui,
        field: target.f6,
        classification,
        candidateCount: candidates.length,
        candidateValues: [...new Set(candidates.map((c: any) => c.value))].slice(0, 8),
        foundation6: f6 ? { status: f6.status, value: f6.value, reason: f6.reason } : null,
        normalizedValue: present(normalizedValue) ? normalizedValue : null
      };
    });

    const counts = rows.reduce((acc: Record<string, number>, row) => {
      acc[row.classification] = (acc[row.classification] ?? 0) + 1;
      return acc;
    }, {});
    const actionable = rows.filter((r) => r.classification === "SOURCE_PRESENT_RESOLVED_NOT_PROMOTED" || r.classification === "SOURCE_PRESENT_REVIEW_REQUIRED" || r.classification === "SOURCE_PRESENT_UNRESOLVED");

    console.log(JSON.stringify({
      event: "product-e2e-1.8.32.source-authority-matrix.diagnosed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary: { fieldCount: rows.length, classifications: counts, actionableDocumentOwnedGapCount: actionable.length },
      actionableDocumentOwnedGaps: actionable,
      matrix: rows,
      interpretation: {
        sourceAbsentFailClosed: "No current document candidate and no promoted value: do not invent a value.",
        sourcePresentReviewRequired: "Document evidence exists but Foundation 6 intentionally requires review.",
        sourcePresentUnresolved: "Document evidence exists but no current Foundation 6 resolution is available.",
        resolvedNotPromoted: "Foundation 6 resolved a value but normalizedData did not receive it; this is a promotion/orchestration gap."
      },
      guardrails: { diagnosticOnly: true, persistedEvidenceOnly: true, ocrOrModelInference: false, databaseMutation: false, supplierSpecificRules: false, invoiceSpecificConstants: false }
    }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
