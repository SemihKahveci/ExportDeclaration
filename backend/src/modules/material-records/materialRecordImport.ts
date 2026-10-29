import type { MaterialExcelRowError, ParsedMaterialExcelRow } from "./materialRecordExcel.parser.js";

export const MATERIAL_FIELDS = ["materialNo", "description", "gtipNo"] as const;
export type MaterialFieldKey = (typeof MATERIAL_FIELDS)[number];

export interface ExistingMaterialRow {
  id: string;
  materialNo: string;
  description: string;
  gtipNo: string;
}

export interface MaterialImportConflict {
  row: number;
  existingId: string;
  materialNo: string;
  description: string;
  gtipNo: string;
  currentMaterialNo: string;
  currentDescription: string;
  currentGtipNo: string;
  differingFields: MaterialFieldKey[];
}

export interface MaterialImportClassification {
  create: Array<{ row: number; item: ParsedMaterialExcelRow }>;
  conflicts: MaterialImportConflict[];
  skippedIdentical: number;
  errors: MaterialExcelRowError[];
}

function fold(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function gtipKey(value: string): string {
  return value.replace(/[.\s]/g, "").replace(/\D/g, "");
}

function sameMaterial(left: string, right: string): boolean {
  return fold(left) === fold(right);
}

function sameGtip(left: string, right: string): boolean {
  return gtipKey(left) === gtipKey(right);
}

function differingFields(current: ExistingMaterialRow, item: ParsedMaterialExcelRow): MaterialFieldKey[] {
  const fields: MaterialFieldKey[] = [];
  if (!sameMaterial(current.materialNo, item.materialNo)) fields.push("materialNo");
  if (!sameMaterial(current.description, item.description)) fields.push("description");
  if (!sameGtip(current.gtipNo, item.gtipNo)) fields.push("gtipNo");
  return fields;
}

function conflictOf(row: number, current: ExistingMaterialRow, item: ParsedMaterialExcelRow): MaterialImportConflict {
  return {
    row,
    existingId: current.id,
    materialNo: item.materialNo,
    description: item.description,
    gtipNo: item.gtipNo,
    currentMaterialNo: current.materialNo,
    currentDescription: current.description,
    currentGtipNo: current.gtipNo,
    differingFields: differingFields(current, item)
  };
}

export function classifyMaterialImportRows(
  items: Array<{ row: number; item: ParsedMaterialExcelRow }>,
  existing: ExistingMaterialRow[]
): MaterialImportClassification {
  const byNo = new Map<string, ExistingMaterialRow>();
  const byDescription = new Map<string, ExistingMaterialRow[]>();
  for (const row of existing) {
    byNo.set(fold(row.materialNo), row);
    const key = fold(row.description);
    const group = byDescription.get(key) ?? [];
    group.push(row);
    byDescription.set(key, group);
  }

  const create: MaterialImportClassification["create"] = [];
  const conflicts: MaterialImportConflict[] = [];
  const errors: MaterialExcelRowError[] = [];
  let skippedIdentical = 0;

  for (const entry of items) {
    const item = entry.item;
    const byMaterialNo = byNo.get(fold(item.materialNo));
    if (byMaterialNo) {
      const fields = differingFields(byMaterialNo, item);
      if (fields.length === 0) skippedIdentical += 1;
      else conflicts.push(conflictOf(entry.row, byMaterialNo, item));
      continue;
    }

    const descriptionMatches = byDescription.get(fold(item.description)) ?? [];
    if (descriptionMatches.length > 1) {
      errors.push({
        row: entry.row,
        message: `Bu malzeme tanımı birden fazla kayıtta geçiyor: ${item.description}`
      });
      continue;
    }
    if (descriptionMatches.length === 1) {
      const match = descriptionMatches[0]!;
      const fields = differingFields(match, item);
      if (fields.length === 0) skippedIdentical += 1;
      else conflicts.push(conflictOf(entry.row, match, item));
      continue;
    }

    create.push(entry);
  }

  return { create, conflicts, skippedIdentical, errors };
}
