import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  extractDeclaration,
  generateXml,
  getDeclaration,
  normalizeDeclaration,
  patchDeclaration,
  validateDeclaration,
  downloadXmlBlob
} from "@/api/declarationApi";
import { listDocuments } from "@/api/documentApi";
import { DeclarationStepActions } from "@/components/declarations/DeclarationStepActions";
import { GoodsLinesTable } from "@/components/declarations/GoodsLinesTable";
import { NormalizedDataForm } from "@/components/declarations/NormalizedDataForm";
import { SourceTracePanel } from "@/components/declarations/SourceTracePanel";
import { ValidationPanel } from "@/components/declarations/ValidationPanel";
import { XmlPanel } from "@/components/declarations/XmlPanel";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentUploadPanel } from "@/components/documents/DocumentUploadPanel";
import type { Declaration, ValidationResult } from "@/types/declaration.types";
import type { NormalizedDeclaration, UploadedDocument } from "@/types/document.types";
import { mergeNormalizedFromApi } from "@/types/document.types";

type StepBusy = Partial<Record<"extract" | "normalize" | "validate" | "generateXml" | "save" | "download", boolean>>;

export function DeclarationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [norm, setNorm] = useState<NormalizedDeclaration>(() => mergeNormalizedFromApi(undefined));
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<StepBusy>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const show = useCallback((kind: "ok" | "err", text: string) => {
    setBanner({ kind, text });
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [d, list] = await Promise.all([getDeclaration(id), listDocuments(id)]);
    setDeclaration(d);
    setDocuments(list);
    setNorm(mergeNormalizedFromApi(d.normalizedData));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      setLoadErr(null);
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Yüklenemedi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refresh]);

  const setStep = (k: keyof StepBusy, v: boolean) => setBusy((b) => ({ ...b, [k]: v }));

  const onExtract = async () => {
    if (!id) return;
    setStep("extract", true);
    try {
      await extractDeclaration(id);
      await refresh();
      show("ok", "Extract tamamlandı.");
    } catch (e) {
      show("err", e instanceof Error ? e.message : "Extract hatası");
    } finally {
      setStep("extract", false);
    }
  };

  const onNormalize = async () => {
    if (!id) return;
    setStep("normalize", true);
    try {
      const d = await normalizeDeclaration(id);
      setDeclaration(d);
      setNorm(mergeNormalizedFromApi(d.normalizedData));
      await refresh();
      show("ok", "Normalize tamamlandı.");
    } catch (e) {
      show("err", e instanceof Error ? e.message : "Normalize hatası");
    } finally {
      setStep("normalize", false);
    }
  };

  const onValidate = async () => {
    if (!id) return;
    setStep("validate", true);
    try {
      const r = await validateDeclaration(id);
      setValidation(r);
      show(r.ok ? "ok" : "err", r.ok ? "Doğrulama geçti." : "Doğrulama başarısız.");
    } catch (e) {
      show("err", e instanceof Error ? e.message : "Validate hatası");
    } finally {
      setStep("validate", false);
    }
  };

  const onGenerateXml = async () => {
    if (!id) return;
    setStep("generateXml", true);
    try {
      const out = await generateXml(id);
      setDeclaration(out.declaration);
      show("ok", "XML üretildi.");
    } catch (e) {
      show("err", e instanceof Error ? e.message : "XML üretilemedi");
    } finally {
      setStep("generateXml", false);
    }
  };

  const onSaveDraft = async () => {
    if (!id) return;
    setStep("save", true);
    try {
      const next = { ...norm, goodsLines: norm.goodsLines };
      const d = await patchDeclaration(id, { normalizedData: next });
      setDeclaration(d);
      setNorm(mergeNormalizedFromApi(d.normalizedData));
      show("ok", "Taslak kaydedildi.");
    } catch (e) {
      show("err", e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setStep("save", false);
    }
  };

  const onDownload = async () => {
    if (!id) return;
    setStep("download", true);
    try {
      const blob = await downloadXmlBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "beyanname.xml";
      a.click();
      URL.revokeObjectURL(url);
      show("ok", "İndirme başladı.");
    } catch (e) {
      show("err", e instanceof Error ? e.message : "İndirilemedi");
    } finally {
      setStep("download", false);
    }
  };

  if (!id) {
    return <div className="flash-err">Geçersiz adres.</div>;
  }

  if (loadErr) {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <h1 style={{ marginTop: 0 }}>Beyanname detayı</h1>
        <div className="flash-err">{loadErr}</div>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              setLoadErr(null);
              try {
                await refresh();
              } catch (e) {
                setLoadErr(e instanceof Error ? e.message : "Yüklenemedi");
              }
            })();
          }}
        >
          Yeniden dene
        </button>
      </div>
    );
  }

  return (
    <div className="ops-layout">
      <h1 style={{ margin: 0, fontSize: "1.15rem" }}>Beyanname detayı</h1>
      {banner && <div className={banner.kind === "ok" ? "flash-ok" : "flash-err"}>{banner.text}</div>}
      {loadErr && <div className="flash-err">{loadErr}</div>}
      {!loadErr && !declaration && <p style={{ color: "var(--muted)" }}>Yükleniyor…</p>}

      {declaration && (
        <DeclarationStepActions
          status={declaration.status}
          busy={{
            extract: busy.extract,
            normalize: busy.normalize,
            validate: busy.validate,
            generateXml: busy.generateXml
          }}
          onExtract={() => void onExtract()}
          onNormalize={() => void onNormalize()}
          onValidate={() => void onValidate()}
          onGenerateXml={() => void onGenerateXml()}
        />
      )}

      <div className="ops-columns">
        <div className="stack">
          <DocumentUploadPanel declarationId={id} onUploaded={() => refresh()} />
          <div className="panel stack">
            <h3>Yüklenen belgeler</h3>
            <DocumentList docs={documents} />
          </div>
        </div>

        <div className="stack">
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="primary" disabled={busy.save} onClick={() => void onSaveDraft()}>
              {busy.save ? "Kaydediliyor…" : "Formu kaydet (PATCH)"}
            </button>
          </div>
          <NormalizedDataForm value={norm} onChange={setNorm} />
          <GoodsLinesTable lines={norm.goodsLines} onChange={(lines) => setNorm({ ...norm, goodsLines: lines })} />
        </div>

        <div className="stack">
          <ValidationPanel result={validation} />
          <SourceTracePanel declaration={declaration} />
          <XmlPanel
            declaration={declaration}
            busyDownload={Boolean(busy.download)}
            onDownload={() => void onDownload()}
          />
        </div>
      </div>
    </div>
  );
}
