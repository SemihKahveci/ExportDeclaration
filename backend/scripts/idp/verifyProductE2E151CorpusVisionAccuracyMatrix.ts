import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "../../src/config/env.js";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { QwenVisionInvoiceProvider } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { renderInvoicePagesForVision } from "../../src/modules/idp/llm/renderInvoicePagesForVision.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const REQUESTED = ["invoiceNumber","currency","deliveryTerm","goodsLines[].description","goodsLines[].hsCode","goodsLines[].quantity","goodsLines[].unit","goodsLines[].unitPrice","goodsLines[].lineTotal"];
const norm=(v:unknown)=>String(v??"").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g," ");
const fold=(v:unknown)=>norm(v).replace(/İ/g,"I").replace(/Ş/g,"S").replace(/Ğ/g,"G").replace(/Ü/g,"U").replace(/Ö/g,"O").replace(/Ç/g,"C");
const first=(v:unknown)=>Array.isArray(v)?v[0]:v;
const digits=(v:unknown)=>norm(first(v)).replace(/\D/g,"");
function num(v:unknown){ const raw=norm(first(v)).replace(/[^0-9,.-]/g,""); if(!raw)return NaN; const c=raw.lastIndexOf(","),d=raw.lastIndexOf("."); let n=raw; if(c>=0)n=raw.replace(/\./g,"").replace(",", "."); else if(d>=0&&raw.length-d-1===3)n=raw.replace(/\./g,""); return Number(n); }
function value(fields:Array<{field:string;value:unknown}>,field:string){return fields.find(x=>x.field===field)?.value;}

async function main(){
  assert.equal(env.llmEnabled,true,"LLM_ENABLED=true olmalı.");
  assert.equal(env.llmVisionEnabled,true,"LLM_VISION_ENABLED=true olmalı.");
  const only=process.env.PRODUCT_E2E_CASE?.trim();
  const cases=only?PRODUCT_E2E_CORPUS_CASES.filter(x=>x.id===only):PRODUCT_E2E_CORPUS_CASES;
  assert.ok(cases.length,`Unknown PRODUCT_E2E_CASE: ${only}`);
  const provider=new QwenVisionInvoiceProvider();
  const results:any[]=[];
  for(const [i,c] of cases.entries()){
    const pdf=path.join(PRODUCT_E2E_CORPUS_ROOT,c.pdf); await access(pdf);
    console.log(JSON.stringify({event:"product-e2e-1.5.1.case.started",case:i+1,total:cases.length,id:c.id,pdf:c.pdf}));
    const images=await renderInvoicePagesForVision(pdf,[1]);
    const response=await provider.extractInvoice({version:"1",documentId:`product-e2e-1.5.1-${c.id}`,evidenceMode:InvoiceLlmEvidenceMode.PAGE_IMAGE,requestedFields:REQUESTED},images);
    const f=response.fields;
    const checks=[
      ["invoiceNumber",c.expected.invoiceNumber,norm(value(f,"invoiceNumber")),norm(value(f,"invoiceNumber"))===c.expected.invoiceNumber],
      ["currency",c.expected.currency,norm(value(f,"currency")),norm(value(f,"currency"))===c.expected.currency],
      ["deliveryTerm",c.expected.deliveryTerm??"",norm(value(f,"deliveryTerm")),!c.expected.deliveryTerm||norm(value(f,"deliveryTerm"))===c.expected.deliveryTerm],
      ["description[0]",`contains ${c.expected.firstGoodsLine.descriptionContains}`,norm(first(value(f,"goodsLines[].description"))),fold(first(value(f,"goodsLines[].description"))).includes(fold(c.expected.firstGoodsLine.descriptionContains))],
      ["hsCode[0]",c.expected.firstGoodsLine.hsCode,digits(value(f,"goodsLines[].hsCode")),digits(value(f,"goodsLines[].hsCode"))===c.expected.firstGoodsLine.hsCode],
      ["quantity[0]",String(c.expected.firstGoodsLine.quantity),String(num(value(f,"goodsLines[].quantity"))),Math.abs(num(value(f,"goodsLines[].quantity"))-c.expected.firstGoodsLine.quantity)<=.001],
      ["unit[0]",c.expected.firstGoodsLine.unit,norm(first(value(f,"goodsLines[].unit"))),norm(first(value(f,"goodsLines[].unit")))===c.expected.firstGoodsLine.unit],
      ["unitPrice[0]",String(c.expected.firstGoodsLine.unitPrice),String(num(value(f,"goodsLines[].unitPrice"))),Math.abs(num(value(f,"goodsLines[].unitPrice"))-c.expected.firstGoodsLine.unitPrice)<=.001],
      ["lineTotal[0]",String(c.expected.firstGoodsLine.lineTotal),String(num(value(f,"goodsLines[].lineTotal"))),Math.abs(num(value(f,"goodsLines[].lineTotal"))-c.expected.firstGoodsLine.lineTotal)<=.001],
    ].map(([field,expected,actual,passed])=>({field,expected,actual,passed}));
    const passed=checks.filter(x=>x.passed).length;
    const result={id:c.id,model:response.model,decision:response.decision,passed,total:checks.length,percent:Number((passed/checks.length*100).toFixed(1)),checks}; results.push(result);
    console.log(JSON.stringify({event:"product-e2e-1.5.1.case.completed",...result},null,2));
  }
  const passed=results.reduce((n,r)=>n+r.passed,0), total=results.reduce((n,r)=>n+r.total,0);
  console.log(JSON.stringify({event:"product-e2e-1.5.1.corpus-vision-accuracy-matrix.measured",model:env.llmVisionModel,cases:results.length,passed,total,percent:Number((passed/total*100).toFixed(1)),results,guardrails:{fixedGroundTruth:true,measurementOnly:true,customerPdfsCommitted:false,directNormalizedWrite:false}},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
