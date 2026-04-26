import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listDeclarations } from "@/api/declarationApi";
import { DeclarationTable } from "@/components/declarations/DeclarationTable";
import type { Declaration } from "@/types/declaration.types";

export function DeclarationsPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Declaration[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await listDeclarations();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Hata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Beyannameler</h1>
        <button type="button" className="primary" onClick={() => nav("/declarations/new")}>
          Yeni beyanname
        </button>
      </div>
      {err && <div className="flash-err">{err}</div>}
      {loading && <p style={{ color: "var(--muted)" }}>Yükleniyor…</p>}
      {!loading && !err && <DeclarationTable rows={rows} />}
    </div>
  );
}
