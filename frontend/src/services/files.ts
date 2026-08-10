import type {
  CustomsFile,
  FileStatSummary,
  FileStatusCounts,
  ArchiveStats,
  FileStatus,
} from '../types';
import { fetchCustomsFiles, liveApiEnabled, apiCreateOperationFile } from './liveApi';

function computeStatusCounts(files: CustomsFile[]): FileStatusCounts {
  const active = files.filter((f) => !f.isArchived);
  const count = (s: FileStatus) => active.filter((f) => f.status === s).length;
  return {
    total: active.length,
    yeniTalep: count('yeni-talep'),
    gtipHazirlik: count('gtip-hazirlik'),
    evrakBekleniyor: count('evrak-bekleniyor'),
    beyanname: count('beyanname-yazim'),
    icKontrol: count('ic-kontrol'),
    tescil: count('tescil'),
    kapanisBekleyen: count('kapanis-bekleyen'),
  };
}

function computeStatSummary(files: CustomsFile[]): FileStatSummary {
  const active = files.filter((f) => !f.isArchived);
  return {
    aktifDosya: active.length,
    evrakBekleyen: active.filter((f) => f.status === 'evrak-bekleniyor').length,
    beyannamedYazim: active.filter((f) => f.status === 'beyanname-yazim').length,
    eskalasyon: active.filter((f) => f.escalation).length,
    tescilde: active.filter((f) => f.status === 'tescil').length,
  };
}

export function buildStatusCounts(files: CustomsFile[]): FileStatusCounts {
  return computeStatusCounts(files);
}

export function buildStatSummary(files: CustomsFile[]): FileStatSummary {
  return computeStatSummary(files);
}

export const filesService = {
  list: async (): Promise<CustomsFile[]> => {
    if (!liveApiEnabled()) return [];
    const rows = await fetchCustomsFiles();
    return rows ?? [];
  },

  get: async (ref: string): Promise<CustomsFile | null> => {
    const all = await filesService.list();
    return all.find((f) => f.ref === ref) ?? null;
  },

  create: async (payload: {
    customerId?: string;
    customerName: string;
    customerCity: string;
    operationType: string;
    transportMode?: string;
    assigneeName?: string | null;
  }): Promise<CustomsFile> => {
    return apiCreateOperationFile({
      ...payload,
      lastActivity: 'Yeni talep oluşturuldu',
    });
  },

  listArchived: async (operationType?: string): Promise<CustomsFile[]> => {
    const all = await filesService.list();
    return all.filter(
      (f) => f.isArchived && (!operationType || f.operationType === operationType)
    );
  },

  getArchivedStats: async (operationType: string): Promise<ArchiveStats> => {
    const records = await filesService.listArchived(operationType);
    const now = new Date();
    const thisMonth = records.filter((f) => {
      if (!f.closedAt) return false;
      const d = new Date(f.closedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const clean = records.filter((f) => !f.escalation && f.missingDocuments.length === 0);
    const warned = records.filter((f) => f.escalation || f.missingDocuments.length > 0);
    return {
      total: records.length,
      thisMonth: thisMonth.length,
      clean: clean.length,
      warned: warned.length,
    };
  },
};
