import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createDeclaration } from "@/api/declarationApi";

export function NewDeclarationPage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCreate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const d = await createDeclaration();
      nav(`/declarations/${d._id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Yeni beyanname</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Önce boş bir beyanname kaydı açılır; ardından belge yükleme ve extract/normalize adımlarına geçilir.
      </p>
      {err && <div className="flash-err">{err}</div>}
      <button type="button" className="primary" disabled={busy} onClick={() => void onCreate()}>
        {busy ? "Oluşturuluyor…" : "Beyanname oluştur"}
      </button>
    </div>
  );
}
