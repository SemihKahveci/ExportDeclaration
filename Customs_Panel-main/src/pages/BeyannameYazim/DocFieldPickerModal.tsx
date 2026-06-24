import { useState, useEffect } from 'react';
import { X, Check, FileText } from 'lucide-react';
import type { DocumentFieldRegion } from '../../types';
import { DOCUMENT_FIELD_REGIONS } from '../../services/documents';
import Button from '../../components/ui/Button';

// ─── Document color palette — one accent per doc type ─────────────────────────

const DOC_COLORS: Record<string, { bg: string; border: string; text: string; header: string }> = {
  'Fatura':       { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', header: '#DBEAFE' },
  'CMR':          { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', header: '#DCFCE7' },
  'Çeki Listesi': { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', header: '#FEF3C7' },
  'Konşimento':   { bg: '#FDF4FF', border: '#E9D5FF', text: '#7E22CE', header: '#F3E8FF' },
  'AWB':          { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', header: '#FFEDD5' },
};

const fallbackColor = { bg: '#F9FAFB', border: '#E5E7EB', text: '#374151', header: '#F3F4F6' };

function getDocColor(docType: string) {
  return DOC_COLORS[docType] ?? fallbackColor;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocFieldPickerModalProps {
  open: boolean;
  /** The declaration field name being mapped */
  declarationFieldName: string;
  /** The value currently in that field */
  declarationFieldValue: string;
  /** Which document type to preview */
  documentType: string;
  /** Currently selected region id (may be empty) */
  selectedRegionId: string;
  onClose: () => void;
  onSave: (regionId: string, regionLabel: string) => void;
}

// ─── Schematic document preview ───────────────────────────────────────────────

interface SchematicDocProps {
  documentType: string;
  regions: DocumentFieldRegion[];
  selectedId: string;
  hoveredId: string;
  onHover: (id: string) => void;
  onSelect: (id: string) => void;
}

function SchematicDoc({ documentType, regions, selectedId, hoveredId, onHover, onSelect }: SchematicDocProps) {
  const colors = getDocColor(documentType);

  return (
    <div
      className="relative w-full select-none"
      style={{
        // A4-ish aspect ratio (1:1.414)
        paddingBottom: '141.4%',
        background: '#ffffff',
        border: '1.5px solid #D1D5DB',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
      }}
    >
      {/* Document type watermark header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: colors.border, background: colors.header, borderRadius: '5px 5px 0 0' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={13} style={{ color: colors.text }} strokeWidth={2} />
          <span className="text-[11px] font-bold" style={{ color: colors.text }}>{documentType}</span>
        </div>
        <span className="text-[10px] text-gray-400">Şematik Önizleme</span>
      </div>

      {/* Field regions */}
      {regions.map((region) => {
        const isSelected = region.id === selectedId;
        const isHovered  = region.id === hoveredId && !isSelected;

        let bg     = 'rgba(0,0,0,0)';
        let border = '#D1D5DB';
        let labelColor = '#6B7280';

        if (isSelected) {
          bg          = 'rgba(59,130,246,0.18)';
          border      = '#3B82F6';
          labelColor  = '#1D4ED8';
        } else if (isHovered) {
          bg          = colors.bg;
          border      = colors.border;
          labelColor  = colors.text;
        }

        return (
          <button
            key={region.id}
            type="button"
            onClick={() => onSelect(region.id)}
            onMouseEnter={() => onHover(region.id)}
            onMouseLeave={() => onHover('')}
            className="absolute transition-all duration-100 text-left group"
            style={{
              left:   `${region.x}%`,
              top:    `calc(4% + ${region.y}%)`,   // offset for header
              width:  `${region.width}%`,
              height: `${region.height}%`,
              background: bg,
              border: `1.5px solid ${border}`,
              borderRadius: '3px',
              cursor: 'pointer',
            }}
            title={region.label}
          >
            {/* Region label */}
            <span
              className="absolute inset-0 flex items-center justify-center text-center px-1"
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: labelColor,
                lineHeight: 1.2,
                pointerEvents: 'none',
              }}
            >
              {region.label}
              {isSelected && (
                <Check size={8} strokeWidth={3} className="ml-1 shrink-0" />
              )}
            </span>
          </button>
        );
      })}

      {/* Empty state grid lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, #000 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, #000 0px, transparent 1px, transparent 20px)',
          top: '4%',
        }}
      />
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function DocFieldPickerModal({
  open,
  declarationFieldName,
  declarationFieldValue,
  documentType,
  selectedRegionId,
  onClose,
  onSave,
}: DocFieldPickerModalProps) {
  const [localSelected, setLocalSelected] = useState(selectedRegionId);
  const [hovered, setHovered] = useState('');

  useEffect(() => {
    if (open) setLocalSelected(selectedRegionId);
  }, [open, selectedRegionId]);

  const regions = DOCUMENT_FIELD_REGIONS.filter((r) => r.documentType === documentType);
  const selectedRegion = regions.find((r) => r.id === localSelected);

  function handleSave() {
    if (selectedRegion) {
      onSave(selectedRegion.id, selectedRegion.label);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="fixed z-50 flex flex-col"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(860px, calc(100vw - 48px))',
          height: 'min(680px, calc(100vh - 48px))',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-text-strong">Doküman Alanı Seç</h2>
            <p className="text-[12px] text-muted mt-0.5">
              Beyanname alanının dokümanda hangi bölgeden okunacağını seçin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-muted hover:bg-line hover:text-text transition-colors mt-0.5 shrink-0"
            aria-label="Kapat"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Left — field info + region list */}
          <div className="w-[240px] shrink-0 flex flex-col border-r border-line">
            {/* Beyanname field info */}
            <div className="px-4 py-4 border-b border-line">
              <div className="text-[10.5px] font-bold uppercase tracking-[.07em] text-muted-2 mb-2">Beyanname Alanı</div>
              <div className="text-[13px] font-bold text-text-strong mb-1">{declarationFieldName}</div>
              {declarationFieldValue && (
                <div className="text-[12px] text-text bg-surface-2 border border-line rounded-md px-2.5 py-1.5 font-mono leading-snug break-words">
                  {declarationFieldValue}
                </div>
              )}
            </div>

            {/* Document type */}
            <div className="px-4 py-3 border-b border-line">
              <div className="text-[10.5px] font-bold uppercase tracking-[.07em] text-muted-2 mb-1">Doküman</div>
              <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-strong">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: getDocColor(documentType).text }}
                />
                {documentType}
              </div>
            </div>

            {/* Region list */}
            <div className="flex-1 min-h-0 overflow-y-auto py-2">
              <div className="px-4 pb-1.5 text-[10.5px] font-bold uppercase tracking-[.07em] text-muted-2">
                Alanlar ({regions.length})
              </div>
              {regions.map((region) => {
                const isSelected = region.id === localSelected;
                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => setLocalSelected(region.id)}
                    onMouseEnter={() => setHovered(region.id)}
                    onMouseLeave={() => setHovered('')}
                    className={[
                      'w-full text-left px-4 py-2 text-[12.5px] flex items-center gap-2 transition-colors',
                      isSelected
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-text hover:bg-surface-2',
                    ].join(' ')}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: isSelected ? 'var(--accent)' : 'var(--line-strong)',
                      }}
                    />
                    {region.label}
                    {isSelected && <Check size={11} strokeWidth={2.5} className="ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — schematic preview */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6 bg-[#F8F9FA]">
            <div className="max-w-[340px] mx-auto">
              <SchematicDoc
                documentType={documentType}
                regions={regions}
                selectedId={localSelected}
                hoveredId={hovered}
                onHover={setHovered}
                onSelect={setLocalSelected}
              />
            </div>
            {selectedRegion && (
              <div className="mt-3 text-center text-[12px] text-accent font-semibold">
                Seçili: {selectedRegion.label}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line shrink-0">
          <Button onClick={onClose}>Vazgeç</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!localSelected}
          >
            Eşleştirmeyi Kaydet
          </Button>
        </div>
      </div>
    </>
  );
}
