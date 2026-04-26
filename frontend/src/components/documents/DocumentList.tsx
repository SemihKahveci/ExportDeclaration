import type { UploadedDocument } from "@/types/document.types";

const statusLabel: Record<string, string> = {
  PENDING: "Bekliyor",
  SUCCESS: "Tamam",
  FAILED: "Hata",
  MANUAL_REQUIRED: "Manuel"
};

export function DocumentList({ docs }: { docs: UploadedDocument[] }) {
  if (docs.length === 0) {
    return <p style={{ color: "var(--muted)", margin: 0 }}>Henüz belge yok.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Tip</th>
            <th>Dosya</th>
            <th>Çıkarma</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d._id}>
              <td className="mono" style={{ fontSize: 12 }}>
                {d.type}
              </td>
              <td style={{ maxWidth: 160 }}>{d.fileName ?? "—"}</td>
              <td>{statusLabel[d.extractionStatus] ?? d.extractionStatus}</td>
              <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                {(d.parseErrors?.length ?? 0) > 0 ? d.parseErrors!.join("; ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
