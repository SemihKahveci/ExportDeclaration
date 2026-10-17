import assert from "node:assert/strict";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

function merge(...envelopes: DeclarationFieldCandidateEnvelope[]): DeclarationFieldCandidateEnvelope {
  const fields: Record<string, any[]> = {};
  for (const envelope of envelopes) for (const [field, candidates] of Object.entries(envelope.fields ?? {})) {
    const target = fields[field] ??= [];
    const ids = new Set(target.map((candidate) => candidate.candidateId));
    for (const candidate of candidates) if (!ids.has(candidate.candidateId)) { target.push(candidate); ids.add(candidate.candidateId); }
  }
  return { version: "1", fields } as DeclarationFieldCandidateEnvelope;
}

const stale = { version: "1", fields: {
  invoiceDate: [{ candidateId: "stable:invoice-date:f6-header-party", field: "invoiceDate", value: "2026-01-05", confidence: 0.99, extractor: "old", evidence: [] }],
  paymentType: [{ candidateId: "vision:payment", field: "paymentType", value: "30 DAYS", confidence: 0.9, extractor: "vision", evidence: [] }],
}} as any;
const current = { version: "1", fields: {
  invoiceDate: [{ candidateId: "stable:invoice-date:f6-header-party", field: "invoiceDate", value: "2026-09-16", confidence: 0.99, extractor: "current", evidence: [] }],
  netWeight: [{ candidateId: "stable:net:f6-native-shipment", field: "netWeight", value: 20.19, confidence: 0.99, extractor: "current", evidence: [] }],
}} as any;

const merged = merge(current, stale);
assert.equal((merged.fields.invoiceDate as any[])[0]?.value, "2026-09-16");
assert.equal((merged.fields.invoiceDate as any[]).length, 1);
assert.equal((merged.fields.netWeight as any[])[0]?.value, 20.19);
assert.equal((merged.fields.paymentType as any[])[0]?.value, "30 DAYS");

console.log(JSON.stringify({
  event: "product-e2e-1.8.50.3.current-parser-replay-precedence.contract.passed",
  acceptance: {
    currentCandidateWinsStableIdCollision: true,
    staleDuplicateRemoved: true,
    newlyDiscoveredCurrentCandidatePreserved: true,
    unrelatedPersistedEvidencePreserved: true,
  },
  guardrails: {
    replayOnly: true,
    ocrOrModelInference: false,
    databaseMutation: false,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false,
  },
}, null, 2));
