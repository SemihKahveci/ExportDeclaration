import type { MaterialFieldKey, MaterialRecord } from '../../types';

export const MATERIAL_FIELD_OPTIONS: Array<{ key: MaterialFieldKey; label: string }> = [
  { key: 'materialNo', label: 'Malzeme No' },
  { key: 'description', label: 'Malzeme Tanımı' },
  { key: 'gtipNo', label: 'GTİP' },
];

export function presentedMaterial(record: MaterialRecord): Pick<MaterialRecord, 'materialNo' | 'description' | 'gtipNo'> {
  if ((record.status === 'pending' || record.status === 'rejected') && record.pendingUpdate) {
    return record.pendingUpdate;
  }
  return record;
}

export function editableMaterial(record: MaterialRecord): MaterialRecord {
  const shown = presentedMaterial(record);
  return { ...record, materialNo: shown.materialNo, description: shown.description, gtipNo: shown.gtipNo };
}

const STATUS_LABEL: Record<MaterialRecord['status'], string> = {
  verified: 'Doğrulanmış',
  pending: 'Onay Bekleyen',
  rejected: 'Reddedildi',
};

export function materialStatusLabel(status: MaterialRecord['status']): string {
  return STATUS_LABEL[status];
}

export function rejectionExportDetail(record: MaterialRecord): string {
  const fields = rejectionSummary(record);
  const note = record.rejection?.note?.trim() ?? '';
  return [fields, note].filter(Boolean).join(' — ');
}

export function rejectionSummary(record: MaterialRecord): string {
  if (record.status !== 'rejected' || !record.rejection?.fields?.length) return '';
  const labels = new Map(MATERIAL_FIELD_OPTIONS.map((field) => [field.key, field.label]));
  return record.rejection.fields.map((field) => labels.get(field) ?? field).join(', ');
}
