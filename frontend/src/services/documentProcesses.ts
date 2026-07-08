import type { DocProcess } from '../types';
import {
  createDocumentProcess,
  listDocumentProcesses,
  updateDocumentProcess,
  type CreateDocumentProcessPayload,
} from '../api/documentProcessApi';

function isMongoId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

export const documentProcessService = {
  list: async (): Promise<DocProcess[]> => {
    return listDocumentProcesses();
  },
  create: async (payload: CreateDocumentProcessPayload): Promise<DocProcess> => {
    return createDocumentProcess(payload);
  },
  update: async (id: string, payload: Partial<CreateDocumentProcessPayload>): Promise<DocProcess> => {
    return updateDocumentProcess(id, payload);
  },
  save: async (id: string | null, payload: CreateDocumentProcessPayload): Promise<DocProcess> => {
    if (id && isMongoId(id)) {
      return updateDocumentProcess(id, payload);
    }
    return createDocumentProcess(payload);
  },
  patch: async (id: string, patch: Partial<CreateDocumentProcessPayload>): Promise<DocProcess> => {
    return updateDocumentProcess(id, patch);
  },
};
