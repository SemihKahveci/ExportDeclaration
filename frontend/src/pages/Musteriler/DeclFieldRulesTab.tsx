import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { DeclarationFieldRule } from '../../types';
import { FIELD_GROUPS } from '../../services/declarationFieldRules';
import { Card, CardHead } from '../../components/ui/Card';

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'Aktif' | 'Pasif' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${status === 'Aktif' ? 'text-ok' : 'text-muted'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {status}
    </span>
  );
}

function SourceBadge({ label }: { label: string }) {
  if (!label) return <span className="text-muted-2 text-[12px]">—</span>;
  return (
    <span className="inline-flex text-[12px] font-semibold px-2.5 py-[3px] rounded-[5px] bg-surface-2 border border-line text-text whitespace-nowrap">
      {label}
    </span>
  );
}

// ─── Column header row ────────────────────────────────────────────────────────

function FieldTableHeader() {
  return (
    <div className="grid items-center gap-3 px-5 py-2 bg-surface-2 border-b border-line text-[11px] font-bold uppercase tracking-[.06em] text-muted-2"
      style={{ gridTemplateColumns: '1fr 140px 140px 180px 72px 56px' }}>
      <span>Beyanname Alanı</span>
      <span>Ana Kaynak</span>
      <span>Yedek Kaynak</span>
      <span>Uyuşmazlık Aksiyonu</span>
      <span>Durum</span>
      <span />
    </div>
  );
}

// ─── Single field row ─────────────────────────────────────────────────────────

interface FieldRowProps {
  fieldName: string;
  rule?: DeclarationFieldRule;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function FieldRow({ fieldName, rule, onAdd, onEdit, onDelete }: FieldRowProps) {
  const hasRule = !!rule;

  return (
    <div
      className="grid items-center gap-3 px-5 py-3 border-b border-line last:border-b-0 hover:bg-surface-2/50 transition-colors group"
      style={{ gridTemplateColumns: '1fr 140px 140px 180px 72px 56px' }}
    >
      {/* Field name */}
      <span className={`text-[13px] ${hasRule ? 'font-semibold text-text-strong' : 'text-text'}`}>
        {fieldName}
      </span>

      {/* Ana Kaynak */}
      <div>
        {hasRule ? <SourceBadge label={rule.primarySource} /> : <span className="text-[12px] text-muted-2">—</span>}
      </div>

      {/* Yedek Kaynak */}
      <div>
        {hasRule ? <SourceBadge label={rule.fallbackSource} /> : <span className="text-[12px] text-muted-2">—</span>}
      </div>

      {/* Uyuşmazlık */}
      <div>
        {hasRule
          ? <span className="text-[12.5px] text-text">{rule.conflictAction}</span>
          : <span className="text-[12px] text-muted-2">—</span>}
      </div>

      {/* Durum */}
      <div>
        {hasRule ? <StatusBadge status={rule.status} /> : <span className="text-[12px] text-muted-2">—</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5">
        {hasRule ? (
          <>
            <button
              onClick={() => onEdit(rule.id)}
              className="text-muted-2 hover:text-accent transition-colors p-0.5"
              title="Düzenle"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
            <button
              onClick={() => onDelete(rule.id)}
              className="text-muted-2 hover:text-hat-red transition-colors p-0.5"
              title="Sil"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </>
        ) : (
          <button
            onClick={onAdd}
            className="text-muted-2 hover:text-accent transition-colors p-0.5 opacity-0 group-hover:opacity-100"
            title="Kural Ekle"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Collapsible group section ────────────────────────────────────────────────

interface GroupSectionProps {
  groupLabel: string;
  fields: string[];
  rules: DeclarationFieldRule[];
  defaultOpen?: boolean;
  onNew: (groupLabel: string, fieldName: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function GroupSection({ groupLabel, fields, rules, defaultOpen = false, onNew, onEdit, onDelete }: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const configuredCount = rules.length;

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface-2 hover:bg-surface transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open
            ? <ChevronDown size={15} strokeWidth={2} className="text-muted shrink-0" />
            : <ChevronRight size={15} strokeWidth={2} className="text-muted shrink-0" />
          }
          <span className="text-[13.5px] font-bold text-text-strong">{groupLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted">{fields.length} alan</span>
          {configuredCount > 0 && (
            <span className="font-semibold px-2 py-0.5 rounded-full bg-accent-tint text-accent border border-accent/20">
              {configuredCount} kural
            </span>
          )}
        </div>
      </button>

      {/* Field rows */}
      {open && (
        <div>
          <FieldTableHeader />
          {fields.map((fieldName) => {
            const rule = rules.find((r) => r.fieldName === fieldName);
            return (
              <FieldRow
                key={fieldName}
                fieldName={fieldName}
                rule={rule}
                onAdd={() => onNew(groupLabel, fieldName)}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DeclFieldRulesTabProps {
  rules: DeclarationFieldRule[];
  onNew: (groupLabel?: string, fieldName?: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

// ─── Default-expanded groups ──────────────────────────────────────────────────

const DEFAULT_OPEN = new Set(['Genel Beyan Bilgileri', 'Kalem / Malzeme Bilgileri']);

export default function DeclFieldRulesTab({ rules, onNew, onEdit, onDelete }: DeclFieldRulesTabProps) {
  const totalFields     = FIELD_GROUPS.reduce((sum, g) => sum + g.fields.length, 0);
  const configuredCount = rules.length;
  const activeCount     = rules.filter((r) => r.status === 'Aktif').length;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { value: FIELD_GROUPS.length, label: 'Alan Grubu'      },
          { value: totalFields,          label: 'Toplam Alan'     },
          { value: configuredCount,      label: 'Tanımlı Kural'   },
          { value: activeCount,          label: 'Aktif Kural'     },
        ].map(({ value, label }) => (
          <div key={label} className="bg-surface border border-line rounded-[9px] px-[14px] py-3">
            <div className="text-[26px] font-bold text-text-strong leading-none">{value}</div>
            <div className="text-[12px] text-muted font-semibold mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Group cards */}
      <Card>
        <CardHead
          title="Beyanname Alan Kuralları"
          sub="Müşteriye özgü kaynak doküman önceliği. Her alan için hangi belgeden okunacağı burada tanımlanır."
          actions={
            <button
              type="button"
              onClick={() => onNew()}
              className="inline-flex items-center gap-2 bg-accent text-white font-semibold text-[13px] px-4 h-9 rounded border border-transparent hover:bg-accent-d transition-colors shrink-0"
            >
              <Plus size={15} strokeWidth={2.5} />
              Yeni Alan Kuralı
            </button>
          }
        />

        <div className="px-5 py-4 space-y-2">
          {FIELD_GROUPS.map((group) => {
            const groupRules = rules.filter((r) => r.fieldGroup === group.label);
            return (
              <GroupSection
                key={group.label}
                groupLabel={group.label}
                fields={group.fields}
                rules={groupRules}
                defaultOpen={DEFAULT_OPEN.has(group.label)}
                onNew={onNew}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })}
        </div>

        <div className="px-5 py-3 text-[12px] text-muted-2 leading-relaxed border-t border-line">
          Kaynak doküman öncelikleri müşteri bazında saklanır. Otomasyon davranışı (otomatik / kontrollü / manuel) Ayarlar ekranından yönetilir.
        </div>
      </Card>
    </div>
  );
}
