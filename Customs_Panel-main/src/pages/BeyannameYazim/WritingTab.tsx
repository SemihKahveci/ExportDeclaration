import { useState } from 'react';
import { Eye, Send, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react';
import type { BeyannameRecord, DeclarationFieldMapping } from '../../types';
import { FIELD_GROUPS } from '../../services/declarationFieldRules';
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
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const base =
    'w-full border border-line-strong bg-surface rounded-md px-2.5 font-[inherit] text-[12.5px] text-text-strong focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors';
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={`${base} py-1.5 resize-y min-h-[48px]`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} h-[30px]`}
    />
  );
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
  lineItems?: BeyannameRecord['lineItems'];
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
}: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const filledCount   = fields.filter((f) => fieldValues[f]).length;
  const mappedCount   = mappings.filter((m) => fields.includes(m.declarationFieldName)).length;
  const conflictCount = fields.filter((f) => conflictFields.has(f)).length;

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
          <span>{filledCount}/{fields.length} alan dolu</span>
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
                      'Kalem No', 'Malzeme No', 'GTİP No', 'Ticari Tanım',
                      'Eşyanın Cinsi', 'Miktar', 'Miktar Birimi', 'Menşe',
                      'Brüt KG', 'Net KG', 'Kıymet', 'Döviz Cinsi',
                    ].map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-2 whitespace-nowrap border-r border-line last:border-r-0"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr
                      key={item.lineNo}
                      className="border-b border-line hover:bg-surface-2/50 transition-colors last:border-b-0"
                    >
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12px] text-muted font-mono">{item.lineNo}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12px] font-mono text-muted">{item.malzemeNo ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12px] font-mono text-accent">{item.gtip}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line max-w-[150px]">
                        <span className="text-[12px] text-muted block truncate" title={item.ticariTanim}>{item.ticariTanim ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line max-w-[150px]">
                        <span className="text-[12.5px] font-semibold text-text-strong block truncate" title={item.description}>{item.description}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12.5px] text-text font-mono">{item.quantity}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12.5px] text-text">{item.miktarBirimi ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12.5px] text-text font-mono">{item.mense}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12.5px] text-text font-mono">{item.brutKg}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12.5px] text-text font-mono">{item.netKg}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-line">
                        <span className="text-[12.5px] text-text font-mono">{item.kiymet}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[12px] text-muted font-mono">{item.dovizCinsi ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
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
  onViewDeclaration: () => void;
  onSendToControl: () => void;
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
  onViewDeclaration,
  onSendToControl,
}: WritingTabProps) {
  const { toast } = useToast();

  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(
    () => new Set(record.docs.filter((d) => d.status === 'geldi').map((d) => d.id))
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () => ({ ...record.fieldValues })
  );
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

  function handleValueChange(fieldName: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
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
              <Button size="sm" variant="blue" icon={RefreshCw}>
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
                  onClick={onSendToControl}
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
                  lineItems={
                    group.label === 'Kalem / Malzeme Bilgileri'
                      ? record.lineItems
                      : undefined
                  }
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
