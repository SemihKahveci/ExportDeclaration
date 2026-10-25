import { useEffect, useRef, useState } from 'react';
import { Eye, Send, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react';
import type { BeyannameLineItem, BeyannameRecord, DeclarationFieldMapping } from '../../types';
import { getDeclaration, patchDeclaration } from '../../api/declarationApi';
import { mergeNormalizedFromApi, type GoodsLine } from '../../api/types/document.types';
import { FIELD_GROUPS } from '../../services/declarationFieldRules';
import { isDocumentSourcedField } from '../../services/declarationFieldSourceAuthority';
import { documentFieldMappingService } from '../../services/documents';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Pill from '../../components/ui/Pill';
import DocFieldPickerModal from './DocFieldPickerModal';
import { useToast } from '../../components/ui/Toast';

// ─── Default-expanded groups ──────────────────────────────────────────────────

const DEFAULT_OPEN = new Set(['Genel Beyan Bilgileri', 'Taraf Bilgileri', 'Kalem / Malzeme Bilgileri']);

// ─── Inline editable input ────────────────────────────────────────────────────

function InlineInput({
  value,
  onChange,
  onBlur,
  multiline = false,
  className = '',
  scrollable = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  multiline?: boolean;
  className?: string;
  scrollable?: boolean;
}) {
  const base =
    'w-full border border-line-strong bg-surface rounded-md px-2.5 font-[inherit] text-[12.5px] text-text-strong focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors';
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={2}
        className={`${base} py-1.5 resize-y min-h-[48px] ${className}`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      title={scrollable && value ? value : undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={`${base} h-[30px] ${scrollable ? 'overflow-x-auto' : ''} ${className}`}
    />
  );
}

function editableText(value: string | number | undefined): string {
  const text = value == null ? '' : String(value).trim();
  return text === '—' || text === '–' || text === '-' ? '' : text;
}

function optionalText(value: string | undefined): string | undefined {
  const text = editableText(value);
  return text || undefined;
}

function parseTrNumber(value: string | undefined): number | undefined {
  const text = editableText(value).replace(/\s/g, '');
  if (!text) return undefined;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  let normalized = text;
  if (hasComma && hasDot) {
    normalized = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (hasComma) {
    normalized = text.replace(',', '.');
  } else if (hasDot) {
    const parts = text.split('.');
    const thousands = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    if (thousands) normalized = text.replace(/\./g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function lineNoValue(value: string | number, index: number): number {
  const parsed = Number.parseInt(editableText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1;
}

async function persistLineItems(declarationId: string, items: BeyannameLineItem[]): Promise<void> {
  const current = await getDeclaration(declarationId);
  const norm = mergeNormalizedFromApi(current.normalizedData);
  const currency = items.map((item) => optionalText(item.dovizCinsi)).find(Boolean);
  const goodsLines: GoodsLine[] = items.map((item, index) => {
    const previous = norm.goodsLines[index];
    const description = optionalText(item.ticariTanim) ?? optionalText(item.description);
    const line: GoodsLine = { lineNo: lineNoValue(item.lineNo, index) };
    const hsCode = optionalText(item.gtip);
    const productCode = optionalText(item.malzemeNo);
    const invoiceNo = optionalText(item.faturaNo);
    const unit = optionalText(item.miktarBirimi);
    const origin = optionalText(item.mense);
    const quantity = parseTrNumber(item.quantity);
    const grossKg = parseTrNumber(item.brutKg);
    const netKg = parseTrNumber(item.netKg);
    const lineTotal = parseTrNumber(item.kiymet);
    if (hsCode) line.hsCode = hsCode;
    if (productCode) line.productCode = productCode;
    if (invoiceNo) line.invoiceNo = invoiceNo;
    if (description) line.description = description;
    if (quantity != null) line.quantity = quantity;
    if (unit) line.unit = unit;
    if (previous?.unitPrice != null) line.unitPrice = previous.unitPrice;
    if (lineTotal != null) line.lineTotal = lineTotal;
    if (origin) line.origin = origin;
    if (grossKg != null) line.grossKg = grossKg;
    if (netKg != null) line.netKg = netKg;
    return line;
  });
  await patchDeclaration(declarationId, {
    normalizedData: {
      ...norm,
      header: { ...norm.header, ...(currency ? { currency } : {}) },
      goodsLines,
    },
  });
}

// ─── Document type badge ──────────────────────────────────────────────────────

const DOC_BADGE_COLORS: Record<string, string> = {
  'Fatura':       'bg-blue-50 text-blue-700 border-blue-200',
  'CMR':          'bg-green-50 text-green-700 border-green-200',
  'Çeki Listesi': 'bg-amber-50 text-amber-700 border-amber-200',
  'Konşimento':   'bg-purple-50 text-purple-700 border-purple-200',
  'AWB':          'bg-orange-50 text-orange-700 border-orange-200',
};

function DocTypeBadge({ label, onClick }: { label: string; onClick?: () => void }) {
  const color = DOC_BADGE_COLORS[label] ?? 'bg-surface-2 text-text border-line';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-[2px] rounded-[5px] border whitespace-nowrap transition-opacity hover:opacity-80 ${color}`}
    >
      {label}
    </button>
  );
}

// ─── Multiline fields ─────────────────────────────────────────────────────────

const MULTILINE_FIELDS = new Set([
  'Gönderici / İhracatçı Adresi',
  'Alıcı / İthalatçı Adresi',
  'Mali Müşavir / Temsilci Bilgisi',
  'Açıklama / Not Alanı',
]);

// ─── Column header ────────────────────────────────────────────────────────────

function GroupTableHeader() {
  return (
    <div
      className="grid items-center gap-3 px-4 py-2 bg-surface-2 border-b border-line text-[10.5px] font-bold uppercase tracking-[.07em] text-muted-2"
      style={{ gridTemplateColumns: '160px 1fr 110px 100px' }}
    >
      <span>Beyanname Alanı</span>
      <span>Değer</span>
      <span>Bağlı Doküman</span>
      <span />
    </div>
  );
}

// ─── Single field row ─────────────────────────────────────────────────────────

interface FieldRowProps {
  fieldName: string;
  value: string;
  mapping?: DeclarationFieldMapping;
  conflict: boolean;
  multiline?: boolean;
  onChange: (v: string) => void;
  onShowInDoc: () => void;
}

function FieldRow({ fieldName, value, mapping, conflict, multiline = false, onChange, onShowInDoc }: FieldRowProps) {
  return (
    <div
      className={[
        'grid items-start gap-3 px-4 py-3 border-b border-line last:border-b-0 transition-colors',
        conflict ? 'bg-warn-tint/40' : 'hover:bg-surface-2/40',
      ].join(' ')}
      style={{ gridTemplateColumns: '160px 1fr 110px 100px' }}
    >
      {/* Field name */}
      <div className="pt-[5px]">
        <span className="text-[12.5px] font-semibold text-text-strong leading-tight">{fieldName}</span>
      </div>

      {/* Value */}
      <InlineInput value={value} onChange={onChange} multiline={multiline} />

      {/* Bağlı Doküman */}
      <div className="pt-[5px]">
        {mapping
          ? <DocTypeBadge label={mapping.linkedDocumentType} onClick={onShowInDoc} />
          : <span className="text-muted-2 text-[11.5px]">—</span>
        }
      </div>

      {/* Action */}
      <div className="pt-[4px] flex justify-end">
        <button
          type="button"
          onClick={onShowInDoc}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:text-accent-d transition-colors"
          title="Dokümanda Göster"
        >
          <ExternalLink size={11} strokeWidth={2} />
          Dokümanda Göster
        </button>
      </div>
    </div>
  );
}

// ─── Collapsible group section ────────────────────────────────────────────────

interface GroupSectionProps {
  groupLabel: string;
  fields: string[];
  fieldValues: Record<string, string>;
  mappings: DeclarationFieldMapping[];
  conflictFields: Set<string>;
  defaultOpen?: boolean;
  onValueChange: (fieldName: string, value: string) => void;
  onShowInDoc: (fieldName: string, value: string, mapping?: DeclarationFieldMapping) => void;
  lineItems?: BeyannameLineItem[];
  onLineChange?: (index: number, patch: Partial<BeyannameLineItem>) => void;
  onLineBlur?: () => void;
}

function GroupSection({
  groupLabel,
  fields,
  fieldValues,
  mappings,
  conflictFields,
  defaultOpen = false,
  onValueChange,
  onShowInDoc,
  lineItems,
  onLineChange,
  onLineBlur,
}: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const hasLineValue = (value: unknown) => value != null && value !== '' && value !== '—';
  const goodsFieldPresence: Record<string, boolean> = {
    'Kalem No': Boolean(lineItems?.some((item) => hasLineValue(item.lineNo))),
    'Malzeme No': Boolean(lineItems?.some((item) => hasLineValue(item.malzemeNo))),
    'Fatura No': Boolean(lineItems?.some((item) => hasLineValue(item.faturaNo))),
    'GTİP No': Boolean(lineItems?.some((item) => hasLineValue(item.gtip))),
    'Ticari Tanım': Boolean(lineItems?.some((item) => hasLineValue(item.ticariTanim))),
    'Eşyanın Cinsi': Boolean(lineItems?.some((item) => hasLineValue(item.description))),
    'Mal Tanımı': Boolean(lineItems?.some((item) => hasLineValue(item.description))),
    'Miktar': Boolean(lineItems?.some((item) => hasLineValue(item.quantity))),
    'Miktar Birimi': Boolean(lineItems?.some((item) => hasLineValue(item.miktarBirimi))),
    'Kalem Menşe': Boolean(lineItems?.some((item) => hasLineValue(item.mense))),
    'Kalem Brüt KG': Boolean(lineItems?.some((item) => hasLineValue(item.brutKg))),
    'Kalem Net KG': Boolean(lineItems?.some((item) => hasLineValue(item.netKg))),
    'Kalem Kıymet': Boolean(lineItems?.some((item) => hasLineValue(item.kiymet))),
    'Kalem Döviz Cinsi': Boolean(lineItems?.some((item) => hasLineValue(item.dovizCinsi))),
  };
  const filledCount = groupLabel === 'Kalem / Malzeme Bilgileri'
    ? fields.filter((field) => goodsFieldPresence[field]).length
    : fields.filter((f) => fieldValues[f]).length;
  const mappedCount   = mappings.filter((m) => fields.includes(m.declarationFieldName)).length;
  const conflictCount = fields.filter((f) => conflictFields.has(f)).length;
  const documentFields = fields.filter(isDocumentSourcedField);
  const documentFilledCount = groupLabel === 'Kalem / Malzeme Bilgileri'
    ? documentFields.filter((field) => goodsFieldPresence[field]).length
    : documentFields.filter((field) => Boolean(fieldValues[field])).length;

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-2 hover:bg-surface transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open
            ? <ChevronDown  size={14} strokeWidth={2} className="text-muted shrink-0" />
            : <ChevronRight size={14} strokeWidth={2} className="text-muted shrink-0" />
          }
          <span className="text-[13px] font-bold text-text-strong">{groupLabel}</span>
          {conflictCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-warn px-2 py-0.5 rounded-full bg-warn-tint border border-warn/20">
              <AlertTriangle size={10} strokeWidth={2.5} />
              {conflictCount} uyuşmazlık
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-muted shrink-0">
          {mappedCount > 0 && (
            <span className="font-semibold text-accent">{mappedCount} eşleşti</span>
          )}
          {documentFields.length > 0 && (
            <span title="Dokümandan gelmesi beklenen alanların mevcut doluluk görünümü; kaynak dokümanda bulunmayan alanlar hata sayılmaz.">
              {documentFilledCount}/{documentFields.length} doküman alanı
            </span>
          )}
          <span>{filledCount}/{fields.length} toplam</span>
        </div>
      </button>

      {open && (
        groupLabel === 'Kalem / Malzeme Bilgileri' ? (
          /* Kalem group: only the line-item table, no field rows */
          lineItems && lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" style={{ minWidth: '940px' }}>
                <thead>
                  <tr className="bg-surface-2 border-b border-line">
                    {[
                      'Kalem No', 'Fatura No', 'Malzeme No', 'GTİP No', 'Ticari Tanım',
                      'Eşyanın Cinsi', 'Miktar', 'Miktar Birimi', 'Menşe',
                      'Brüt KG', 'Net KG', 'Kıymet', 'Döviz Cinsi',
                    ].map((col) => (
                      <th
                        key={col}
                        className={`px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-2 whitespace-nowrap border-r border-line last:border-r-0 ${col === 'GTİP No' ? 'min-w-[196px]' : ''}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => {
                    const edit = (patch: Partial<BeyannameLineItem>) => onLineChange?.(index, patch);
                    const cell = (
                      value: string | number | undefined,
                      patch: (text: string) => Partial<BeyannameLineItem>,
                      kind: 'gtip' | 'wide' | 'text' = 'text',
                    ) => {
                      const text = editableText(value);
                      const continues = kind !== 'gtip' && text.length > 16;
                      return (
                        <td className={`px-2 py-1.5 border-r border-line last:border-r-0 align-top ${
                          kind === 'gtip' ? 'min-w-[196px] w-[196px]' : kind === 'wide' ? 'min-w-[140px] max-w-[180px]' : 'min-w-[96px] max-w-[132px]'
                        }`}>
                          <div className="relative group">
                            <InlineInput
                              value={text}
                              onChange={(next) => edit(patch(next))}
                              onBlur={onLineBlur}
                              scrollable={kind !== 'gtip'}
                              className={kind === 'gtip' ? 'font-mono tracking-tight' : 'font-mono'}
                            />
                            {continues && (
                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-2 bg-surface pl-1">
                                …
                              </span>
                            )}
                            {continues && (
                              <div className="pointer-events-none absolute left-0 top-[calc(100%+4px)] z-30 hidden group-hover:block w-max max-w-[320px] rounded-md bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-surface shadow-lg whitespace-pre-wrap">
                                {text}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    };
                    return (
                      <tr key={`${item.lineNo}-${index}`} className="border-b border-line last:border-b-0">
                        {cell(item.lineNo, (text) => ({ lineNo: lineNoValue(text, index) }))}
                        {cell(item.faturaNo, (text) => ({ faturaNo: text }))}
                        {cell(item.malzemeNo, (text) => ({ malzemeNo: text }))}
                        {cell(item.gtip, (text) => ({ gtip: text }), 'gtip')}
                        {cell(item.ticariTanim, (text) => ({ ticariTanim: text, description: text }), 'wide')}
                        {cell(item.description, (text) => ({ description: text, ticariTanim: text }), 'wide')}
                        {cell(item.quantity, (text) => ({ quantity: text }))}
                        {cell(item.miktarBirimi, (text) => ({ miktarBirimi: text }))}
                        {cell(item.mense, (text) => ({ mense: text }))}
                        {cell(item.brutKg, (text) => ({ brutKg: text }))}
                        {cell(item.netKg, (text) => ({ netKg: text }))}
                        {cell(item.kiymet, (text) => ({ kiymet: text }))}
                        {cell(item.dovizCinsi, (text) => ({ dovizCinsi: text }))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-[12.5px] text-muted text-center">Kalem bilgisi yok</div>
          )
        ) : (
          /* All other groups: field rows with document mapping columns */
          <>
            <GroupTableHeader />
            {fields.map((fieldName) => {
              const mapping  = mappings.find((m) => m.declarationFieldName === fieldName);
              const value    = fieldValues[fieldName] ?? '';
              const conflict = conflictFields.has(fieldName);
              return (
                <FieldRow
                  key={fieldName}
                  fieldName={fieldName}
                  value={value}
                  mapping={mapping}
                  conflict={conflict}
                  multiline={MULTILINE_FIELDS.has(fieldName)}
                  onChange={(v) => onValueChange(fieldName, v)}
                  onShowInDoc={() => onShowInDoc(fieldName, value, mapping)}
                />
              );
            })}
          </>
        )
      )}
    </div>
  );
}

// ─── Default document type to open when no mapping exists ─────────────────────

const FIELD_DEFAULT_DOC: Record<string, string> = {
  'Fatura No':                    'Fatura',
  'Fatura Tarihi':                'Fatura',
  'Döviz Cinsi':                  'Fatura',
  'Toplam Fatura Bedeli':         'Fatura',
  'Navlun':                       'Fatura',
  'Sigorta':                      'Fatura',
  'Ödeme Şekli':                  'Fatura',
  'Teslim Şekli':                 'Fatura',
  'Gönderici / İhracatçı Ünvanı': 'Fatura',
  'Gönderici / İhracatçı Adresi': 'Fatura',
  'Alıcı / İthalatçı Ünvanı':    'Fatura',
  'Alıcı / İthalatçı Adresi':    'Fatura',
  'CMR No':                       'CMR',
  'Plaka':                        'CMR',
  'Kap Adedi':                    'Çeki Listesi',
  'Kap Cinsi':                    'Çeki Listesi',
  'Brüt Kilo':                    'Çeki Listesi',
  'Net Kilo':                     'Çeki Listesi',
  'Konşimento No':                'Konşimento',
  'Konteyner No':                 'Konşimento',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface WritingTabProps {
  record: BeyannameRecord;
  hasViewedPreview: boolean;
  locked?: boolean;
  onViewDeclaration: () => void;
  onSendToControl: () => void;
  onRewrite: () => void;
}

// ─── Modal state ──────────────────────────────────────────────────────────────

interface PickerState {
  open: boolean;
  fieldName: string;
  fieldValue: string;
  documentType: string;
  currentRegionId: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WritingTab({
  record,
  hasViewedPreview,
  locked = false,
  onViewDeclaration,
  onSendToControl,
  onRewrite,
}: WritingTabProps) {
  const { toast } = useToast();

  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(
    () => new Set(record.docs.filter((d) => d.status === 'geldi').map((d) => d.id))
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () => ({ ...record.fieldValues })
  );
  const [lineItems, setLineItems] = useState<BeyannameLineItem[]>(() => record.lineItems);
  const lineItemsRef = useRef(lineItems);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [mappings, setMappings] = useState<DeclarationFieldMapping[]>([]);
  const [picker, setPicker] = useState<PickerState>({
    open: false, fieldName: '', fieldValue: '', documentType: 'Fatura', currentRegionId: '',
  });

  // Load per-record mappings from the service
  useState(() => {
    documentFieldMappingService.getMappings(record.id).then(setMappings);
  });

  function toggleDoc(id: string) {
    setCheckedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    setLineItems(record.lineItems);
    lineItemsRef.current = record.lineItems;
  }, [record.id]);

  function handleValueChange(fieldName: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
  }

  function handleLineChange(index: number, patch: Partial<BeyannameLineItem>) {
    const next = lineItemsRef.current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    lineItemsRef.current = next;
    setLineItems(next);
  }

  function queueLineSave(): Promise<void> {
    const items = lineItemsRef.current;
    const run = saveQueue.current
      .catch(() => undefined)
      .then(() => persistLineItems(record.id, items));
    saveQueue.current = run;
    return run;
  }

  async function handleSendClick() {
    try {
      await queueLineSave();
      onSendToControl();
    } catch {
      toast('Kalem alanları kaydedilemedi. Kontrole gönderilmedi.');
    }
  }

  function handleShowInDoc(fieldName: string, fieldValue: string, mapping?: DeclarationFieldMapping) {
    const docType  = mapping?.linkedDocumentType ?? FIELD_DEFAULT_DOC[fieldName] ?? 'Fatura';
    const regionId = mapping?.documentFieldRegionId ?? '';
    setPicker({ open: true, fieldName, fieldValue, documentType: docType, currentRegionId: regionId });
  }

  function handlePickerSave(regionId: string, regionLabel: string) {
    setMappings((prev) => {
      const existing = prev.find((m) => m.declarationFieldName === picker.fieldName);
      if (existing) {
        return prev.map((m) =>
          m.declarationFieldName === picker.fieldName
            ? { ...m, documentFieldRegionId: regionId, documentFieldLabel: regionLabel, status: 'uyumlu' }
            : m
        );
      }
      return [
        ...prev,
        {
          declarationFieldName:  picker.fieldName,
          linkedDocumentType:    picker.documentType,
          documentFieldRegionId: regionId,
          documentFieldLabel:    regionLabel,
          status:                'uyumlu',
        },
      ];
    });
    setPicker((p) => ({ ...p, open: false }));
    toast('Doküman alanı eşleştirildi');
  }

  // Conflict set from record
  const conflictFields = new Set(
    record.fields
      .filter((f) => f.conflict)
      .flatMap((f) => {
        const keyMap: Record<string, string[]> = {
          kap:  ['Kap Adedi'],
          kilo: ['Brüt Kilo'],
        };
        return keyMap[f.key] ?? [f.label];
      })
  );

  const totalConflicts = conflictFields.size;
  const filledCount    = Object.values(fieldValues).filter(Boolean).length;
  const mappedCount    = mappings.length;

  return (
    <div className="flex gap-4">
      {/* Left panel */}
      <div className="w-[280px] shrink-0 flex flex-col gap-3">
        <Card>
          <CardHead title="İlgili Kayıt" sub="Evrak hazırlıktan gelen dosya" />
          <CardBody>
            <div className="flex flex-col divide-y divide-line">
              {[
                { label: 'Referans',  value: record.ref,      mono: true  },
                { label: 'Tescil No', value: record.tescilNo, mono: true  },
                { label: 'Müşteri',   value: record.customer, mono: false },
                { label: 'Rejim',     value: record.rejim,    mono: false },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                  <span className="text-muted font-semibold">{label}</span>
                  <span className={`text-text-strong text-right ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                <span className="text-muted font-semibold">Durum</span>
                <Pill variant="warn">{record.durumLabel}</Pill>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="flex-1">
          <CardHead title="Kontrole Dahil Evraklar" />
          <CardBody>
            <div className="flex flex-col gap-2">
              {record.docs.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-start gap-2.5 bg-surface-2 border border-line-strong rounded-lg px-3 py-2.5 cursor-pointer hover:border-muted-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkedDocs.has(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                    className="mt-0.5 w-3.5 h-3.5 shrink-0 cursor-pointer"
                    style={{ accentColor: 'var(--accent-d)' }}
                  />
                  <span className="min-w-0">
                    <span className="text-[12.5px] font-semibold text-text-strong block">{doc.name}</span>
                    {doc.note && (
                      <span className="text-[11px] text-muted mt-0.5 block">{doc.note}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                icon={RefreshCw}
                onClick={() => void onRewrite()}
                disabled={locked}
                title="Bu faturayı yeniden parse eder. İşlem bitene kadar yazım kapalı kalır."
              >
                Tekrar Yaz
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <Card>
          <CardHead
            title="Beyanname Yazım Alanları"
            sub={`${filledCount} alan dolu · ${mappedCount} doküman eşleşmesi${totalConflicts > 0 ? ` · ${totalConflicts} uyuşmazlık` : ''}`}
            actions={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="default" icon={Eye} onClick={onViewDeclaration}>
                  Görünüm
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={Send}
                  onClick={() => void handleSendClick()}
                  disabled={!hasViewedPreview}
                  title={!hasViewedPreview ? 'Önce beyanname görünümünü açmanız gerekiyor' : undefined}
                >
                  Kontrole Gönder
                </Button>
              </div>
            }
          />

          <CardBody>
            {totalConflicts > 0 && (
              <div
                className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 mb-4 text-[12.5px]"
                style={{ background: 'var(--warn-tint)', border: '1px solid #e8d0a2', color: '#7a5a16' }}
              >
                <AlertTriangle size={14} className="shrink-0 mt-0.5" strokeWidth={2} />
                <span>
                  <strong>{totalConflicts} alanda uyuşmazlık</strong> tespit edildi.
                  Turuncu işaretli alanlarda farklı kaynaklar çakışıyor.
                </span>
              </div>
            )}

            <div className="space-y-2">
              {FIELD_GROUPS.map((group) => (
                <GroupSection
                  key={group.label}
                  groupLabel={group.label}
                  fields={group.fields}
                  fieldValues={fieldValues}
                  mappings={mappings}
                  conflictFields={conflictFields}
                  defaultOpen={DEFAULT_OPEN.has(group.label)}
                  onValueChange={handleValueChange}
                  onShowInDoc={handleShowInDoc}
                  lineItems={group.label === 'Kalem / Malzeme Bilgileri' ? lineItems : undefined}
                  onLineChange={handleLineChange}
                  onLineBlur={() => { void queueLineSave().catch(() => { toast('Kalem alanları kaydedilemedi.'); }); }}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Document field picker modal */}
      <DocFieldPickerModal
        open={picker.open}
        declarationFieldName={picker.fieldName}
        declarationFieldValue={picker.fieldValue}
        documentType={picker.documentType}
        selectedRegionId={picker.currentRegionId}
        onClose={() => setPicker((p) => ({ ...p, open: false }))}
        onSave={handlePickerSave}
      />
    </div>
  );
}
