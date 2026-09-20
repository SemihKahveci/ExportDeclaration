import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";

const fixtures = [
  { runId: "6aad3238ca6e4f9c2d155501", expectedLines: 56, source: "NATIVE_TEXT" },
  { runId: "6aad3295ca6e4f9c2d155513", expectedLines: 41, source: "OCR" },
] as const;

type Box={x0:number;y0:number;x1:number;y1:number};
type Word={text:string;bbox:Box;source?:string};
type Page={pageNumber:number;words?:Word[];lines?:Word[]};

const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
const compactAlphaCell=(s:string)=>{
  const t=norm(s);
  return /^[A-ZÀ-Ž][A-ZÀ-Ž .'-]{1,30}$/.test(t) && !/^\d/.test(t);
};
const cy=(b:Box)=>(b.y0+b.y1)/2;
const cx=(b:Box)=>(b.x0+b.x1)/2;

function firstValue(fields:any,name:string){
  const arr=fields?.[name];
  return Array.isArray(arr)&&arr.length?arr[0]:undefined;
}

async function main(){
 await mongoose.connect(env.mongoUri);
 try{
  const results:any[]=[];
  for(const f of fixtures){
   const run:any=await ProcessingRunModel.findById(f.runId).lean();
   assert(run?.canonicalDocument,`canonical missing ${f.runId}`);
   const segments=(run.candidates as any)?.segments;
   const audit:any=Array.isArray(segments)
     ? segments.map((segment:any)=>segment?.data?.genericCandidateAudit).find(Boolean)
     : undefined;
   assert(audit?.candidates?.fields,`generic candidate fields missing ${f.runId}`);

   const flatFields:any=audit.candidates.fields;
   const indices=[...new Set(
     Object.keys(flatFields)
       .map(k=>/^goodsLines\.(\d+)\./.exec(k)?.[1])
       .filter((x): x is string=>x!==undefined)
       .map(Number)
   )].sort((a,b)=>a-b);

   const goods=indices.map(index=>{
     const fields:Record<string,unknown>={};
     for(const [key,value] of Object.entries(flatFields)){
       const m=/^goodsLines\.(\d+)\.(.+)$/.exec(key);
       if(m && Number(m[1])===index) fields[m[2]]=value;
     }
     return {index,fields};
   });
   assert.equal(goods.length,f.expectedLines,`generic goods line count mismatch ${f.runId}`);

   const pages:Page[]=run.canonicalDocument.pages??[];

   // Infer candidate text columns from the goods rows themselves.
   // This deliberately does not require a MENŞE header: some canonical PDFs do not
   // expose table headers as words/lines. No fixed x coordinate or country dictionary.
   const rowAlphaCells:{line:number;word:Word;anchorX:number}[]=[];
   for(let i=0;i<goods.length;i++){
     const g=goods[i];
     const hs=firstValue(g.fields,"hsCode");
     const pc=firstValue(g.fields,"productCode");
     const anchor=hs??pc;
     const ev=anchor?.evidence?.[0];
     const anchorBox:Box|undefined=ev?.bbox;
     const page=pages.find(p=>p.pageNumber===ev?.pageNumber);
     if(!page||!anchorBox) continue;
     const tol=Math.max(0.018,(anchorBox.y1-anchorBox.y0)*1.8);
     for(const w of (page.words??[])){
       if(Math.abs(cy(w.bbox)-cy(anchorBox))>tol) continue;
       if(cx(w.bbox)>=cx(anchorBox)) continue;
       const width=w.bbox.x1-w.bbox.x0;
       if(width<=0.015 || width>=0.14) continue;
       if(!compactAlphaCell(w.text)) continue;
       rowAlphaCells.push({line:i,word:w,anchorX:cx(anchorBox)});
     }
   }

   // Cluster columns by visual X alignment. A real row-level column must occur on
   // many distinct goods lines. Among stable compact-alpha columns, prefer the
   // left-most one; package/delivery/description columns occur further right in
   // these table structures, while this rule remains layout-relative rather than
   // using an invoice-specific coordinate.
   const clusters:{center:number;cells:typeof rowAlphaCells;lines:Set<number>}[]=[];
   const clusterTol=0.025;
   for(const cell of rowAlphaCells.sort((a,b)=>cx(a.word.bbox)-cx(b.word.bbox))){
     const x=cx(cell.word.bbox);
     let cluster=clusters.find(c=>Math.abs(c.center-x)<=clusterTol);
     if(!cluster){
       cluster={center:x,cells:[],lines:new Set<number>()};
       clusters.push(cluster);
     }
     cluster.cells.push(cell);
     cluster.lines.add(cell.line);
     cluster.center=cluster.cells.reduce((sum,c)=>sum+cx(c.word.bbox),0)/cluster.cells.length;
   }
   const minCoverage=Math.max(3,Math.ceil(goods.length*0.60));
   const stableClusters=clusters
     .filter(c=>c.lines.size>=minCoverage)
     .sort((a,b)=>a.center-b.center);
   assert(stableClusters.length>0,`no stable alphabetic goods-row column ${f.runId}`);
   const originCluster=stableClusters[0];
   const originColumnX=originCluster.center;
   const xTolerance=Math.max(0.025,
     Math.max(...originCluster.cells.map(c=>Math.abs(cx(c.word.bbox)-originColumnX)))+0.008
   );

   const discovered:any[]=[];

   for(let i=0;i<goods.length;i++){
    const g=goods[i];
    const hs=firstValue(g.fields,"hsCode");
    const pc=firstValue(g.fields,"productCode");
    const anchor=hs??pc;
    if(!anchor?.evidence?.length){
      discovered.push({line:i+1,hsCode:hs?.value,productCode:pc?.value,origin:null,reason:"NO_ROW_ANCHOR"});
      continue;
    }
    const ev=anchor.evidence[0];
    const page=pages.find(p=>p.pageNumber===ev.pageNumber);
    const anchorBox:Box=ev.bbox;
    if(!page||!anchorBox){
      discovered.push({line:i+1,hsCode:hs?.value,productCode:pc?.value,origin:null,reason:"NO_PAGE_OR_BBOX"});
      continue;
    }

    // Same visual row as the already-proven goods-line anchor.
    const tol=Math.max(0.018,(anchorBox.y1-anchorBox.y0)*1.8);
    const row=(page.words??[]).filter(w=>Math.abs(cy(w.bbox)-cy(anchorBox))<=tol);

    // Select only cells geometrically aligned with the semantic MENŞE/ORIGIN column.
    // No supplier/layout x coordinate and no country-name dictionary is used.
    const candidates=row.filter(w=>{
      if(!compactAlphaCell(w.text)) return false;
      return Math.abs(cx(w.bbox)-originColumnX)<=xTolerance;
    }).sort((a,b)=>
      Math.abs(cx(a.bbox)-originColumnX)-Math.abs(cx(b.bbox)-originColumnX)
    );

    const origin=candidates[0];
    discovered.push({
      line:i+1,
      hsCode:hs?.value??null,
      productCode:pc?.value??null,
      origin:origin?.text??null,
      page:ev.pageNumber,
      evidence:origin?{text:origin.text,bbox:origin.bbox,contentSource:origin.source??f.source}:null,
      candidateCount:candidates.length,
      alternatives:candidates.slice(1,4).map(x=>x.text),
    });
   }

   const matched=discovered.filter(x=>x.origin).length;
   const ambiguous=discovered.filter(x=>x.candidateCount>1).length;
   results.push({
    runId:f.runId, expectedLines:f.expectedLines, matched, missing:f.expectedLines-matched,
    ambiguous, contentSource:f.source,
    inferredOriginColumn:{
      x:originColumnX,
      xTolerance,
      coverage:originCluster.lines.size,
      stableColumns:stableClusters.map(c=>({
        x:c.center,
        coverage:c.lines.size,
        sample:[...new Set(c.cells.map(x=>x.word.text))].slice(0,8)
      }))
    },
    lines:discovered
   });
  }
  console.log(JSON.stringify({event:"idp.invoice-origin.discovery.report",results},null,2));
 } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
