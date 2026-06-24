import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Play, RefreshCw, ShieldCheck, FileCode } from "lucide-react";
import {
  downloadXmlBlob,
  extractDeclaration,
  generateXml,
  getDeclaration,
  normalizeDeclaration,
  validateDeclaration,
} from "@/api/declarationApi";
import type { Declaration, DeclarationStatus, ValidationResult } from "@/api/types/declaration.types";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHead } from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";

type StepBusy = Partial<Record<"extract" | "normalize" | "validate" | "generateXml" | "download", boolean>>;

const STATUS_LABEL: Record<DeclarationStatus, string> = {
  DRAFT: "Taslak",
  READY: "Hazır",
  XML_GENERATED: "XML üretildi",
  ERROR: "Hata",
};

const STATUS_VARIANT: Record<DeclarationStatus, "gray" | "ok" | "accent" | "warn"> = {
  DRAFT: "gray",
  READY: "ok",
  XML_GENERATED: "accent",
  ERROR: "warn",
};

export function DeclarationPipelinePanel({
  declarationId,
  onUpdated,
}: {
  declarationId: string;
  onUpdated?: () => void;
}) {
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState<StepBusy>({});
  const [error, setError] = useState<string | null>(null);

  const setStep = (k: keyof StepBusy, v: boolean) => setBusy((b) => ({ ...b, [k]: v }));

  const refresh = useCallback(async () => {
    const d = await getDeclaration(declarationId);
    setDeclaration(d);
    onUpdated?.();
  }, [declarationId, onUpdated]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await getDeclaration(declarationId);
        if (!cancelled) setDeclaration(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yüklenemedi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [declarationId]);

  async function run(step: keyof StepBusy, fn: () => Promise<void>) {
    setError(null);
    setStep(step, true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setStep(step, false);
    }
  }

  return (
    <Card>
      <CardHead
        title="Backend İşlemleri"
        sub="Çıkarım → normalizasyon → doğrulama → XML"
        actions={
          declaration ? (
            <Pill variant={STATUS_VARIANT[declaration.status]}>{STATUS_LABEL[declaration.status]}</Pill>
          ) : null
        }
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={busy.extract ? Loader2 : Play}
            disabled={!!busy.extract}
            onClick={() =>
              void run("extract", async () => {
                await extractDeclaration(declarationId);
                await refresh();
              })
            }
          >
            {busy.extract ? "Çıkarım…" : "Çıkarım"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={busy.normalize ? Loader2 : RefreshCw}
            disabled={!!busy.normalize}
            onClick={() =>
              void run("normalize", async () => {
                await normalizeDeclaration(declarationId);
                await refresh();
              })
            }
          >
            {busy.normalize ? "Normalizasyon…" : "Normalizasyon"}
          </Button>
          <Button
            size="sm"
            icon={busy.validate ? Loader2 : ShieldCheck}
            disabled={!!busy.validate}
            onClick={() =>
              void run("validate", async () => {
                const r = await validateDeclaration(declarationId);
                setValidation(r);
              })
            }
          >
            {busy.validate ? "Doğrulama…" : "Doğrulama"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={busy.generateXml ? Loader2 : FileCode}
            disabled={!!busy.generateXml}
            onClick={() =>
              void run("generateXml", async () => {
                const out = await generateXml(declarationId);
                setDeclaration(out.declaration);
                onUpdated?.();
              })
            }
          >
            {busy.generateXml ? "XML…" : "XML Üret"}
          </Button>
          {declaration?.generatedXmlPath && (
            <Button
              size="sm"
              icon={busy.download ? Loader2 : Download}
              disabled={!!busy.download}
              onClick={() =>
                void run("download", async () => {
                  const blob = await downloadXmlBlob(declarationId);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `beyanname-${declarationId}.xml`;
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              XML İndir
            </Button>
          )}
        </div>

        {validation && (
          <div
            className={[
              "rounded-lg border px-3 py-2 text-[12.5px]",
              validation.ok ? "border-ok/40 bg-ok-tint text-text" : "border-warn/40 bg-warn-tint text-text",
            ].join(" ")}
          >
            {validation.ok ? (
              <span>Doğrulama geçti.</span>
            ) : (
              <ul className="list-disc pl-4 space-y-0.5">
                {validation.errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p className="text-[12.5px] text-urgent">{error}</p>
        )}
      </CardBody>
    </Card>
  );
}
