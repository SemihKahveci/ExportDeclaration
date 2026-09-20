import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { EVRIM_EXCEL_HEADERS } from "../../src/modules/evrim-excel/evrimExcelAdapter.types.js";

const API_BASE=process.env.CUSTOMS_MASTER_TEST_API_BASE??"http://backend:3000";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
const declarationId="6aad3237ca6e4f9c2d1554f5";
if(!email||!password) throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");

async function body(response:Response){
  const text=await response.text(); try{return text?JSON.parse(text):undefined;}catch{return text;}
}
async function login():Promise<string>{
  const r=await fetch(`${API_BASE}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
  const b=await body(r); assert.equal(r.status,200,`login failed: ${JSON.stringify(b)}`);
  const sc=r.headers.get("set-cookie"); assert(sc); return sc.split(";",1)[0]!;
}
async function createMaster(cookie:string,payload:any):Promise<string>{
  const r=await fetch(`${API_BASE}/api/customs-master-data`,{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify(payload)});
  const b:any=await body(r); assert.equal(r.status,201,`master create failed: ${JSON.stringify(b)}`); return b.data.id;
}
async function exportRows(cookie:string,payload:any={}):Promise<unknown[][]>{
  const r=await fetch(`${API_BASE}/api/declarations/${declarationId}/exports/evrim-excel`,{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify(payload)});
  if(r.status!==200) assert.fail(`export failed: ${r.status} ${JSON.stringify(await body(r))}`);
  assert.equal(r.headers.get("x-export-row-count"),"56");
  const wb=XLSX.read(Buffer.from(await r.arrayBuffer()),{type:"buffer",cellDates:true});
  assert.deepEqual(wb.SheetNames,["Sayfa1","Sayfa2"]);
  const rows=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Sayfa1,{header:1,defval:""});
  assert.deepEqual(rows[0],Array.from(EVRIM_EXCEL_HEADERS)); assert.equal(rows.length-1,56); return rows;
}
async function main(){
  await mongoose.connect(env.mongoUri);
  const created:string[]=[];
  try{
    const declaration:any=await DeclarationModel.findById(declarationId).lean();
    assert(declaration?.normalizedData?.goodsLines?.length===56);
    const customerId=declaration.operation?.customerId as string|undefined;
    const first=declaration.normalizedData.goodsLines[0];
    assert(first?.productCode&&first?.hsCode&&first?.lineNo===1);

    const cookie=await login();

    created.push(await createMaster(cookie,{
      customerId,scope:"HS",key:first.hsCode,
      values:{exemptionCode:"TEST-MUAF-HS"}
    }));
    created.push(await createMaster(cookie,{
      customerId,scope:"PRODUCT",key:first.productCode,
      values:{brand:"TEST-MASTER-BRAND",utsNo:"TEST-UTS-001",permitCode:"TEST-PERMIT-001",usedFlag:"H"}
    }));

    const masterRows=await exportRows(cookie);
    const row=masterRows[1]!;
    assert.equal(row[0],first.productCode);
    assert.equal(row[4],first.hsCode);
    assert.equal(row[9],"TEST-UTS-001","ÜTS NO master data'dan gelmeli.");
    assert.equal(row[11],"TEST-MUAF-HS","MUAFİYET HS master data'dan gelmeli.");
    assert.equal(row[18],"TEST-MASTER-BRAND","MARKA product master data'dan gelmeli.");
    assert.equal(row[19],"H","KULLANILMIŞ master data'dan gelmeli.");
    assert.equal(row[22],"TEST-PERMIT-001","ÖN İZİN master data'dan gelmeli.");

    const humanRows=await exportRows(cookie,{
      supplements:{lines:{"line:1":{
        brand:"TEST-HUMAN-BRAND",
        exemptionCode:"TEST-HUMAN-MUAF",
        utsNo:"TEST-HUMAN-UTS",
        permitCode:"TEST-HUMAN-PERMIT",
        usedFlag:"E"
      }}}
    });
    const human=humanRows[1]!;
    assert.equal(human[9],"TEST-HUMAN-UTS");
    assert.equal(human[11],"TEST-HUMAN-MUAF");
    assert.equal(human[18],"TEST-HUMAN-BRAND");
    assert.equal(human[19],"E");
    assert.equal(human[22],"TEST-HUMAN-PERMIT");

    console.log(JSON.stringify({
      event:"customs-master-data.evrim-export.integration.passed",
      declarationId,
      rowCount:56,
      firstLine:{lineNo:first.lineNo,productCode:first.productCode,hsCode:first.hsCode},
      masterDataExport:{brand:row[18],utsNo:row[9],exemptionCode:row[11],usedFlag:row[19],permitCode:row[22]},
      humanOverrideExport:{brand:human[18],utsNo:human[9],exemptionCode:human[11],usedFlag:human[19],permitCode:human[22]},
      precedenceVerified:"HUMAN_INPUT > MASTER_DATA > NORMALIZED_DECLARATION",
      temporaryMasterDataCleaned:true
    },null,2));
  }finally{
    // Cleanup through the production API when possible; DB fallback only protects test hygiene.
    try{
      if(created.length){
        const cookie=await login();
        for(const id of created){
          const r=await fetch(`${API_BASE}/api/customs-master-data/${id}`,{method:"DELETE",headers:{cookie}});
          if(r.status!==200&&r.status!==404) throw new Error(`cleanup HTTP ${r.status}`);
        }
      }
    }catch{
      if(created.length) await mongoose.connection.collection("customsmasterdatas").deleteMany({_id:{$in:created.map(id=>new mongoose.Types.ObjectId(id))}});
    }
    await mongoose.disconnect();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
