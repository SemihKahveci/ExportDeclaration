import type { Declaration } from "@/types/declaration.types";

export function SourceTracePanel({ declaration }: { declaration: Declaration | null }) {
  const trace = declaration?.sourceTrace;
  const keys = trace ? Object.keys(trace).sort() : [];

  return (
    <div className="panel stack">
      <h3>Kaynak izi</h3>
      {!declaration && <p style={{ color: "var(--muted)", margin: 0 }}>Beyanname yüklenmedi.</p>}
      {declaration && keys.length === 0 && (
        <p style={{ color: "var(--muted)", margin: 0 }}>Henüz kaynak yok — Normalize sonrası dolabilir.</p>
      )}
      {keys.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Alan</th>
                <th>Kaynak</th>
                <th>Değer</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const e = trace![k];
                if (!e) return null;
                const val =
                  typeof e.value === "object" ? JSON.stringify(e.value, null, 0) : String(e.value ?? "");
                return (
                  <tr key={k}>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {k}
                    </td>
                    <td>{e.source ?? "—"}</td>
                    <td className="mono" style={{ fontSize: 11, maxWidth: 200 }}>
                      {val.length > 120 ? `${val.slice(0, 120)}…` : val}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
