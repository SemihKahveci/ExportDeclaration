import type { Declaration } from "@/types/declaration.types";

export function XmlPanel({
  declaration,
  busyDownload,
  onDownload
}: {
  declaration: Declaration | null;
  busyDownload: boolean;
  onDownload: () => void;
}) {
  const canDownload = declaration?.status === "XML_GENERATED" || Boolean(declaration?.generatedXmlPath);

  return (
    <div className="panel stack">
      <h3>XML</h3>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Önce Validate, ardından Generate XML. İndirme sunucudaki üretilmiş dosyayı alır.
      </p>
      <button type="button" className="primary" disabled={!canDownload || busyDownload} onClick={onDownload}>
        {busyDownload ? "İndiriliyor…" : "XML indir"}
      </button>
      {!canDownload && declaration && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Durum: {declaration.status}</span>
      )}
    </div>
  );
}
