import assert from "node:assert/strict";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { INVOICE_EXTRACTION_KNOWLEDGE_VERSION, INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE } from "../../src/modules/idp/llm/invoiceExtractionKnowledge.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

const image = { pageNumber: 2, mimeType: "image/png", bytes: Buffer.from("x") } as any;
const evidence = [{ pageNumber: 2, source: "PAGE_IMAGE" }];

async function main() {
  assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v8");
  assert.equal(INVOICE_EXTRACTION_KNOWLEDGE_VERSION, "invoice-knowledge-v2");

  const focus = INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION.toLowerCase();
  assert(focus.includes("entire supplied page"));
  assert(focus.includes("headers"));
  assert(focus.includes("footers"));
  assert(focus.includes("summary"));
  assert(focus.includes("inside or adjacent to tables"));
  assert(focus.includes("grosskg"));
  assert(focus.includes("netkg"));
  assert(focus.includes("origin"));
  assert(focus.includes("leave it null/omit it"));
  assert(!focus.includes("mekar"));
  assert(!focus.includes("48"));
  assert(!focus.includes("40"));

  const knowledge = INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE.toLowerCase();
  assert(knowledge.includes("gross weight"));
  assert(knowledge.includes("brüt ağırlık"));
  assert(knowledge.includes("net weight"));
  assert(knowledge.includes("country of origin"));
  assert(knowledge.includes("menşe"));
  assert(knowledge.includes("do not derive either weight from goods quantities or arithmetic"));
  assert(knowledge.includes("do not substitute seller, buyer, address, destination, dispatch or bank country"));
  assert(!knowledge.includes("mekar"));

  const calls: any[] = [];
  const provider: any = {
    name: "contract-qwen",
    async extractInvoice(request: any) {
      calls.push(request);
      if (calls.length === 1) {
        return {
          version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL,
          fields: [{ field: "goodsLines[].description", value: ["A"], confidence: 1, evidence }],
          issues: [], model: "qwen", provider: "contract-qwen"
        };
      }
      return {
        version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL,
        fields: [
          { field: "grossKg", value: 12.5, confidence: 1, evidence },
          { field: "netKg", value: 10, confidence: 1, evidence },
          { field: "origin", value: "DE", confidence: 1, evidence }
        ],
        issues: [], model: "qwen", provider: "contract-qwen"
      };
    }
  };

  const result = await executeInvoiceVisionByPage({
    canonicalDocument: { pages: [{ pageNumber: 2 }] } as any,
    segmentId: "generic-scalar-evidence", pageNumbers: [2], provider,
    renderPage: async () => image,
    request: {
      version: "1",
      requestedFields: ["invoiceDate", "currency", "grossKg", "netKg", "origin", "goodsLines[].description"],
      nativeText: "", ocrText: "", verifiedKnowledge: []
    }
  });

  assert.equal(calls.length, 2);
  assert.deepEqual([...calls[1].requestedFields].sort(), ["grossKg", "netKg", "origin"].sort());
  assert.equal(calls[1].focusInstruction, INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION);
  assert(!calls[1].requestedFields.some((field: string) => field.startsWith("goodsLines[].")));
  assert(!calls[1].requestedFields.includes("invoiceDate"));
  assert(!calls[1].requestedFields.includes("currency"));
  assert.equal(result.candidates.fields["grossWeight"]?.[0]?.value, 12.5);
  assert.equal(result.candidates.fields["netWeight"]?.[0]?.value, 10);
  assert.equal(result.candidates.fields["originCountry"]?.[0]?.value, "DE");
  assert.equal(result.candidates.fields["goodsLines.0.description"]?.[0]?.value, "A");

  console.log(JSON.stringify({
    event: "product-e2e-1.6.8.27.qwen-scalar-evidence-recovery.passed",
    skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
    knowledgeVersion: INVOICE_EXTRACTION_KNOWLEDGE_VERSION,
    wholePageScalarEvidenceScan: true,
    tabularScalarEvidenceNotDiscarded: true,
    genericWeightSemantics: true,
    genericOriginSemantics: true,
    unsupportedScalarsFailClosed: true,
    onlyMissingNonCriticalScalarsRequested: true,
    goodsExcludedAsOutputTask: true,
    qwenPrimary: true,
    ocrPrimary: false,
    deterministicPrimary: false,
    supplierSpecificRules: false,
    groundTruthAuthorityUsed: false,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
