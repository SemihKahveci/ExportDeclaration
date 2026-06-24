import { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Send, Pencil, CheckCircle2, MousePointer2, FileText, Database } from 'lucide-react';
import type { MtKontrolMapping, MtKontrolStatus } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { PAGE_IMAGES } from './pageImages';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<MtKontrolStatus, string> = {
  'uyumlu':           'text-ok bg-ok/8 border-ok/20',
  'uyumsuz':          'text-warn bg-warn-tint border-warn/30',
  'kontrol-bekliyor': 'text-muted bg-surface-2 border-line-strong',
};

const STATUS_LABELS: Record<MtKontrolStatus, string> = {
  'uyumlu':           'Uyumlu',
  'uyumsuz':          'Uyuşmazlık',
  'kontrol-bekliyor': 'Kontrol Bekliyor',
};

function StatusBadge({ status }: { status: MtKontrolStatus }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[status]}`}>
      {status === 'uyumsuz' && <AlertTriangle size={10} strokeWidth={2} className="mr-1" />}
      {status === 'uyumlu'  && <CheckCircle2  size={10} strokeWidth={2} className="mr-1" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Source document preview panel ────────────────────────────────────────────

function SourceDocPreview({ mapping }: { mapping: MtKontrolMapping }) {
  if (mapping.sourceDocumentType === 'database_record') {
    return (
      <div className="border border-line rounded-xl overflow-hidden shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-3 bg-surface-2 border-b border-line">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Database size={15} strokeWidth={1.75} className="text-accent" />
          </div>
          <div>
            <p className="text-[12.5px] font-bold text-text-strong leading-tight">{mapping.sourceDocumentName}</p>
            <p className="text-[11px] text-muted leading-tight mt-0.5">Veritabanı kaydı</p>
          </div>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3 text-[12px]">
            <span className="text-muted shrink-0">{mapping.sourceDocumentFieldLabel}</span>
            <span className="text-right font-semibold text-text-strong font-mono text-[11.5px]">{mapping.sourceDocumentValue}</span>
          </div>
          <div className="mt-1">
            <StatusBadge status={mapping.status} />
          </div>
        </div>
      </div>
    );
  }

  // document type — show preview image if available, else a placeholder card
  if (mapping.sourceDocumentPreviewImage) {
    return (
      <div
        className="relative bg-[#f0ede8] border border-line rounded-xl overflow-hidden shrink-0"
        style={{ aspectRatio: '1 / 1.0' }}
      >
        <img
          src={mapping.sourceDocumentPreviewImage}
          alt={mapping.sourceDocumentName}
          className="w-full h-full object-contain"
          draggable={false}
        />
        <div
          className="absolute border-2 border-amber-500 bg-amber-400/20 rounded pointer-events-none z-10 transition-all duration-200"
          style={{
            left:   `${mapping.sourceDocumentRegion.x}%`,
            top:    `${mapping.sourceDocumentRegion.y}%`,
            width:  `${mapping.sourceDocumentRegion.width}%`,
            height: `${mapping.sourceDocumentRegion.height}%`,
          }}
        >
          <span className="absolute -top-5 left-0 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap leading-none">
            {mapping.sourceDocumentFieldLabel}
          </span>
        </div>
      </div>
    );
  }

  // No actual preview image available for this source document
  return (
    <div className="border border-line rounded-xl overflow-hidden shrink-0">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-surface-2 border-b border-line">
        <div className="w-8 h-8 rounded-lg bg-surface border border-line-strong flex items-center justify-center shrink-0">
          <FileText size={15} strokeWidth={1.75} className="text-muted" />
        </div>
        <div>
          <p className="text-[12.5px] font-bold text-text-strong leading-tight">{mapping.sourceDocumentName}</p>
          <p className="text-[11px] text-muted leading-tight mt-0.5">Kaynak belge</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={mapping.status} />
        </div>
      </div>

      {/* Parsed field rows from this source document */}
      <div className="divide-y divide-line">
        <div className="flex items-start justify-between gap-3 px-4 py-3 text-[12px]">
          <span className="text-muted shrink-0">Okunan Alan</span>
          <span className="text-right font-semibold text-text">{mapping.sourceDocumentFieldLabel}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-4 py-3 text-[12px]">
          <span className="text-muted shrink-0">Belgedeki Değer</span>
          <span className="text-right font-semibold text-text-strong font-mono text-[11.5px]">{mapping.sourceDocumentValue}</span>
        </div>
        <div className="flex items-start justify-between gap-3 px-4 py-3 text-[12px]">
          <span className="text-muted shrink-0">Beyanname Değeri</span>
          <span className={[
            'text-right font-semibold font-mono text-[11.5px]',
            mapping.status === 'uyumsuz' ? 'text-warn' : 'text-ok',
          ].join(' ')}>{mapping.declarationValue}</span>
        </div>
      </div>

      {mapping.status === 'uyumsuz' && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 p-2.5 rounded-lg text-[11.5px]" style={{ background: 'var(--warn-tint)', border: '1px solid #e8d0a2', color: '#7a5a16' }}>
            <AlertTriangle size={13} strokeWidth={2} className="shrink-0 mt-0.5" />
            <span>Beyanname değeri ile kaynak belge değeri uyuşmuyor.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ControlTabProps {
  mappings: MtKontrolMapping[];
  onSistemeGonder: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ControlTab({ mappings, onSistemeGonder }: ControlTabProps) {
  const [activePage, setActivePage] = useState(0);
  const [activeId,   setActiveId]   = useState<string | null>(null);

  const active = mappings.find((m) => m.id === activeId) ?? null;
  const pageBoxes = mappings.filter((m) => m.declarationPage === activePage);

  function handleBoxClick(mapping: MtKontrolMapping) {
    setActiveId((prev) => prev === mapping.id ? null : mapping.id);
  }

  return (
    <div className="flex gap-4 h-full">

      {/* ── Left: Declaration image ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wide shrink-0 flex items-center gap-1.5">
          <MousePointer2 size={11} strokeWidth={2} />
          Beyanname alanına tıklayın
        </p>

        <div
          className="relative bg-[#f0ede8] border border-line rounded-xl overflow-hidden flex-1"
          style={{ minHeight: 0 }}
        >
          <img
            src={PAGE_IMAGES[activePage]}
            alt={`Beyanname Sayfa ${activePage + 1}`}
            className="w-full h-full object-contain"
            draggable={false}
          />

          {pageBoxes.map((mapping) => {
            const r = mapping.declarationRegion;
            const isActive = activeId === mapping.id;
            const isConflict = mapping.status === 'uyumsuz';
            return (
              <button
                key={mapping.id}
                type="button"
                onClick={() => handleBoxClick(mapping)}
                className={[
                  'absolute rounded transition-all duration-150 group',
                  isActive
                    ? 'border-2 border-accent bg-accent/15 shadow-lg z-20'
                    : isConflict
                    ? 'border-2 border-warn/70 bg-warn-tint/20 hover:bg-warn-tint/40 hover:border-warn z-10'
                    : 'border border-accent/40 bg-transparent hover:bg-accent/8 hover:border-accent z-10',
                ].join(' ')}
                style={{
                  left:   `${r.x}%`,
                  top:    `${r.y}%`,
                  width:  `${r.width}%`,
                  height: `${r.height}%`,
                }}
                title={mapping.declarationFieldName}
              >
                <span
                  className={[
                    'absolute -top-5 left-0 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap leading-none pointer-events-none transition-opacity',
                    isActive
                      ? 'bg-accent opacity-100'
                      : isConflict
                      ? 'bg-warn opacity-0 group-hover:opacity-100'
                      : 'bg-accent opacity-0 group-hover:opacity-100',
                  ].join(' ')}
                >
                  {mapping.declarationFieldName}
                </span>
                {isConflict && !isActive && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-warn border border-white" />
                )}
              </button>
            );
          })}
        </div>

        {/* Page navigation */}
        <div className="flex items-center justify-center gap-3 shrink-0">
          <button
            onClick={() => { setActivePage((p) => Math.max(0, p - 1)); setActiveId(null); }}
            disabled={activePage === 0}
            className="w-7 h-7 flex items-center justify-center rounded border border-line text-muted hover:bg-line disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[12.5px] text-muted">
            Sayfa {activePage + 1} / {PAGE_IMAGES.length}
          </span>
          <button
            onClick={() => { setActivePage((p) => Math.min(PAGE_IMAGES.length - 1, p + 1)); setActiveId(null); }}
            disabled={activePage === PAGE_IMAGES.length - 1}
            className="w-7 h-7 flex items-center justify-center rounded border border-line text-muted hover:bg-line disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Right: Source preview + details + control ──────────────────────── */}
      <div className="w-[310px] shrink-0 flex flex-col gap-3">

        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide shrink-0">
            {active ? `Kaynak: ${active.sourceDocumentName}` : 'Kaynak Belge'}
          </p>

          {active ? (
            <>
              {/* Source document preview — type-aware */}
              <SourceDocPreview mapping={active} />

              {/* Field details card */}
              <div className="border border-line rounded-xl overflow-hidden shrink-0">
                <div className="px-4 py-2.5 bg-surface-2 border-b border-line flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-text-strong truncate">{active.declarationFieldName}</span>
                  <StatusBadge status={active.status} />
                </div>
                <div className="divide-y divide-line">
                  {([
                    { label: 'Beyanname Alanı', value: active.declarationFieldName },
                    { label: 'Beyanname Değeri', value: active.declarationValue },
                    { label: 'Kaynak Doküman',  value: active.sourceDocumentName },
                    { label: 'Kaynak Alan',      value: active.sourceDocumentFieldLabel },
                    { label: 'Kaynak Değer',     value: active.sourceDocumentValue },
                  ] as const).map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-4 py-2.5 text-[12px]">
                      <span className="text-muted shrink-0">{label}</span>
                      <span className={[
                        'text-right leading-snug',
                        label === 'Beyanname Değeri' || label === 'Kaynak Değer'
                          ? 'font-semibold text-text-strong font-mono text-[11.5px]'
                          : 'font-medium text-text',
                      ].join(' ')}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="border border-dashed border-line-strong rounded-xl flex flex-col items-center justify-center gap-3 py-10 px-6 text-center min-h-[200px]">
              <div className="w-10 h-10 rounded-full bg-surface-2 border border-line flex items-center justify-center">
                <MousePointer2 size={18} strokeWidth={1.5} className="text-muted-2" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-text-strong">Alan Seçilmedi</p>
                <p className="text-[12px] text-muted mt-1 leading-snug">
                  Sol taraftaki beyanname üzerinden bir alana tıklayın.
                </p>
              </div>
            </div>
          )}

          {/* All mappings quick-nav */}
          <div className="shrink-0 mt-1">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
              Tüm Alanlar ({mappings.length})
            </p>
            <div className="flex flex-col gap-1">
              {mappings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setActiveId(m.id); setActivePage(m.declarationPage); }}
                  className={[
                    'w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-[12px] transition-colors',
                    activeId === m.id
                      ? 'border-accent bg-accent/6 text-text-strong'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2 text-text',
                  ].join(' ')}
                >
                  <span className="truncate font-medium">{m.declarationFieldName}</span>
                  <StatusBadge status={m.status} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Control action card */}
        <Card className="shrink-0">
          <CardHead title="Kontrol Kararı" />
          <CardBody>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="warn" icon={Pencil} size="sm">
                Manuel Düzelt
              </Button>
              <Button
                variant="primary"
                icon={Send}
                size="sm"
                onClick={onSistemeGonder}
              >
                Kontrolü Onayla
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
