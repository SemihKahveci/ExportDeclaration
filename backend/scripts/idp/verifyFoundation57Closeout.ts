import assert from "node:assert/strict";

const API=process.env.FOUNDATION57_API_BASE??"http://backend:3000";
const DECLARATION="6aad3295ca6e4f9c2d155507";
const FILE="6aad3295ca6e4f9c2d15550d";
const OTHER_DECLARATION="6aad3237ca6e4f9c2d1554f5";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");

async function json(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined;}catch{b=t;}return {r,b};}
async function wait(){
 let last:unknown;
 for(let i=0;i<20;i++){try{const r=await fetch(`${API}/health`);if(r.ok)return;}catch(e){last=e;}await new Promise(x=>setTimeout(x,500));}
 throw last??new Error("Backend readiness timeout");
}
async function main(){
 await wait();
 const login=await json(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));
 assert.equal(login.r.status,200,JSON.stringify(login.b));
 const sc=login.r.headers.get("set-cookie");assert(sc);const cookie=sc.split(";",1)[0]!;

 const projection=await json(await fetch(`${API}/api/declarations/${DECLARATION}/control-provenance`,{headers:{cookie}}));
 assert.equal(projection.r.status,200,JSON.stringify(projection.b));
 const entries=projection.b.data.entries as any[];
 assert.equal(entries.length,336);
 const authorities=entries.reduce((a:any,x:any)=>(a[x.authority]=(a[x.authority]??0)+1,a),{});
 assert.equal((authorities.NORMALIZED_DECLARATION??0)+(authorities.MASTER_DATA??0)+(authorities.PERSISTENT_HUMAN??0),336);
 const normalized=entries.filter(x=>x.authority==="NORMALIZED_DECLARATION");
 assert.equal(normalized.filter(x=>x.evidence?.bbox).length,normalized.length,"Every normalized effective field must retain physical bbox provenance");

 const docs=await json(await fetch(`${API}/api/declarations/${DECLARATION}/documents`,{headers:{cookie}}));
 assert.equal(docs.r.status,200,JSON.stringify(docs.b));
 assert.ok(Array.isArray(docs.b.data)&&docs.b.data.some((x:any)=>String(x._id)===FILE));

 const evidence=await json(await fetch(`${API}/api/declarations/${DECLARATION}/documents/${FILE}/pages/1/evidence`,{headers:{cookie}}));
 assert.equal(evidence.r.status,200,JSON.stringify(evidence.b));
 assert.equal(evidence.b.data.uploadedFileId,FILE);
 assert.ok(evidence.b.data.evidence.length>0);

 const cross=await fetch(`${API}/api/declarations/${OTHER_DECLARATION}/documents/${FILE}/pages/1/evidence`,{headers:{cookie}});
 assert.equal(cross.status,404,"Cross-declaration document evidence access must be rejected");

 const review=await json(await fetch(`${API}/api/declarations/${DECLARATION}/idp-reviews/latest`,{headers:{cookie}}));
 assert.equal(review.r.status,200,JSON.stringify(review.b));

 const supplements=await json(await fetch(`${API}/api/declarations/${DECLARATION}/customs-supplements`,{headers:{cookie}}));
 assert.equal(supplements.r.status,200,JSON.stringify(supplements.b));
 assert.ok(Array.isArray(supplements.b.data));

 console.log(JSON.stringify({
  event:"foundation-5.7.closeout.integration.passed",
  declarationId:DECLARATION,
  effectiveFieldCount:entries.length,
  authorityCounts:authorities,
  normalizedPhysicalBboxCoverage:`${normalized.length}/${normalized.length}`,
  exactUploadedFileVerified:true,
  crossDeclarationEvidenceRejected:true,
  humanReviewEndpointVerified:true,
  customsSupplementHistoryVerified:true
 },null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
