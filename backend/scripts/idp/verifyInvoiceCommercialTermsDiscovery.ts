import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const fixtures = [
  { runId:"6aad3238ca6e4f9c2d155501", contentSource:"NATIVE_TEXT", expectedDelivery:"FCA", expectedTransport:"Karayolu" },
  { runId:"6aad3295ca6e4f9c2d155513", contentSource:"OCR", expectedDelivery:"FCA", expectedTransport:"Karayolu" },
] as const;

function first(fields:Record<string, any[]>, field:string){
  const values=fields[field]??[];
  assert.equal(values.length,1,`${field}: exactly one canonical candidate expected`);
  return values[0]!;
}
function assertEvidence(c:any, source:string){
  assert.ok(c.evidence?.length,`${c.field}: evidence missing`);
  assert.equal(c.evidence[0].contentSource,source,`${c.field}: contentSource mismatch`);
  assert.ok(String(c.evidence[0].text??"").trim(),`${c.field}: evidence text missing`);
}

async function main(){
  await mongoose.connect(env.mongoUri);
  try{
    const results=[];
    for(const f of fixtures){
      const run=await ProcessingRunModel.findById(f.runId).lean();
      assert.ok(run?.canonicalDocument,`canonicalDocument missing: ${f.runId}`);
      const envelope=discoverInvoiceCommercialTermsFieldCandidates(
        run.canonicalDocument as CanonicalDocument,
        String((run.candidates as any)?.segments?.[0]?.segmentId ?? "segment-001"),
      );
      const delivery=first(envelope.fields,"trade.deliveryTerm");
      const transport=first(envelope.fields,"transport.mode");
      assert.equal(delivery.value,f.expectedDelivery);
      assert.equal(transport.value,f.expectedTransport);
      assertEvidence(delivery,f.contentSource);
      assertEvidence(transport,f.contentSource);

      const currency=first(envelope.fields,"header.currency");
      const total=first(envelope.fields,"header.totalAmount");
      assert.equal(currency.value,"EUR","invoice currency must come from invoice-total evidence");
      assertEvidence(currency,f.contentSource);
      assertEvidence(total,f.contentSource);
      assert.equal(
        currency.evidence?.[0]?.text,
        total.evidence?.[0]?.text,
        "currency and totalAmount must share canonical invoice-total evidence",
      );

      results.push({
        runId:f.runId,
        deliveryTerm:delivery.value,
        transportMode:transport.value,
        currency:currency?.value ?? null,
        totalAmount:total?.value ?? null,
        currencyEvidence:currency?.evidence?.[0]?.text ?? null,
        totalAmountEvidence:total?.evidence?.[0]?.text ?? null,
        contentSource:f.contentSource,
      });
    }
    console.log(JSON.stringify({event:"idp.invoice-commercial-terms.discovery.regression.passed",results},null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
