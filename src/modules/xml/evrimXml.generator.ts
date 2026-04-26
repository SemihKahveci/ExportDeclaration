import { getByPath } from "../../common/utils/getByPath.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import { evrimXmlMapping } from "./evrimXml.mapping.js";

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

export function generateEvrimXmlDraft(data: NormalizedDeclaration): string {
  const headerTags: string[] = [];
  for (const [xmlPath, dataPath] of Object.entries(evrimXmlMapping)) {
    const raw = getByPath(data, dataPath);
    const tagName = xmlPath.replaceAll(".", "_");
    headerTags.push(`    <${tagName}>${formatScalar(raw)}</${tagName}>`);
  }

  const goodsTags = data.goodsLines.map((item) => {
    const line = [
      `      <HSCode>${formatScalar(item.hsCode)}</HSCode>`,
      `      <Description>${formatScalar(item.description)}</Description>`,
      `      <Quantity>${formatScalar(item.quantity)}</Quantity>`,
      `      <UnitPrice>${formatScalar(item.unitPrice)}</UnitPrice>`,
      `      <LineTotal>${formatScalar(item.lineTotal)}</LineTotal>`
    ].join("\n");
    return `    <GoodsLine>\n${line}\n    </GoodsLine>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Beyanname xmlns="urn:evrim:draft">`,
    `  <Header>`,
    ...headerTags,
    `  </Header>`,
    `  <GoodsLines>`,
    ...goodsTags,
    `  </GoodsLines>`,
    `</Beyanname>`
  ].join("\n");
}
