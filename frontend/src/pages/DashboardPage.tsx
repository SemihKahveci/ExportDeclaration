import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDeclarations } from "@/api/declarationApi";
import type { Declaration } from "@/types/declaration.types";

export function DashboardPage() {
  const [rows, setRows] = useState<Declaration[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listDeclarations();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Liste alınamadı");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const count = rows?.length ?? 0;
  const ready = rows?.filter((r) => r.status === "READY" || r.status === "XML_GENERATED").length ?? 0;

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Özet</h1>
      {err && <div className="flash-err">{err}</div>}
      {!err && rows === null && <p style={{ color: "var(--muted)" }}>Yükleniyor…</p>}
      {rows && (
        <>
          <div className="grid-form" style={{ maxWidth: 420 }}>
            <div className="panel">
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Toplam beyanname</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{count}</div>
            </div>
            <div className="panel">
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Normalize/XML aşaması</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{ready}</div>
            </div>
          </div>
          <p>
            <Link to="/declarations/new">Yeni beyanname oluştur</Link> ·{" "}
            <Link to="/declarations">Tümünü listele</Link>
          </p>
        </>
      )}
    </div>
  );
}
