import { useState } from "react";
import { uploadDocument } from "@/api/documentApi";
import type { DocumentType } from "@/types/document.types";

const types: { value: DocumentType; label: string }[] = [
  { value: "INVOICE", label: "Fatura (INVOICE)" },
  { value: "E_INVOICE_XML", label: "e-Fatura XML" },
  { value: "EXPORT_INVOICE", label: "İhracat faturası (xlsx)" },
  { value: "PACKING_LIST", label: "Çeki listesi" },
  { value: "PROFORMA", label: "Proforma" },
  { value: "BILL_OF_LADING_INSTRUCTION", label: "Konşimento talimatı" },
  { value: "OTHER", label: "Diğer" }
];

export function DocumentUploadPanel({
  declarationId,
  onUploaded
}: {
  declarationId: string;
  onUploaded: () => Promise<void> | void;
}) {
  const [type, setType] = useState<DocumentType>("INVOICE");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!file) {
      setErr("Dosya seçin.");
      return;
    }
    setBusy(true);
    try {
      await uploadDocument(declarationId, file, type);
      setFile(null);
      await onUploaded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel stack">
      <h3>Belge yükleme</h3>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Akış: önce zorunlu <strong>INVOICE</strong> veya <strong>E_INVOICE_XML</strong>, sonra isteğe bağlı diğerleri.
      </p>
      <div>
        <label>Belge tipi</label>
        <select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Dosya</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {err && <div className="flash-err">{err}</div>}
      <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? "Yükleniyor…" : "Yükle"}
      </button>
    </div>
  );
}
