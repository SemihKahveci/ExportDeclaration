import {
  ValidationSeverity,
  ValidationStatus,
  type ValidationEnvelope,
  type ValidationIssue
} from "../domain/validation.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";

const GTIP_12 = /^\d{12}$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateInvoiceCandidate(data: Record<string, unknown>): ValidationEnvelope {
  const issues: ValidationIssue[] = [];
  const goodsLines = Array.isArray(data.goodsLines) ? data.goodsLines : [];

  if (goodsLines.length === 0) {
    issues.push({
      code: "INVOICE_GOODS_LINES_EMPTY",
      severity: ValidationSeverity.ERROR,
      message: "Faturada doğrulanabilir ürün kalemi bulunamadı.",
      path: "goodsLines"
    });
  }

  const seenLineNos = new Set<number>();
  goodsLines.forEach((rawLine, index) => {
    const line = asRecord(rawLine) ?? {};
    const lineNo = typeof line.lineNo === "number" && Number.isInteger(line.lineNo)
      ? line.lineNo
      : undefined;
    const path = `goodsLines[${index}]`;

    if (lineNo === undefined || lineNo <= 0) {
      issues.push({
        code: "INVOICE_LINE_NUMBER_INVALID",
        severity: ValidationSeverity.ERROR,
        message: "Ürün satır numarası pozitif tam sayı olmalıdır.",
        path: `${path}.lineNo`,
        lineNo
      });
    } else if (seenLineNos.has(lineNo)) {
      issues.push({
        code: "INVOICE_LINE_NUMBER_DUPLICATE",
        severity: ValidationSeverity.ERROR,
        message: `Tekrarlanan ürün satır numarası: ${lineNo}.`,
        path: `${path}.lineNo`,
        lineNo
      });
    } else {
      seenLineNos.add(lineNo);
    }

    const hsCode = typeof line.hsCode === "string" ? line.hsCode.trim() : "";
    if (!hsCode) {
      issues.push({
        code: "INVOICE_GTIP_MISSING",
        severity: ValidationSeverity.WARNING,
        message: "GTIP bulunamadı; insan/resolve incelemesi gerekebilir.",
        path: `${path}.hsCode`,
        lineNo
      });
    } else if (!GTIP_12.test(hsCode)) {
      issues.push({
        code: "INVOICE_GTIP_INVALID_FORMAT",
        severity: ValidationSeverity.ERROR,
        message: "GTIP 12 rakamdan oluşmalıdır.",
        path: `${path}.hsCode`,
        lineNo,
        evidence: { value: hsCode }
      });
    }

    if (!positiveNumber(line.quantity)) {
      issues.push({
        code: "INVOICE_QUANTITY_INVALID",
        severity: ValidationSeverity.ERROR,
        message: "Miktar sıfırdan büyük sayısal bir değer olmalıdır.",
        path: `${path}.quantity`,
        lineNo,
        evidence: { value: line.quantity }
      });
    }
    if (!positiveNumber(line.unitPrice)) {
      issues.push({
        code: "INVOICE_UNIT_PRICE_INVALID",
        severity: ValidationSeverity.ERROR,
        message: "Birim fiyat sıfırdan büyük sayısal bir değer olmalıdır.",
        path: `${path}.unitPrice`,
        lineNo,
        evidence: { value: line.unitPrice }
      });
    }
    if (!positiveNumber(line.lineTotal)) {
      issues.push({
        code: "INVOICE_LINE_TOTAL_INVALID",
        severity: ValidationSeverity.ERROR,
        message: "Satır toplamı sıfırdan büyük sayısal bir değer olmalıdır.",
        path: `${path}.lineTotal`,
        lineNo,
        evidence: { value: line.lineTotal }
      });
    }

    if (typeof line.description !== "string" || !line.description.trim()) {
      issues.push({
        code: "INVOICE_DESCRIPTION_MISSING",
        severity: ValidationSeverity.WARNING,
        message: "Ürün açıklaması bulunamadı.",
        path: `${path}.description`,
        lineNo
      });
    }
    if (typeof line.unit !== "string" || !line.unit.trim()) {
      issues.push({
        code: "INVOICE_UNIT_MISSING",
        severity: ValidationSeverity.WARNING,
        message: "Ürün birimi bulunamadı.",
        path: `${path}.unit`,
        lineNo
      });
    }
    if (line.needsReview === true) {
      issues.push({
        code: "INVOICE_SOURCE_MARKED_FOR_REVIEW",
        severity: ValidationSeverity.WARNING,
        message: "Candidate extractor bu satırı inceleme gerektiriyor olarak işaretledi.",
        path,
        lineNo
      });
    }
  });

  const header = asRecord(data.header);
  const currency = typeof header?.currency === "string" ? header.currency.trim() : "";
  if (!currency) {
    issues.push({
      code: "INVOICE_CURRENCY_MISSING",
      severity: ValidationSeverity.WARNING,
      message: "Fatura para birimi bulunamadı.",
      path: "header.currency"
    });
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({
      code: "INVOICE_CURRENCY_INVALID_FORMAT",
      severity: ValidationSeverity.WARNING,
      message: "Para birimi beklenen ISO-4217 üç harf formatında değil.",
      path: "header.currency",
      evidence: { value: currency }
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === ValidationSeverity.ERROR).length;
  const warningCount = issues.length - errorCount;
  return {
    version: "1",
    status: errorCount === 0 ? ValidationStatus.VALID : ValidationStatus.REVIEW_REQUIRED,
    documentType: ClassifiedDocumentType.INVOICE,
    validator: "invoice-deterministic-v1",
    issues,
    summary: { errorCount, warningCount }
  };
}
