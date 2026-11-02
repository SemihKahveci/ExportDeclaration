import { useEffect, useState, type ReactNode } from "react";
import { Card, CardBody, CardHead } from "../ui/Card";
import Button from "../ui/Button";
import { Field, Input, Select } from "../ui/Fields";
import { ApiError } from "../../api/apiClient";
import {
  previewSummaryPlan,
  type SummaryDayMode,
  type SummaryPlanInput,
  type SummaryRepeat,
  type SummarySendPlan,
} from "../../api/mailPlanApi";

const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Pzt" },
  { value: 2, label: "Sal" },
  { value: 3, label: "Çar" },
  { value: 4, label: "Per" },
  { value: 5, label: "Cum" },
  { value: 6, label: "Cmt" },
  { value: 7, label: "Paz" },
];

function clock(minutes: number | null | undefined, fallback: string): string {
  if (minutes == null || !Number.isInteger(minutes)) return fallback;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function planInputFrom(plan: SummarySendPlan | null): SummaryPlanInput {
  return {
    dayMode: plan?.dayMode ?? "weekdays",
    customDays: plan?.customDays ?? [],
    firstMinutes: clock(plan?.firstMinutes, "10:00"),
    repeat: plan?.repeat ?? "once",
    lastMinutes: plan?.repeat === "every-2h" ? clock(plan.lastMinutes, "18:00") : null,
    cutoffEnabled: plan?.cutoffEnabled === true,
    cutoffLeadHours: plan?.cutoffLeadHours ?? 4,
  };
}

export function SendPlanFields({
  value,
  onChange,
  disabled,
}: {
  value: SummaryPlanInput;
  onChange: (next: SummaryPlanInput) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState("");
  const [issue, setIssue] = useState("");
  const signature = JSON.stringify(value);

  useEffect(() => {
    let cancel = false;
    previewSummaryPlan(value).then((result) => {
      if (cancel) return;
      setIssue("");
      setPreview(result.preview?.preview ?? "");
    }).catch((error: unknown) => {
      if (cancel) return;
      setPreview("");
      setIssue(error instanceof ApiError ? error.message : "Plan önizlenemedi.");
    });
    return () => { cancel = true; };
  }, [signature, value]);

  function toggleDay(day: number) {
    const customDays = value.customDays.includes(day)
      ? value.customDays.filter((item) => item !== day)
      : [...value.customDays, day].sort((left, right) => left - right);
    onChange({ ...value, customDays });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Günler" htmlFor="plan-days">
          <Select
            id="plan-days"
            value={value.dayMode}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, dayMode: event.target.value as SummaryDayMode })}
          >
            <option value="every">Her gün</option>
            <option value="weekdays">Hafta içi</option>
            <option value="weekend">Hafta sonu</option>
            <option value="custom">Seçilen günler</option>
          </Select>
        </Field>
        <Field label="Tekrar" htmlFor="plan-repeat">
          <Select
            id="plan-repeat"
            value={value.repeat}
            disabled={disabled}
            onChange={(event) => {
              const repeat = event.target.value as SummaryRepeat;
              onChange({
                ...value,
                repeat,
                lastMinutes: repeat === "every-2h" ? (value.lastMinutes ?? "18:00") : null,
              });
            }}
          >
            <option value="once">Günde bir kez</option>
            <option value="every-2h">Her 2 saatte bir</option>
          </Select>
        </Field>
      </div>
      {value.dayMode === "custom" && (
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const on = value.customDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                disabled={disabled}
                onClick={() => toggleDay(day.value)}
                className={`px-3 py-1.5 rounded-[7px] border text-[12.5px] font-semibold ${on ? "border-accent bg-accent-tint text-accent" : "border-line text-muted"}`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="İlk gönderim saati" htmlFor="plan-first">
          <Input
            id="plan-first"
            type="time"
            value={value.firstMinutes}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, firstMinutes: event.target.value })}
          />
        </Field>
        {value.repeat === "every-2h" && (
          <Field label="Son gönderim saati" htmlFor="plan-last">
            <Input
              id="plan-last"
              type="time"
              value={value.lastMinutes ?? ""}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, lastMinutes: event.target.value })}
            />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <label className="flex items-center gap-2 text-[13px] font-medium text-text">
          <input
            type="checkbox"
            checked={value.cutoffEnabled}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, cutoffEnabled: event.target.checked })}
          />
          Cut-off uyarısı
        </label>
        {value.cutoffEnabled && (
          <Field label="Kaç saat kala" htmlFor="plan-lead">
            <Input
              id="plan-lead"
              type="number"
              min={1}
              max={72}
              value={String(value.cutoffLeadHours)}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, cutoffLeadHours: Number(event.target.value) })}
            />
          </Field>
        )}
      </div>
      <p className={`text-[12.5px] leading-relaxed ${issue ? "text-danger" : "text-muted"}`}>
        {issue || preview || "Saatler İstanbul saatine göredir."}
      </p>
    </div>
  );
}

export function SendPlanCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHead title={title} sub={sub} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function PlanSaveRow({
  saving,
  disabled,
  onSave,
  writeCap,
}: {
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  writeCap: string;
}) {
  return (
    <div className="flex justify-end">
      <Button variant="primary" size="sm" onClick={onSave} disabled={disabled || saving} writeCap={writeCap}>
        {saving ? "Kaydediliyor…" : "Planı kaydet"}
      </Button>
    </div>
  );
}
