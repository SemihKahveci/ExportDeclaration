import type { Request, Response } from "express";
import {
  listEvrimKapOptions,
  listEvrimMenseOptions,
  listEvrimMiktarOptions,
  matchEvrimAliciForMusteri,
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
    items: searchEvrimGonderen(q || String(queryInt(req, "id") ?? ""), limit).map((row) => ({
      gonderenNo: row.gonderenNo,
      unvan: row.unvan,
      vergiNo: row.vergiNo,
      label: `${row.gonderenNo} – ${row.unvan}`,
    })),
  });
}

export async function getAlici(req: Request, res: Response): Promise<void> {
  const musteriNo = queryInt(req, "musteriNo");
  if (musteriNo == null) {
    res.status(400).json({ error: "musteriNo gerekli." });
    return;
  }
  const q = queryText(req, "q");
  const limit = queryInt(req, "limit") ?? 40;
  res.json({
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
  });
}

export async function postMatchAlici(req: Request, res: Response): Promise<void> {
  const musteriNo = Number((req.body as { musteriNo?: unknown })?.musteriNo);
  const aliciUnvan = String((req.body as { aliciUnvan?: unknown })?.aliciUnvan ?? "").trim();
  const adres = String((req.body as { adres?: unknown })?.adres ?? "").trim();
  if (!Number.isFinite(musteriNo)) {
    res.status(400).json({ error: "musteriNo gerekli." });
    return;
  }
  const result = matchEvrimAliciForMusteri(musteriNo, aliciUnvan, adres || undefined);
  res.json(result);
}

export async function getCodeOptions(_req: Request, res: Response): Promise<void> {
  res.json({
    miktar: listEvrimMiktarOptions().map((row) => ({
      ediKodu: row.ediKodu,
      aciklamaTr: row.aciklamaTr,
      aciklamaIng: row.aciklamaIng,
      label: `${row.ediKodu} · ${row.aciklamaTr || row.aciklamaIng || row.cevrimKodu}`,
    })),
    kap: listEvrimKapOptions().map((row) => ({
      kod: row.kod,
      tanim: row.tanim,
      label: `${row.kod} · ${row.tanim}`,
    })),
    mense: listEvrimMenseOptions().map((row) => ({
      ulkeNo: row.ulkeNo,
      ulkeKodu: row.ulkeKodu,
      ulke: row.ulke,
      yUlke: row.yUlke,
      label: `${row.ulkeNo} · ${row.ulke || row.yUlke}`,
    })),
  });
}
