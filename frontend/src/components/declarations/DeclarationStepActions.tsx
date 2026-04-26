import type { DeclarationStatus } from "@/types/declaration.types";
import { DeclarationStatusBadge } from "./DeclarationStatusBadge";

type Step = "extract" | "normalize" | "validate" | "generateXml";

export function DeclarationStepActions({
  status,
  busy,
  onExtract,
  onNormalize,
  onValidate,
  onGenerateXml
}: {
  status: DeclarationStatus;
  busy: Partial<Record<Step, boolean>>;
  onExtract: () => void;
  onNormalize: () => void;
  onValidate: () => void;
  onGenerateXml: () => void;
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="ops-top" style={{ margin: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 14 }}>Beyanname durumu</span>
          <DeclarationStatusBadge status={status} />
        </div>
        <div className="actions-row">
          <button type="button" className="primary" disabled={busy.extract} onClick={onExtract}>
            {busy.extract ? "Extract…" : "Extract"}
          </button>
          <button type="button" className="primary" disabled={busy.normalize} onClick={onNormalize}>
            {busy.normalize ? "Normalize…" : "Normalize"}
          </button>
          <button type="button" disabled={busy.validate} onClick={onValidate}>
            {busy.validate ? "Validate…" : "Validate"}
          </button>
          <button type="button" className="primary" disabled={busy.generateXml} onClick={onGenerateXml}>
            {busy.generateXml ? "XML…" : "Generate XML"}
          </button>
        </div>
      </div>
    </div>
  );
}
