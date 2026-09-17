import assert from "node:assert/strict";
import { CandidateExtractionStatus, type CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";
import { CandidateResolutionStatus } from "../../src/modules/idp/domain/candidateResolution.types.js";
import { FieldLlmResolveDecision, type FieldLlmProvider, type FieldLlmResolveRequest, type FieldLlmResolveResponse } from "../../src/modules/idp/domain/fieldLlmResolve.types.js";
import type { FieldCandidate } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { resolveCandidatesWithLlm } from "../../src/modules/idp/llm/resolveCandidatesWithLlm.js";

function fc(id: string, field: string, value: unknown, confidence = 0.9): FieldCandidate { return { candidateId: id, field, value, confidence, extractor: "test", evidence: [{ segmentId: "segment-001", pageNumber: 1, text: String(value), contentSource: "NATIVE_TEXT" }] }; }
function envelope(fields: Record<string, FieldCandidate[]>): CandidateExtractionEnvelope { return { version: "1", segments: [{ segmentId: "segment-001", documentType: ClassifiedDocumentType.INVOICE, status: CandidateExtractionStatus.EXTRACTED, extractor: "invoice-canonical-v1", pageNumbers: [1], data: { goodsLines: [{ lineNo: 1, hsCode: "OLD", productCode: "OLD" }], fieldCandidates: { version: "1", fields } } }] }; }
class FakeFieldProvider implements FieldLlmProvider { readonly name="fake-field-qwen"; calls=0; constructor(private handler:(r:FieldLlmResolveRequest)=>Promise<FieldLlmResolveResponse>){} async resolveFieldCandidates(r:FieldLlmResolveRequest){this.calls++; return this.handler(r);} }
function response(selections: Array<{field:string;candidateId:string}>, overrides: Partial<FieldLlmResolveResponse> = {}): FieldLlmResolveResponse { return { version:"1", decision:FieldLlmResolveDecision.RESOLVED, selections, issues:[], model:"qwen-test", provider:"fake-field-qwen", ...overrides }; }

async function main() {
  const cases: Array<Record<string, unknown>>=[];
  {
    const p=new FakeFieldProvider(async()=>response([]));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","853620900019")]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.RESOLVED); assert.equal(p.calls,0); assert.equal(r.fieldResolution?.fields["goodsLines.0.hsCode"]?.method,"SINGLE_VALUE");
    cases.push({name:"single-value-no-llm",providerCalls:p.calls});
  }
  {
    const p=new FakeFieldProvider(async()=>response([]));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","853620900019"),fc("h2","goodsLines.0.hsCode","853620900019",.95)]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.RESOLVED); assert.equal(p.calls,0); assert.equal(r.fieldResolution?.fields["goodsLines.0.hsCode"]?.method,"CONSENSUS");
    cases.push({name:"consensus-no-llm",providerCalls:p.calls});
  }
  {
    const p=new FakeFieldProvider(async()=>response([{field:"goodsLines.0.hsCode",candidateId:"h2"}]));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","853620900019"),fc("h2","goodsLines.0.hsCode","853620100019")]}),{llmEnabled:false,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.REVIEW_REQUIRED); assert.equal(r.issues[0]?.code,"FIELD_CANDIDATE_AMBIGUITY"); assert.equal(p.calls,0);
    cases.push({name:"ambiguity-llm-disabled",providerCalls:p.calls});
  }
  {
    const p=new FakeFieldProvider(async()=>response([{field:"goodsLines.0.hsCode",candidateId:"h2"}]));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","853620900019"),fc("h2","goodsLines.0.hsCode","853620100019")]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.RESOLVED); assert.equal(p.calls,1); assert.equal(r.fieldResolution?.fields["goodsLines.0.hsCode"]?.method,"LLM"); assert.equal((r.data?.goodsLines as any[])[0].hsCode,"853620100019"); assert.deepEqual(r.llmAudit,{provider:"fake-field-qwen",model:"qwen-test"});
    cases.push({name:"allowed-candidate-selected",providerCalls:p.calls,value:(r.data?.goodsLines as any[])[0].hsCode});
  }
  {
    const p=new FakeFieldProvider(async()=>response([{field:"goodsLines.0.hsCode",candidateId:"hallucinated"}]));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","853620900019"),fc("h2","goodsLines.0.hsCode","853620100019")]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.REVIEW_REQUIRED); assert.equal(r.issues[0]?.code,"FIELD_LLM_INVALID_SELECTION"); assert.equal(r.data,undefined);
    cases.push({name:"hallucinated-candidate-rejected",issue:r.issues[0]?.code});
  }
  {
    const p=new FakeFieldProvider(async()=>response([{field:"goodsLines.0.hsCode",candidateId:"h1"}],{decision:FieldLlmResolveDecision.REVIEW_REQUIRED,issues:[{code:"AMBIGUOUS",message:"insufficient evidence"}]}));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","A"),fc("h2","goodsLines.0.hsCode","B")]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.REVIEW_REQUIRED); assert.equal(r.issues[0]?.code,"FIELD_LLM_REVIEW_REQUIRED");
    cases.push({name:"llm-review-required",issue:r.issues[0]?.code});
  }
  {
    const p=new FakeFieldProvider(async()=>{throw new Error("mock timeout");});
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","A"),fc("h2","goodsLines.0.hsCode","B")]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.REVIEW_REQUIRED); assert.equal(r.issues[0]?.code,"FIELD_LLM_RESOLUTION_FAILED");
    cases.push({name:"provider-failure",issue:r.issues[0]?.code});
  }
  {
    const p=new FakeFieldProvider(async()=>response([{field:"goodsLines.0.hsCode",candidateId:"h2"},{field:"goodsLines.0.productCode",candidateId:"p1"}]));
    const r=await resolveCandidatesWithLlm(envelope({"goodsLines.0.hsCode":[fc("h1","goodsLines.0.hsCode","A"),fc("h2","goodsLines.0.hsCode","B")],"goodsLines.0.productCode":[fc("p1","goodsLines.0.productCode","P1"),fc("p2","goodsLines.0.productCode","P2")]}),{llmEnabled:true,fieldProvider:p});
    assert.equal(r.status,CandidateResolutionStatus.RESOLVED); assert.equal(r.fieldResolution?.summary.ambiguousCount,0); assert.equal((r.data?.goodsLines as any[])[0].hsCode,"B"); assert.equal((r.data?.goodsLines as any[])[0].productCode,"P1");
    cases.push({name:"multiple-ambiguous-fields",resolved:r.fieldResolution?.summary.resolvedCount});
  }
  console.log(JSON.stringify({event:"idp.field-llm-resolver-integration.regression.passed",cases},null,2));
}
main().catch((error)=>{console.error(JSON.stringify({event:"idp.field-llm-resolver-integration.regression.failed",error:error instanceof Error?error.message:String(error)},null,2));process.exit(1);});
