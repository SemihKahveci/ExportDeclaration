import type { ValidationResult } from "@/types/declaration.types";

export function ValidationPanel({ result }: { result: ValidationResult | null }) {
  return (
    <div className="panel stack">
      <h3>Doğrulama</h3>
      {!result && <p style={{ color: "var(--muted)", margin: 0 }}>Validate çalıştırılmadı.</p>}
      {result && (
        <>
          <div className={result.ok ? "flash-ok" : "flash-err"}>{result.ok ? "Geçerli" : "Eksik / hatalı alanlar"}</div>
          {result.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--text)" }}>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
