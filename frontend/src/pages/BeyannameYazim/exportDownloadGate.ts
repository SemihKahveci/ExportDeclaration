import type { BeyannameLineItem } from '../../types';
import { parseTrNumber } from '../../utils/parseTrNumber';

function text(value: unknown): string {
  const raw = value == null ? '' : String(value).trim();
  return raw === '—' || raw === '–' || raw === '-' ? '' : raw;
}

export type ExportDownloadIssue =
  | { kind: 'unit'; lineNo: number; message: string }
  | { kind: 'mense'; lineNo: number; message: string }
  | { kind: 'total'; message: string; delta: number };

export interface ExportDownloadGateResult {
  issues: ExportDownloadIssue[];
  /** Birim/menşe eksikleri — “Yine de İndir” kapalı */
  blocking: boolean;
  /** Yalnız toplam farkı — “Yine de İndir” açık */
  allowForce: boolean;
}

export function evaluateExportDownloadGate(
  lineItems: BeyannameLineItem[],
  fieldValues: Record<string, string>
): ExportDownloadGateResult {
  const issues: ExportDownloadIssue[] = [];

  lineItems.forEach((item, index) => {
    const lineNo = Number(item.lineNo) > 0 ? Number(item.lineNo) : index + 1;
    if (!text(item.miktarBirimi)) {
      issues.push({ kind: 'unit', lineNo, message: `Kalem ${lineNo}: miktar birimi seçilmedi` });
    }
    if (!text(item.mense)) {
      issues.push({ kind: 'mense', lineNo, message: `Kalem ${lineNo}: menşe seçilmedi` });
    }
  });

  const faturaToplam = parseTrNumber(fieldValues['Toplam Fatura Bedeli'] ?? '');
  const kalemToplam = lineItems.reduce((sum, item) => sum + parseTrNumber(String(item.kiymet ?? '')), 0);
  if (faturaToplam > 0 && Math.abs(kalemToplam - faturaToplam) > 0.05) {
    const delta = kalemToplam - faturaToplam;
    issues.push({
      kind: 'total',
      delta,
      message: `Kalem toplamı fatura toplamından ${delta.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} farklı`,
    });
  }

  const blocking = issues.some((issue) => issue.kind === 'unit' || issue.kind === 'mense');
  const allowForce = !blocking && issues.some((issue) => issue.kind === 'total');
  return { issues, blocking, allowForce };
}
