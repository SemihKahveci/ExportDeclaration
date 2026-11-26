import assert from "node:assert/strict";
import path from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

async function main() {
  const { env } = await import("../../src/config/env.js");
  const {
    deleteMusteriKural,
    getIhracatExcelAyar,
    replaceGenelKurallar,
    resolveKapAmbalajForExport,
    upsertMusteriKural,
  } = await import("../../src/modules/ihracat-excel-ayar/ihracatExcelAyar.service.js");
  const {
    IhracatExcelGenelAyarModel,
    IhracatExcelMusteriAyarModel,
  } = await import("../../src/modules/ihracat-excel-ayar/ihracatExcelAyar.model.js");

  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  try {
    let ayar = await getIhracatExcelAyar(companyId);
    assert.deepEqual(ayar.genel, []);
    assert.deepEqual(ayar.musteri, []);

    ayar = await replaceGenelKurallar(companyId, userId, {
      kurallar: [
        { tasimaSekilleri: ["Karayolu", "Denizyolu"], kapKaynak: "fatura", kapSabit: "", ambalaj: "ADDR" },
        { tasimaSekilleri: ["Havayolu"], kapKaynak: "sabit", kapSabit: "bi", ambalaj: "AIR" },
      ],
    });
    assert.equal(ayar.genel.length, 2);
    assert.equal(ayar.genel[1]?.kapSabit, "BI");

    await assert.rejects(
      () => replaceGenelKurallar(companyId, userId, {
        kurallar: [
          { tasimaSekilleri: ["Karayolu"], kapKaynak: "fatura", ambalaj: "A" },
          { tasimaSekilleri: ["Karayolu"], kapKaynak: "sabit", kapSabit: "BI", ambalaj: "B" },
        ],
      }),
      /Karayolu/
    );

    ayar = await upsertMusteriKural(companyId, userId, {
      gonderenNo: 3206,
      tasimaSekilleri: ["Karayolu"],
      kapKaynak: "sabit",
      kapSabit: "BX",
      ambalaj: "CUST",
    });
    assert.equal(ayar.musteri.length, 1);
    assert.equal(ayar.musteri[0]?.gonderenNo, 3206);

    const resolvedMusteri = await resolveKapAmbalajForExport({
      companyId,
      gonderenNo: 3206,
      tasimaSekli: "Karayolu",
    });
    assert.equal(resolvedMusteri.source, "musteri");
    assert.equal(resolvedMusteri.kapSabit, "BX");
    assert.equal(resolvedMusteri.ambalaj, "CUST");

    const resolvedGenel = await resolveKapAmbalajForExport({
      companyId,
      gonderenNo: 3206,
      tasimaSekli: "Havayolu",
    });
    assert.equal(resolvedGenel.source, "genel");
    assert.equal(resolvedGenel.kapSabit, "BI");

    const resolvedNone = await resolveKapAmbalajForExport({
      companyId,
      gonderenNo: 999999,
      tasimaSekli: "Transit",
    });
    assert.equal(resolvedNone.source, "none");

    ayar = await deleteMusteriKural(companyId, ayar.musteri[0]!.id);
    assert.equal(ayar.musteri.length, 0);

    console.log("ihracat excel ayar ok");
  } finally {
    await IhracatExcelGenelAyarModel.deleteMany({ companyId });
    await IhracatExcelMusteriAyarModel.deleteMany({ companyId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
