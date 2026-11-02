const HOLD_MS = 2 * 60 * 60 * 1000;
const ISTANBUL = "Europe/Istanbul";

export interface SummaryMailRow {
  kind: "waiting";
  ref: string;
  declarationNo: string;
  openedOn: string;
  status: string;
  waiting: string;
  createdAt: number;
}

function part(date: Date, type: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ISTANBUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).find((item) => item.type === type)?.value ?? "";
}

export function istanbulStamp(date: Date, withTime = false): string {
  const day = `${part(date, "day")}.${part(date, "month")}.${part(date, "year")}`;
  if (!withTime) return day;
  return `${day} ${part(date, "hour")}:${part(date, "minute")}`;
}

export function summaryHoldActive(sentAt: Date | null | undefined, now: Date): boolean {
  if (!sentAt || Number.isNaN(sentAt.getTime())) return false;
  const elapsed = now.getTime() - sentAt.getTime();
  return elapsed >= 0 && elapsed < HOLD_MS;
}

export function summaryMailRow(input: {
  ref: string;
  declarationNo?: string | null;
  createdAt: Date;
  missing: string[];
  gtipCount: number;
  gtipSummary?: string | null;
}): SummaryMailRow | null {
  const missing = input.missing.map((item) => item.trim()).filter(Boolean);
  const gtipCount = input.gtipCount > 0 ? input.gtipCount : 0;
  const gtipSummary = input.gtipSummary?.trim() || (gtipCount > 0 ? `${gtipCount} kalemde GTİP` : "");
  if (missing.length === 0 && !gtipSummary) return null;
  const status = [
    missing.length > 0 ? "Eksik Evrak" : "",
    gtipSummary ? "GTİP Hatalı" : ""
  ].filter(Boolean).join(", ");
  const waiting = [missing.join(", "), gtipSummary].filter(Boolean).join(" · ");
  return {
    kind: "waiting",
    ref: input.ref.trim() || "—",
    declarationNo: input.declarationNo?.trim() || "—",
    openedOn: istanbulStamp(input.createdAt),
    status,
    waiting,
    createdAt: input.createdAt.getTime()
  };
}

export function sortSummaryRows(rows: SummaryMailRow[]): SummaryMailRow[] {
  return [...rows].sort((left, right) => left.createdAt - right.createdAt || left.ref.localeCompare(right.ref, "tr"));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HEADERS = ["Referans", "Beyanname No", "Geliş Tarihi", "Statü", "Bekleyen"];

export function summaryTableText(rows: SummaryMailRow[]): string {
  const ordered = sortSummaryRows(rows);
  const lines = ordered.map((row) => [row.ref, row.declarationNo, row.openedOn, row.status, row.waiting].join(" | "));
  return [HEADERS.join(" | "), ...lines].join("\n");
}

export function summaryTableHtml(rows: SummaryMailRow[]): string {
  const cell = "padding:8px 10px;border-bottom:1px solid #e6e6e6;text-align:left;vertical-align:top;";
  const head = `${cell}background:#f4f4f4;font-weight:700;`;
  const header = HEADERS.map((label) => `<th style="${head}">${label}</th>`).join("");
  const body = sortSummaryRows(rows).map((row) => {
    const values = [row.ref, row.declarationNo, row.openedOn, row.status, row.waiting];
    return `<tr>${values.map((value) => `<td style="${cell}">${escapeHtml(value)}</td>`).join("")}</tr>`;
  }).join("");
  return `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#222222;">${header ? `<thead><tr>${header}</tr></thead>` : ""}<tbody>${body}</tbody></table>`;
}

export function cutoffNotice(cutoffAt: Date, now: Date): string {
  const remainingMs = cutoffAt.getTime() - now.getTime();
  const hours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
  return `Cut-off: ${istanbulStamp(cutoffAt, true)} · ${hours} saat kaldı`;
}
