import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import Button from '../../components/ui/Button';
import Pill from '../../components/ui/Pill';
import Note from '../../components/ui/Note';
import { useToast } from '../../components/ui/Toast';
import DocumentEvidenceViewer, { type DocumentEvidenceSelection } from '../../components/documents/DocumentEvidenceViewer';
import { getCurrentDeclarationExceptions, type DeclarationExceptionSnapshot } from '../../api/declarationExceptionApi';
import {
  getCurrentDeclarationHumanReview,
  listDeclarationHumanReviewAudit,
  submitCurrentDeclarationHumanReview,
  type CurrentDeclarationHumanReview,
  type DeclarationHumanReviewAuditRun,
  type DeclarationReviewCandidate,
} from '../../api/declarationHumanReviewApi';

function isMongoId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}
function valueText(value: unknown) {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function documentLabel(type: string) {
  if (type === 'INVOICE') return 'Fatura';
  if (type === 'PACKING_LIST') return 'Çeki / Paketleme Listesi';
  if (type === 'ATR') return 'A.TR';
  return type;
}

type ViewerState = {
  uploadedFileId: string;
  evidence: DocumentEvidenceSelection;
};

export default function IdpReviewTab({ declarationId }: { declarationId: string }) {
  const { toast } = useToast();
  const [review, setReview] = useState<CurrentDeclarationHumanReview | null>(null);
  const [audit, setAudit] = useState<DeclarationHumanReviewAuditRun[]>([]);
  const [exceptions, setExceptions] = useState<DeclarationExceptionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const pendingFields = review?.request?.fields ?? [];
  const allSelected = useMemo(
    () => pendingFields.length > 0 && pendingFields.every((field) => Boolean(selections[field.field])),
    [pendingFields, selections],
  );

  async function load() {
    if (!isMongoId(declarationId)) {
      setReview(null); setAudit([]); return;
    }
    setLoading(true);
    try {
      const [current, history, exceptionState] = await Promise.all([
        getCurrentDeclarationHumanReview(declarationId),
        listDeclarationHumanReviewAudit(declarationId),
        getCurrentDeclarationExceptions(declarationId),
      ]);
      setReview(current);
      setAudit(history);
      setExceptions(exceptionState.current);
      setSelections({});
    } catch (error) {
      console.error(error);
      toast('Beyanname inceleme verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [declarationId]);

  async function keepReviewRequired() {
    if (!review?.request) return;
    setSavingField('__all__');
    try {
      await submitCurrentDeclarationHumanReview(declarationId, {
        sourceResolutionRunId: review.sourceResolutionRunId,
        decisions: review.request.fields.map((item) => ({
          field: item.field,
          decision: 'KEEP_REVIEW_REQUIRED' as const,
          note: 'Kullanıcı incelemeyi açık bıraktı.',
        })),
      });
      toast('İnceleme açık bırakıldı; hiçbir değer authority olarak uygulanmadı.');
      await load();
    } catch (error) {
      console.error(error);
      toast('İnceleme durumu kaydedilemedi.');
    } finally {
      setSavingField(null);
    }
  }

  async function applyAllSelections() {
    if (!review?.request || !allSelected) return;
    setSavingField('__all__');
    try {
      const result = await submitCurrentDeclarationHumanReview(declarationId, {
        sourceResolutionRunId: review.sourceResolutionRunId,
        decisions: review.request.fields.map((item) => ({
          field: item.field,
          decision: 'SELECT_CANDIDATE' as const,
          candidateId: selections[item.field],
        })),
      });
      toast(result.authorityApplied ? 'Seçimler uygulandı ve beyanname çözümü güncellendi.' : 'Kararlar kaydedildi.');
      await load();
    } catch (error) {
      console.error(error);
      toast('Seçimler uygulanamadı. Ekranı yenileyip tekrar deneyin.');
    } finally {
      setSavingField(null);
    }
  }

  function showEvidence(candidate: DeclarationReviewCandidate, index: number) {
    const evidence = candidate.evidence[index];
    if (!evidence || evidence.contentSource === 'DERIVED') return;
    setViewer({
      uploadedFileId: candidate.uploadedFileId,
      evidence: { ...evidence, label: `${documentLabel(candidate.documentType)} · ${candidate.field}` },
    });
  }

  if (!isMongoId(declarationId)) {
    return <Note>Bu örnek dosya canlı bir beyannameye bağlı değil. Beyanname incelemesi yalnız gerçek kayıtlarda gösterilir.</Note>;
  }
  if (loading) {
    return <div className="flex items-center justify-center py-12 gap-2 text-muted"><Loader2 size={18} className="animate-spin" /> Beyanname incelemesi yükleniyor…</div>;
  }
  if (!review) return <Note>Beyanname inceleme bilgisi yüklenemedi.</Note>;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert size={18} />
              <span className="font-bold text-[14px] text-text-strong">Beyanname Çapraz-Belge İncelemesi</span>
              <Pill variant={review.required ? 'warn' : 'ok'}>
                {review.required ? `${pendingFields.length} alan karar bekliyor` : 'İnceleme gerekmiyor'}
              </Pill>
            </div>
            <p className="text-[12.5px] text-muted mt-1 max-w-[900px]">
              Çakışma varken daha önce normalize edilmiş bir değer ekranda bulunabilir; bu değer nihai kabul edilmez.
              Aşağıdaki seçimler yalnız mevcut belge adayları arasından yapılır ve Foundation 6 çözümleme sınırından geçer.
            </p>
          </div>
          <Button icon={RefreshCw} onClick={() => void load()}>Yenile</Button>
        </div>


        {exceptions && exceptions.status !== 'CLEAR' && (
          <div className={`rounded-[9px] border p-4 ${exceptions.status === 'BLOCKED' ? 'border-danger/50 bg-danger-tint' : 'border-warn/50 bg-warn-tint'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert size={18} />
              <span className="font-bold text-[13.5px]">
                Operasyonel durum: {exceptions.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW REQUIRED'}
              </span>
              <Pill variant={exceptions.status === 'BLOCKED' ? 'red' : 'warn'}>
                {exceptions.exceptions.length} exception
              </Pill>
            </div>
            <div className="mt-3 space-y-2">
              {exceptions.exceptions.map((item) => (
                <div key={item.exceptionId} className="rounded bg-surface/70 px-3 py-2 text-[12px]">
                  <b>{item.reason}</b>
                  {item.field && <span className="text-muted"> · {item.field}</span>}
                  {item.confidence !== undefined && (
                    <span className="text-muted">
                      {' '}· güven %{Math.round(item.confidence * 100)}
                      {item.threshold !== undefined ? ` / eşik %${Math.round(item.threshold * 100)}` : ''}
                    </span>
                  )}
                  {item.reason === 'LOW_SELECTED_CANDIDATE_CONFIDENCE' && (
                    <div className="text-muted mt-1">Bu bir authority seçimi değildir; explicit confidence policy nedeniyle insan kontrolü istenir.</div>
                  )}
                  {item.reason === 'FIELD_REVIEW_REQUIRED' && (
                    <div className="text-muted mt-1">Alan mevcut grounded adaylar arasından insan kararı bekliyor.</div>
                  )}
                  {item.reason === 'INTELLIGENCE_REVIEW_REQUIRED' && (
                    <div className="text-muted mt-1">Çapraz-belge intelligence değerlendirmesi insan incelemesi gerektiriyor.</div>
                  )}
                  {item.reason === 'INVALID_INTELLIGENCE_CONFIGURATION' && (
                    <div className="text-muted mt-1">Intelligence yapılandırması geçersiz; otomatik ilerleme bloklandı.</div>
                  )}
                </div>
              ))}
            </div>
            <div className="text-[10.5px] text-muted-2 mt-3">
              assessment {exceptions.assessmentRunId}
            </div>
          </div>
        )}

        {!review.required || !review.request ? (
          <Note variant="ok">Current IDP resolution içinde insan kararı gerektiren çapraz-belge çakışması yok.</Note>
        ) : (
          <>
            <Note variant="warn">
              <b>REVIEW REQUIRED:</b> Çelişkili alanlar çözülmeden mevcut normalize değerleri kesin sonuç olarak kullanmayın.
            </Note>

            {review.request.fields.map((field) => (
              <div key={field.field} className="border border-warn/40 rounded-[9px] overflow-hidden bg-surface">
                <div className="px-4 py-3 bg-warn-tint border-b border-warn/30 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-[13.5px] text-text-strong">{field.field}</div>
                    <div className="text-[11.5px] text-muted mt-0.5">{field.candidates.length} grounded belge adayı</div>
                  </div>
                  <Pill variant="warn">Çakışma</Pill>
                </div>

                <div className="p-4 grid gap-3 md:grid-cols-2">
                  {field.candidates.map((candidate) => {
                    const selected = selections[field.field] === candidate.candidateId;
                    return (
                      <div key={candidate.candidateId}
                        className={`rounded-[8px] border p-3 ${selected ? 'border-accent bg-surface-2' : 'border-line'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Pill variant="gray">{documentLabel(candidate.documentType)}</Pill>
                              <span className="font-mono text-[14px] font-bold text-text-strong">{valueText(candidate.value)}</span>
                            </div>
                            <div className="text-[11.5px] text-muted mt-1">
                              Güven %{Math.round(candidate.confidence * 100)} · {candidate.extractor}
                            </div>
                            <div className="text-[10.5px] text-muted-2 mt-1 break-all">
                              candidate: {candidate.candidateId}
                            </div>
                          </div>
                          <Button
                            icon={Check}
                            variant={selected ? 'primary' : undefined}
                            disabled={savingField !== null}
                            onClick={() => setSelections((old) => ({ ...old, [field.field]: candidate.candidateId }))}
                            writeCap="beyanname.write"
                          >
                            {selected ? 'Seçildi' : 'Bu Adayı Seç'}
                          </Button>
                        </div>

                        {candidate.evidence.length === 0 ? (
                          <div className="text-[11.5px] text-muted mt-3">Bu aday için görüntülenebilir sayfa kanıtı yok.</div>
                        ) : candidate.evidence.map((evidence, index) => (
                          <div key={`${candidate.candidateId}-${index}`} className="mt-2 rounded bg-surface-2 px-3 py-2 text-[12px] flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <b>Sayfa {evidence.pageNumber}</b>
                              {evidence.contentSource && <span className="text-muted"> · {evidence.contentSource === 'OCR' ? 'OCR' : evidence.contentSource === 'NATIVE_TEXT' ? 'PDF metni' : 'Türetilmiş'}</span>}
                              {evidence.text && <div className="mt-1 text-text">“{evidence.text}”</div>}
                            </div>
                            {evidence.contentSource !== 'DERIVED' &&
                              <Button icon={Eye} onClick={() => showEvidence(candidate, index)}>Belgede Göster</Button>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {field.candidates.length === 1 && (
                  <div className="px-4 pb-4">
                    <Note variant="warn">Tek aday görünse bile alan REVIEW_REQUIRED durumundadır; kullanıcı kararı olmadan otomatik authority uygulanmaz.</Note>
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button disabled={savingField !== null} onClick={() => void keepReviewRequired()} writeCap="beyanname.write">
                İnceleme Gerekli Olarak Bırak
              </Button>
              <Button
                variant="primary"
                icon={Check}
                disabled={!allSelected || savingField !== null}
                onClick={() => void applyAllSelections()}
                writeCap="beyanname.write"
              >
                Seçimleri Uygula
              </Button>
            </div>
          </>
        )}

        {audit.length > 0 && (
          <div className="border border-line rounded-[9px] overflow-hidden">
            <div className="px-4 py-3 bg-surface-2 border-b border-line font-bold text-[13px]">İnceleme Audit Geçmişi</div>
            <div className="divide-y divide-line">
              {audit.slice(0, 5).map((run) => (
                <div key={run._id} className="px-4 py-3 text-[12px] flex items-center gap-3 flex-wrap">
                  <Pill variant={run.status === 'DECIDED' ? 'ok' : 'warn'}>{run.status}</Pill>
                  <span className="text-muted">{new Date(run.createdAt).toLocaleString('tr-TR')}</span>
                  <span className="text-muted">{run.decisions.length} karar</span>
                  <code className="text-[10.5px] text-muted-2">{run._id}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DocumentEvidenceViewer
        open={viewer !== null}
        declarationId={declarationId}
        uploadedFileId={viewer?.uploadedFileId ?? ''}
        evidence={viewer?.evidence ?? null}
        onClose={() => setViewer(null)}
      />
    </>
  );
}
