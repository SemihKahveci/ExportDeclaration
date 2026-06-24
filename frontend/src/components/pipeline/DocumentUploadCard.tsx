import { useState } from "react";
import { Upload } from "lucide-react";
import { uploadDocument } from "@/api/documentApi";
import type { DocumentType } from "@/api/types/document.types";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHead } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Fields";
import UploadBox from "@/components/ui/UploadBox";

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: "INVOICE", label: "Fatura (INVOICE)" },
  { value: "E_INVOICE_XML", label: "e-Fatura XML" },
  { value: "EXPORT_INVOICE", label: "İhracat faturası" },
  { value: "PACKING_LIST", label: "Çeki listesi" },
  { value: "PROFORMA", label: "Proforma" },
  { value: "BILL_OF_LADING_INSTRUCTION", label: "Konşimento talimatı" },
  { value: "OTHER", label: "Diğer" },
];

export function DocumentUploadCard({
  declarationId,
  onUploaded,
}: {
  declarationId: string;
  onUploaded: () => void | Promise<void>;
}) {
  const [type, setType] = useState<DocumentType>("INVOICE");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
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
  }

  return (
    <Card>
      <CardHead title="Evrak Yükle" sub="PDF, XML veya diğer belge tipleri" />
      <CardBody className="space-y-3">
        <Field label="Belge tipi" htmlFor="doc-type">
          <Select
            id="doc-type"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <UploadBox
          title="Dosya seç"
          hint="PDF, XML, XLSX — max 25 MB"
          onFiles={(files) => setFile(files[0] ?? null)}
        />
        {file && (
          <p className="text-[12px] text-muted">
            Seçili: <span className="font-medium text-text">{file.name}</span>
          </p>
        )}
        {err && <p className="text-[12.5px] text-urgent">{err}</p>}
        <Button
          variant="primary"
          icon={Upload}
          disabled={busy || !file}
          onClick={() => void submit()}
        >
          {busy ? "Yükleniyor…" : "Yükle"}
        </Button>
      </CardBody>
    </Card>
  );
}
