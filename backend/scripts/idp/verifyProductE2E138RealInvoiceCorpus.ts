import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "../../src/config/env.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { QwenVisionInvoiceProvider } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { renderInvoicePagesForVision } from "../../src/modules/idp/llm/renderInvoicePagesForVision.js";

type Check = { name: string; expected: string; actual: string; passed: boolean };
type Case = {
  id: string;
  pdf: string;
  checks: Array<
    | { kind: "text"; name: string; field: string; expected: string; first?: boolean }
    | { kind: "contains"; name: string; field: string; expected: string; needle: string }
    | { kind: "digits"; name: string; field: string; expected: string }
    | { kind: "number"; name: string; field: string; expected: number }
  >;
};

const ROOT = "/app/uploads/product-e2e";
const REQUESTED = [
  "invoiceNumber", "currency", "deliveryTerm",
  "goodsLines[].description", "goodsLines[].hsCode", "goodsLines[].quantity",
  "goodsLines[].unit", "goodsLines[].unitPrice", "goodsLines[].lineTotal"
];

const CASES: Case[] = [
  {
    id: "clk-celikel",
    pdf: "CLK2026000001021.pdf",
    checks: [
      { kind: "text", name: "invoiceNumber", field: "invoiceNumber", expected: "CLK2026000001021" },
      { kind: "text", name: "currency", field: "currency", expected: "EUR" },
      { kind: "text", name: "deliveryTerm", field: "deliveryTerm", expected: "EXW" },
      { kind: "contains", name: "description[0]", field: "goodsLines[].description", expected: "contains INVERTER HOUSING", needle: "INVERTER HOUSING" },
      { kind: "digits", name: "hsCode[0]", field: "goodsLines[].hsCode", expected: "761699909019" },
      { kind: "number", name: "quantity[0]", field: "goodsLines[].quantity", expected: 1600 },
      { kind: "text", name: "unit[0]", field: "goodsLines[].unit", expected: "ADET", first: true },
      { kind: "number", name: "unitPrice[0]", field: "goodsLines[].unitPrice", expected: 24.9378 },
      { kind: "number", name: "lineTotal[0]", field: "goodsLines[].lineTotal", expected: 39900.48 }
    ]
  },
  {
    id: "textilium",
    pdf: "792CD3D2-CAAE-4E7B-978F-C1FE94E50709.pdf",
    checks: [
      { kind: "text", name: "invoiceNumber", field: "invoiceNumber", expected: "TXT2026000000091" },
      { kind: "text", name: "currency", field: "currency", expected: "EUR" },
      { kind: "text", name: "deliveryTerm", field: "deliveryTerm", expected: "CIP" },
      { kind: "contains", name: "description[0]", field: "goodsLines[].description", expected: "contains ERKEK", needle: "ERKEK" },
      { kind: "digits", name: "hsCode[0]", field: "goodsLines[].hsCode", expected: "610510000000" },
      { kind: "number", name: "quantity[0]", field: "goodsLines[].quantity", expected: 569 },
      { kind: "text", name: "unit[0]", field: "goodsLines[].unit", expected: "ADET", first: true },
      { kind: "number", name: "unitPrice[0]", field: "goodsLines[].unitPrice", expected: 14.8 },
      { kind: "number", name: "lineTotal[0]", field: "goodsLines[].lineTotal", expected: 8421.20 }
    ]
  },
  {
    id: "makro-boya",
    pdf: "IHR2026000000035_FAISAL SOUDİ~21770191.pdf",
    checks: [
      { kind: "text", name: "invoiceNumber", field: "invoiceNumber", expected: "IHR2026000000035" },
      { kind: "text", name: "currency", field: "currency", expected: "USD" },
      { kind: "text", name: "deliveryTerm", field: "deliveryTerm", expected: "EXW" },
      { kind: "contains", name: "description[0]", field: "goodsLines[].description", expected: "contains TYLOSE 100000", needle: "TYLOSE 100000" },
      { kind: "digits", name: "hsCode[0]", field: "goodsLines[].hsCode", expected: "391239850000" },
      { kind: "number", name: "quantity[0]", field: "goodsLines[].quantity", expected: 1575 },
      { kind: "text", name: "unit[0]", field: "goodsLines[].unit", expected: "KG", first: true },
      { kind: "number", name: "unitPrice[0]", field: "goodsLines[].unitPrice", expected: 7.75 },
      { kind: "number", name: "lineTotal[0]", field: "goodsLines[].lineTotal", expected: 12206.25 }
    ]
  }
];

function fieldValue(fields: Array<{ field: string; value: unknown }>, name: string): unknown {
  return fields.find((field) => field.field === name)?.value;
}
function first(value: unknown): unknown { return Array.isArray(value) ? value[0] : value; }
function normalizedText(value: unknown): string {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}
function searchFold(value: unknown): string {
  return normalizedText(value).replace(/İ/g,"I").replace(/Ş/g,"S").replace(/Ğ/g,"G").replace(/Ü/g,"U").replace(/Ö/g,"O").replace(/Ç/g,"C");
}
function digits(value: unknown): string { return normalizedText(first(value)).replace(/\D/g,""); }
function localeNumberValue(value: unknown): number {
  const raw=normalizedText(first(value)).replace(/[^0-9,.-]/g,"");
  if(!raw) return Number.NaN;
  const comma=raw.lastIndexOf(","), dot=raw.lastIndexOf(".");
  let normalized=raw;
  if(comma>=0) normalized=raw.replace(/\./g,"").replace(",",".");
  else if(dot>=0 && raw.length-dot-1===3) normalized=raw.replace(/\./g,"");
  return Number(normalized);
}

async function runCase(testCase: Case) {
  const pdfPath=path.join(ROOT,testCase.pdf);
  await access(pdfPath);
  const pageImages=await renderInvoicePagesForVision(pdfPath,[1]);
  const provider=new QwenVisionInvoiceProvider();
  const response=await provider.extractInvoice({
    version:"1",
    documentId:`product-e2e-1.3.8-${testCase.id}`,
    evidenceMode:InvoiceLlmEvidenceMode.PAGE_IMAGE,
    requestedFields:REQUESTED
  },pageImages);

  const checks: Check[]=[];
  const record=(name:string,expected:string,actual:string,passed:boolean)=>checks.push({name,expected,actual,passed});
  for(const check of testCase.checks){
    const raw=fieldValue(response.fields,check.field);
    if(check.kind==="text"){
      const actual=normalizedText(check.first ? first(raw) : raw);
      record(check.name,check.expected,actual,actual===check.expected);
    } else if(check.kind==="contains"){
      const actual=normalizedText(first(raw));
      record(check.name,check.expected,actual,searchFold(actual).includes(searchFold(check.needle)));
    } else if(check.kind==="digits"){
      const actual=digits(raw); record(check.name,check.expected,actual,actual===check.expected);
    } else {
      const n=localeNumberValue(raw);
      record(check.name,String(check.expected),Number.isFinite(n)?String(n):"NaN",Number.isFinite(n)&&Math.abs(n-check.expected)<=0.001);
    }
  }
  return {
    id:testCase.id,pdf:testCase.pdf,model:response.model,decision:response.decision,
    page:1,imageOnly:true,
    accuracy:{passed:checks.filter(c=>c.passed).length,total:checks.length,
      percent:Number((checks.filter(c=>c.passed).length/checks.length*100).toFixed(1))},
    checks
  };
}

async function main(): Promise<void> {
  assert.equal(env.llmEnabled,true,"LLM_ENABLED=true olmalı.");
  assert.equal(env.llmVisionEnabled,true,"LLM_VISION_ENABLED=true olmalı.");
  const results=[];
  for (let index = 0; index < CASES.length; index += 1) {
    const testCase = CASES[index]!;
    console.log(JSON.stringify({
      event: "product-e2e-1.3.8.corpus-case.started",
      case: index + 1,
      totalCases: CASES.length,
      id: testCase.id,
      pdf: testCase.pdf
    }));
    const result = await runCase(testCase);
    results.push(result);
    console.log(JSON.stringify({
      event: "product-e2e-1.3.8.corpus-case.completed",
      ...result
    }, null, 2));
  }
  const passed=results.reduce((n,r)=>n+r.accuracy.passed,0);
  const total=results.reduce((n,r)=>n+r.accuracy.total,0);
  const report={
    event:"product-e2e-1.3.8.real-invoice-corpus.accuracy-report",
    model:env.llmVisionModel,
    corpus:{cases:results.length,passed,total,percent:Number((passed/total*100).toFixed(1))},
    results,
    guardrails:{
      realCustomerPdfsCommitted:false,
      imageOnly:true,
      firstPageOnly:true,
      expectedValuesFixed:true,
      directNormalizedWrite:false
    }
  };
  console.log(JSON.stringify(report,null,2));
  // Corpus phase is measurement-first: individual extraction mismatches are reported,
  // not converted into a false harness failure. Infrastructure/runtime errors still fail.
  assert.equal(results.length,CASES.length);
}

main().catch((error)=>{ console.error(error); process.exitCode=1; });
