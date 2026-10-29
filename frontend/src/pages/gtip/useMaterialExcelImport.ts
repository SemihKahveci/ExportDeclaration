import { useState } from 'react';
import {
  downloadMaterialImportWarning,
  formatMaterialImportToast,
  stageMaterialImportUpdates,
  type MaterialImportConflict,
} from '../../api/materialRecordApi';
import { ApiError } from '../../api/apiClient';
import type { MaterialRecord } from '../../types';
import { gtipService } from '../../services/gtip';

interface UseMaterialExcelImportOptions {
  customerId: string;
  toast: (message: string, options?: { duration?: number }) => void;
  onCreated: (records: MaterialRecord[]) => void;
  onUpdated: (records: MaterialRecord[]) => void;
}

export function useMaterialExcelImport({ customerId, toast, onCreated, onUpdated }: UseMaterialExcelImportOptions) {
  const [conflicts, setConflicts] = useState<MaterialImportConflict[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    if (!customerId) return;
    const result = await gtipService.importMaterialRecordsExcel(customerId, file);
    if (result.records.length > 0) onCreated(result.records);
    const summary = formatMaterialImportToast(result);
    if (summary) toast(summary, { duration: 7000 });
    if ((result.conflicts ?? []).length > 0) setConflicts(result.conflicts);
    else if (!summary && (result.skippedIdentical ?? 0) === 0) toast('İçe aktarılacak yeni satır yok');
  }

  async function confirmConflicts() {
    if (!conflicts?.length || busy) return;
    setBusy(true);
    try {
      const updated = await stageMaterialImportUpdates(customerId, conflicts.map((row) => ({
        id: row.existingId,
        materialNo: row.materialNo,
        description: row.description,
        gtipNo: row.gtipNo,
      })));
      onUpdated(updated);
      setConflicts(null);
      toast(`${updated.length} kayıt GTİP Onay’a gönderildi. Onaylanınca mevcut kayıt güncellenir.`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Kayıtlar GTİP Onay’a gönderilemedi', { duration: 7000 });
    } finally {
      setBusy(false);
    }
  }

  async function declineConflicts() {
    if (!conflicts?.length || busy) return;
    setBusy(true);
    try {
      await downloadMaterialImportWarning(conflicts);
      setConflicts(null);
      toast('Güncelleme gönderilmedi. Uyarı Excel’i indirildi.');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Uyarı Excel’i indirilemedi', { duration: 7000 });
    } finally {
      setBusy(false);
    }
  }

  return {
    conflicts,
    importBusy: busy,
    importFile,
    confirmConflicts,
    declineConflicts,
    closeConflicts: () => { if (!busy) setConflicts(null); },
  };
}
