import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  DOC_PARSE_STATUSES,
  DOC_PROCESS_STATUSES,
  DOC_TEST_RESULTS,
  DocumentProcessModel,
  type DocumentProcessDoc
} from "./documentProcess.model.js";
import { toDocumentProcessDto, type DocumentProcessDto } from "./documentProcess.mapper.js";

export type CreateDocumentProcessInput = Omit<DocumentProcessDto, "id">;
export type UpdateDocumentProcessInput = Partial<CreateDocumentProcessInput>;

function assertParseable(v: unknown): DocumentProcessDoc["parseable"] {
  if (v === "Evet" || v === "Hayır") return v;
  return "Evet";
}

function assertTestResult(v: unknown): DocumentProcessDoc["testResult"] {
  if (
    typeof v === "string" &&
    DOC_TEST_RESULTS.includes(v as (typeof DOC_TEST_RESULTS)[number])
  ) {
    return v as DocumentProcessDoc["testResult"];
  }
  return "Test Bekliyor";
}

function assertStatus(v: unknown): DocumentProcessDoc["status"] {
  if (v === "Aktif" || v === "Pasif") return v;
  return "Aktif";
}

function normalizePayload(body: Partial<CreateDocumentProcessInput>): CreateDocumentProcessInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new HttpError(400, "Evrak tipi adı gerekli.");

  const process = typeof body.process === "string" ? body.process.trim() : "";
  if (!process) throw new HttpError(400, "Süreç bilgisi gerekli.");

  return {
    name,
    process,
    format: typeof body.format === "string" && body.format.trim() ? body.format.trim() : "—",
    parseable: assertParseable(body.parseable),
    testResult: assertTestResult(body.testResult),
    successRate:
      typeof body.successRate === "string" && body.successRate.trim()
        ? body.successRate.trim()
        : "—",
    supportNote: typeof body.supportNote === "string" ? body.supportNote.trim() : "",
    status: assertStatus(body.status)
  };
}

export async function listDocumentProcesses(
  companyId: mongoose.Types.ObjectId
): Promise<DocumentProcessDto[]> {
  const rows = await DocumentProcessModel.find({ companyId }).sort({ createdAt: -1 });
  return rows.map(toDocumentProcessDto);
}

export async function createDocumentProcess(
  companyId: mongoose.Types.ObjectId,
  body: CreateDocumentProcessInput
): Promise<DocumentProcessDto> {
  const payload = normalizePayload(body);
  const created = await DocumentProcessModel.create({ companyId, ...payload });
  return toDocumentProcessDto(created);
}

export async function updateDocumentProcess(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: UpdateDocumentProcessInput
): Promise<DocumentProcessDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kayıt id.");

  const existing = await DocumentProcessModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Doküman süreci bulunamadı.");

  const merged: CreateDocumentProcessInput = {
    name: body.name ?? existing.name,
    process: body.process ?? existing.process,
    format: body.format ?? existing.format,
    parseable: body.parseable ?? existing.parseable,
    testResult: body.testResult ?? existing.testResult,
    successRate: body.successRate ?? existing.successRate,
    supportNote: body.supportNote ?? existing.supportNote,
    status: body.status ?? existing.status
  };
  const payload = normalizePayload(merged);

  existing.name = payload.name;
  existing.process = payload.process;
  existing.format = payload.format;
  existing.parseable = payload.parseable;
  existing.testResult = payload.testResult;
  existing.successRate = payload.successRate;
  existing.supportNote = payload.supportNote;
  existing.status = payload.status;

  await existing.save();
  return toDocumentProcessDto(existing);
}

export async function deleteDocumentProcess(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kayıt id.");
  const deleted = await DocumentProcessModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Doküman süreci bulunamadı.");
}
