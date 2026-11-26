import type { Request, Response } from "express";
import {
  listEvrimKapOptions,
  listEvrimMenseOptions,
  listEvrimMiktarOptions,
  lookupEvrimQuantityUnitLabelFromTables,
  matchEvrimAliciForMusteri,
  matchEvrimGonderen,
  searchEvrimAliciForMusteri,
  searchEvrimGonderen,
} from "../export-code-tables/evrimVeriTables.js";

function queryText(req: Request, key: string): string {
  const value = req.query[key];
  return typeof value === "string" ? value.trim() : "";
}

function queryInt(req: Request, key: string): number | undefined {
  const raw = queryText(req, key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function getGonderen(req: Request, res: Response): Promise<void> {
  const q = queryText(req, "q");
  const limit = queryInt(req, "limit") ?? 25;
  res.json({
    ok: true,
    data: {
      items: searchEvrimGonderen(q || String(queryInt(req, "id") ?? ""), limit).map((row) => ({
        gonderenNo: row.gonderenNo,
        unvan: row.unvan,
        vergiNo: row.vergiNo,
        label: `${row.gonderenNo} – ${row.unvan}`,
      })),
    },
  });
}

export async function getAlici(req: Request, res: Response): Promise<void> {
  const musteriNo = queryInt(req, "musteriNo");
  if (musteriNo == null) {
    res.status(400).json({ ok: false, error: "musteriNo gerekli." });
    return;
  }
  const q = queryText(req, "q");
  const limit = queryInt(req, "limit") ?? 40;
  res.json({
    ok: true,
    data: {
      items: searchEvrimAliciForMusteri(musteriNo, q, limit).map((row) => ({
        musteriNo: row.musteriNo,
        musteriAdi: row.musteriAdi,
        aliciNo: row.aliciNo,
        aliciUnvan: row.aliciUnvan,
        adres: row.adres,
        postaKodu: row.postaKodu,
        ulkeNo: row.ulkeNo,
        ulke: row.ulke,
        label: `${row.aliciNo} – ${row.aliciUnvan}`,
      })),
    },
  });
}

export async function postMatchAlici(req: Request, res: Response): Promise<void> {
  const musteriNo = Number((req.body as { musteriNo?: unknown })?.musteriNo);
  const aliciUnvan = String((req.body as { aliciUnvan?: unknown })?.aliciUnvan ?? "").trim();
  const adres = String((req.body as { adres?: unknown })?.adres ?? "").trim();
  if (!Number.isFinite(musteriNo)) {
    res.status(400).json({ ok: false, error: "musteriNo gerekli." });
    return;
  }
  const result = matchEvrimAliciForMusteri(musteriNo, aliciUnvan, adres || undefined);
  res.json({ ok: true, data: result });
}

/** VKN (Evrim Firma) öncelikli gönderici eşlemesi. */
export async function postMatchGonderen(req: Request, res: Response): Promise<void> {
  const taxNo = String((req.body as { taxNo?: unknown })?.taxNo ?? "").trim();
  const name = String((req.body as { name?: unknown })?.name ?? "").trim();
  const result = matchEvrimGonderen(taxNo || undefined, name || undefined);
  if (result.status === "matched") {
    const row = result.row;
    res.json({
      ok: true,
      data: {
        status: "matched",
        row: {
          gonderenNo: row.gonderenNo,
          unvan: row.unvan,
          vergiNo: row.vergiNo,
          label: `${row.gonderenNo} – ${row.unvan}`,
        },
      },
    });
    return;
  }
  if (result.status === "ambiguous") {
    res.json({
      ok: true,
      data: {
        status: "ambiguous",
        rows: result.rows.map((row) => ({
          gonderenNo: row.gonderenNo,
          unvan: row.unvan,
          vergiNo: row.vergiNo,
          label: `${row.gonderenNo} – ${row.unvan}`,
        })),
      },
    });
    return;
  }
  res.json({ ok: true, data: { status: "not_found" } });
}

export async function getCodeOptions(_req: Request, res: Response): Promise<void> {
  res.json({
    ok: true,
    data: {
      miktar: listEvrimMiktarOptions().map((row) => {
        const friendly =
          lookupEvrimQuantityUnitLabelFromTables(row.ediKodu)
          || row.aciklamaTr
          || row.aciklamaIng
          || row.cevrimKodu;
        const aliases = Array.from(new Set(
          [row.ediKodu, row.aciklamaTr, row.aciklamaIng, row.aciklama2, row.cevrimKodu, friendly]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
        ));
        return {
          ediKodu: row.ediKodu,
          aciklamaTr: row.aciklamaTr,
          aciklamaIng: row.aciklamaIng,
          aciklama2: row.aciklama2,
          cevrimKodu: row.cevrimKodu,
          aliases,
          label: `${row.ediKodu} · ${friendly}`,
        };
      }),
      kap: listEvrimKapOptions().map((row) => ({
        kod: row.kod,
        tanim: row.tanim,
        label: `${row.kod} · ${row.tanim}`,
      })),
      mense: listEvrimMenseOptions().map((row) => {
        const aliases = Array.from(new Set(
          [row.ulkeNo, row.ulkeKodu, row.ulke, row.yUlke, row.sbUlke, row.ublMensei]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
        ));
        return {
          ulkeNo: row.ulkeNo,
          ulkeKodu: row.ulkeKodu,
          ulke: row.ulke,
          yUlke: row.yUlke,
          sbUlke: row.sbUlke,
          ublMensei: row.ublMensei,
          aliases,
          label: `${row.ulkeNo} · ${row.ulke || row.yUlke}`,
        };
      }),
    },
  });
}
