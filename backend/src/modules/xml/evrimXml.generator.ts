import { getByPath } from "../../common/utils/getByPath.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import { beyannameXmlFields, packageXmlFields, weightXmlFields } from "./evrimXml.mapping.js";

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatScalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return escapeXml(String(value));
}

function formatNumber(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return escapeXml(String(value));
  return escapeXml(String(n));
}

function emitFields(fields: { xmlTag: string; path: string }[], data: NormalizedDeclaration, indent: string): string[] {
  const lines: string[] = [];
  for (const { xmlTag, path } of fields) {
    const raw = getByPath(data, path);
    lines.push(`${indent}<${xmlTag}>${formatScalar(raw)}</${xmlTag}>`);
  }
  return lines;
}

/**
 * Doküman §9 taslağına uygun XML iskeleti:
 * - Beyanname kökü altında başlık alanları
 * - GoodsLines / GoodsLine (HSCode, Description, Quantity, UnitPrice; birim ve satır tutarı varsa)
 * - Package / Weight blokları
 */
export function generateEvrimXmlDraft(data: NormalizedDeclaration): string {
  const I2 = "  ";
  const I4 = "    ";
  const beyanLines = emitFields(beyannameXmlFields, data, I2);

  const goodsLinesXml = data.goodsLines.map((item) => {
    const inner = [
      `${I4}<HSCode>${formatScalar(item.hsCode)}</HSCode>`,
      `${I4}<Description>${formatScalar(item.description)}</Description>`,
      `${I4}<Quantity>${formatNumber(item.quantity)}</Quantity>`,
      `${I4}<UnitPrice>${formatNumber(item.unitPrice)}</UnitPrice>`
    ];
    if (item.unit) {
      inner.push(`${I4}<Unit>${formatScalar(item.unit)}</Unit>`);
    }
    if (item.lineTotal !== undefined && item.lineTotal !== null) {
      inner.push(`${I4}<LineTotal>${formatNumber(item.lineTotal)}</LineTotal>`);
    }
    return [`${I2}<GoodsLine>`, ...inner, `${I2}</GoodsLine>`].join("\n");
  });

  const packageInner = emitFields(packageXmlFields, data, I4);
  const weightInner = emitFields(weightXmlFields, data, I4);

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Beyanname xmlns="urn:evrim:draft">`,
    ...beyanLines,
    `  <GoodsLines>`,
    ...goodsLinesXml,
    `  </GoodsLines>`,
    `  <Package>`,
    ...packageInner,
    `  </Package>`,
    `  <Weight>`,
    ...weightInner,
    `  </Weight>`,
    `</Beyanname>`
  ];

  return parts.join("\n");
}
