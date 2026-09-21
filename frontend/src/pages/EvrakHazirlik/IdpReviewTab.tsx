import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, FileSearch, Loader2, RefreshCw } from 'lucide-react';
import Button from '../../components/ui/Button';
import Pill from '../../components/ui/Pill';
import Note from '../../components/ui/Note';
import { useToast } from '../../components/ui/Toast';
import {
  appendHumanReviewDecision,
  getLatestHumanReview,
  listHumanReviewDecisions,
  type HumanReviewCase,
  type HumanReviewDecision,
  type HumanReviewIssue,
} from '../../api/idpReviewApi';
import DocumentEvidenceViewer, { type DocumentEvidenceSelection } from '../../components/documents/DocumentEvidenceViewer';

function isMongoId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}

function sourceLabel(source: HumanReviewIssue['source']) {
  if (source === 'VALIDATION') return 'Doğrulama';
  if (source === 'GENERIC_EVIDENCE') return 'Belge Kanıtı';
  return 'Çözümleme';
}

function valueText(value: unknown) {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export default function IdpReviewTab({ declarationId }: { declarationId: string }) {
  const { toast } = useToast();
  const [review, setReview] = useState<HumanReviewCase | null>(null);
  const [decisions, setDecisions] = useState<HumanReviewDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingIssueId, setSavingIssueId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [viewerEvidence, setViewerEvidence] = useState<DocumentEvidenceSelection | null>(null);

  const decidedIssueIds = useMemo(() => new Set(decisions.map((d) => d.issueId)), [decisions]);

  async function load() {
    if (!isMongoId(declarationId)) {
      setReview(null);
      setDecisions([]);
      return;
    }
    setLoading(true);
    try {
      const next = await getLatestHumanReview(declarationId);
      setReview(next);
      setDecisions(next ? await listHumanReviewDecisions(declarationId, next.processingRunId) : []);
    } catch (error) {
      console.error(error);
      toast('IDP inceleme verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [declarationId]);

  async function decide(issue: HumanReviewIssue, body: { action: 'ACCEPT_CANDIDATE'; candidateId: string } | { action: 'OVERRIDE_VALUE'; value: string }) {
    if (!review) return;
    setSavingIssueId(issue.issueId);
    try {
      await appendHumanReviewDecision(declarationId, review.processingRunId, { issueId: issue.issueId, ...body });
      const nextDecisions = await listHumanReviewDecisions(declarationId, review.processingRunId);
      setDecisions(nextDecisions);
      toast('Belge inceleme kararı kaydedildi.');
    } catch (error) {
      console.error(error);
      toast('Karar kaydedilemedi.');
    } finally {
      setSavingIssueId(null);
    }
  }

  if (!isMongoId(declarationId)) {
    return <Note>Bu örnek dosya canlı bir beyannameye bağlı değil. IDP inceleme yalnız gerçek beyanname kayıtlarında gösterilir.</Note>;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 gap-2 text-muted"><Loader2 size={18} className="animate-spin" /> IDP inceleme yükleniyor…</div>;
  }

  if (!review) {
    return <Note>Bu beyanname için henüz bir IDP processing run bulunmuyor.</Note>;
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSearch size={18} />
            <span className="font-bold text-[14px] text-text-strong">Belge İncelemesi</span>
            <Pill variant={review.pendingIssueCount ? 'warn' : 'ok'}>
              {review.pendingIssueCount ? `${review.pendingIssueCount} karar bekliyor` : 'Tamamlandı'}
            </Pill>
          </div>
          <p className="text-[12.5px] text-muted mt-1">
            Buradaki kararlar yalnız belgenin ne söylediğini doğrular. Gümrük/master-data değişiklikleri bu ekrandan yapılmaz.
          </p>
        </div>
        <Button icon={RefreshCw} onClick={() => void load()}>Yenile</Button>
      </div>

      {review.issues.length === 0 ? (
        <Note variant="ok">Bu processing run için manuel belge incelemesi gerektiren bir alan yok.</Note>
      ) : review.issues.map((issue) => {
        const decided = decidedIssueIds.has(issue.issueId);
        const busy = savingIssueId === issue.issueId;
        return (
          <div key={issue.issueId} className="border border-line rounded-[9px] overflow-hidden bg-surface">
            <div className="px-4 py-3 border-b border-line bg-surface-2 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill variant={decided ? 'ok' : 'warn'}>{decided ? 'Karar verildi' : 'Bekliyor'}</Pill>
                  <span className="text-[12px] text-muted">{sourceLabel(issue.source)}</span>
                  {issue.lineNo && <span className="text-[12px] text-muted">Satır {issue.lineNo}</span>}
                  {issue.field && <code className="text-[11.5px] text-muted">{issue.field}</code>}
                </div>
                <div className="text-[13px] font-semibold text-text-strong mt-1.5">{issue.message}</div>
              </div>
              <span className="text-[11px] text-muted-2">{issue.code}</span>
            </div>

            <div className="p-4 space-y-3">
              {issue.candidates.length > 0 ? issue.candidates.map((candidate) => (
                <div key={candidate.candidateId} className="border border-line rounded-[8px] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-[13px] font-semibold">{valueText(candidate.value)}</div>
                      <div className="text-[11.5px] text-muted mt-1">
                        Güven %{Math.round(candidate.confidence * 100)} · {candidate.extractor}
                      </div>
                    </div>
                    <Button
                      icon={Check}
                      disabled={decided || busy}
                      onClick={() => void decide(issue, { action: 'ACCEPT_CANDIDATE', candidateId: candidate.candidateId })}
                      writeCap="beyanname.write"
                    >
                      Bu Değeri Doğrula
                    </Button>
                  </div>
                  {candidate.evidence.map((evidence, index) => (
                    <div key={`${candidate.candidateId}-${index}`} className="mt-2 rounded bg-surface-2 px-3 py-2 text-[12px] flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold">Sayfa {evidence.pageNumber}</span>
                        <span className="text-muted"> · {evidence.contentSource === 'OCR' ? 'OCR' : evidence.contentSource === 'NATIVE_TEXT' ? 'PDF metni' : 'Türetilmiş'}</span>
                        {evidence.text && <div className="mt-1 text-text">“{evidence.text}”</div>}
                      </div>
                      {evidence.contentSource !== 'DERIVED' && <Button icon={Eye} onClick={() => setViewerEvidence({ ...evidence, label: issue.field ?? 'Belge Kanıtı' })}>Belgede Göster</Button>}
                    </div>
                  ))}
                </div>
              )) : (
                <Note variant="warn">Bu sorun için seçilebilir canonical aday yok. Gerekirse aşağıdan manuel belge değeri girin.</Note>
              )}

              {!decided && (
                <div className="flex gap-2 pt-1">
                  <input
                    value={overrides[issue.issueId] ?? ''}
                    onChange={(e) => setOverrides((old) => ({ ...old, [issue.issueId]: e.target.value }))}
                    placeholder="Belgede gördüğünüz doğru değer"
                    className="flex-1 border border-line-strong rounded-[7px] px-3 py-2 text-[13px] bg-surface focus:outline-none focus:border-accent"
                  />
                  <Button
                    disabled={busy || !(overrides[issue.issueId] ?? '').trim()}
                    onClick={() => void decide(issue, { action: 'OVERRIDE_VALUE', value: (overrides[issue.issueId] ?? '').trim() })}
                    writeCap="beyanname.write"
                  >
                    Manuel Değeri Kaydet
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
    <DocumentEvidenceViewer
      open={viewerEvidence !== null}
      declarationId={declarationId}
      uploadedFileId={review.uploadedFileId}
      evidence={viewerEvidence}
      onClose={() => setViewerEvidence(null)}
    />
    </>
  );
}
