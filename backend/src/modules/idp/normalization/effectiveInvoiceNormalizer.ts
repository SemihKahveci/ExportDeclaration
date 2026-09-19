import type { FieldCandidate } from "../domain/fieldCandidate.types.js";
import type { GenericInvoiceCandidateAudit } from "../domain/genericCandidateIntegration.types.js";

const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;
const REQUIRED = ["hsCode", "productCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const;

type DecisionLike = { field?: string; value?: unknown; candidateId?: string; action?: string; createdAt?: Date | string };
export interface EffectiveGoodsLine { lineNo: number; hsCode: string; productCode: string; description: string; quantity: number; unit: string; unitPrice: number; lineTotal: number; }
export interface EffectiveFieldTrace { value: unknown; source: "IDP_GENERIC" | "HUMAN_REVIEW"; candidateId?: string; extractor?: string; evidence?: unknown; decisionAction?: string; }

function key(value: unknown): string {
  if (typeof value === "string") return `s:${value.trim().replace(/\s+/g, " ")}`;
  if (typeof value === "number") return `n:${Object.is(value, -0) ? 0 : value}`;
  return `j:${JSON.stringify(value)}`;
}

function preferredCandidate(field: string, candidates: FieldCandidate[]): FieldCandidate | undefined {
  if (!candidates.length) return undefined;
  const distinct = new Map<string, FieldCandidate[]>();
  for (const candidate of candidates) {
    const group = distinct.get(key(candidate.value)) ?? [];
    group.push(candidate);
    distinct.set(key(candidate.value), group);
  }
  if (distinct.size === 1) return [...distinct.values()][0]!.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
  if (field.endsWith(".productCode")) {
    const observed = candidates.filter(candidate => !candidate.derived);
    if (observed.length && new Set(observed.map(candidate => key(candidate.value))).size === 1) {
      return observed.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
    }
  }
  return undefined;
}

function latestDecisionByField(decisions: DecisionLike[]): Map<string, DecisionLike> {
  const result = new Map<string, DecisionLike>();
  for (const decision of decisions) if (decision.field) result.set(decision.field, decision);
  return result;
}

function assertType(field: string, value: unknown): void {
  if (["quantity", "unitPrice", "lineTotal"].some(name => field.endsWith(`.${name}`))) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Effective field ${field} must be a finite number.`);
  } else if (typeof value !== "string" || !value.trim()) throw new Error(`Effective field ${field} must be a non-empty string.`);
}

export function buildEffectiveInvoiceGoodsLines(audit: GenericInvoiceCandidateAudit, decisions: DecisionLike[] = []): { goodsLines: EffectiveGoodsLine[]; trace: Record<string, EffectiveFieldTrace> } {
  const decisionByField = latestDecisionByField(decisions);
  const rowIndexes = [...new Set(Object.keys(audit.candidates.fields).map(field => ROW_FIELD_RE.exec(field)).filter(Boolean).map(match => Number(match![1])))].sort((a, b) => a - b);
  if (!rowIndexes.length) throw new Error("Generic invoice normalization has no goods rows.");

  const trace: Record<string, EffectiveFieldTrace> = {};
  const goodsLines = rowIndexes.map(rowIndex => {
    const row: Record<string, unknown> = { lineNo: rowIndex + 1 };
    for (const name of REQUIRED) {
      const field = `goodsLines.${rowIndex}.${name}`;
      const decision = decisionByField.get(field);
      if (decision) {
        if (decision.value === undefined || decision.value === null || decision.value === "") throw new Error(`Human review decision for ${field} has no effective value.`);
        assertType(field, decision.value);
        row[name] = decision.value;
        trace[field] = { value: decision.value, source: "HUMAN_REVIEW", candidateId: decision.candidateId, decisionAction: decision.action };
        continue;
      }
      const candidate = preferredCandidate(field, audit.candidates.fields[field] ?? []);
      if (!candidate) throw new Error(`Generic candidates for ${field} are unresolved; human review is required.`);
      assertType(field, candidate.value);
      row[name] = candidate.value;
      trace[field] = { value: candidate.value, source: "IDP_GENERIC", candidateId: candidate.candidateId, extractor: candidate.extractor, evidence: candidate.evidence };
    }
    const quantity = row.quantity as number, unitPrice = row.unitPrice as number, lineTotal = row.lineTotal as number;
    const tolerance = Math.max(0.05, Math.abs(lineTotal) * 0.001);
    if (Math.abs(quantity * unitPrice - lineTotal) > tolerance) throw new Error(`Effective goodsLines.${rowIndex} fails quantity × unitPrice = lineTotal validation.`);
    return row as unknown as EffectiveGoodsLine;
  });
  return { goodsLines, trace };
}
