import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { EvraklarRule, EvraklarCondition, EvraklarConditionField } from '../../types';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import Note from '../../components/ui/Note';
import ConditionRow from './ConditionRow';
import DocumentPicker from './DocumentPicker';

// ─── Default blank conditions for new rule ────────────────────────────────────

const DEFAULT_CONDITIONS = (): EvraklarCondition[] => [
  { field: 'mensei',           operator: 'equals',      value: '', enabled: false },
  { field: 'teslim_ulkesi',    operator: 'equals',      value: '', enabled: false },
  { field: 'gonderici_ulkesi', operator: 'equals',      value: '', enabled: false },
  { field: 'gtip_no',          operator: 'starts_with', value: '', enabled: false },
];

function blankRule(): EvraklarRule {
  return {
    id: '',
    name: '',
    conditions: DEFAULT_CONDITIONS(),
    requiredDocuments: [],
    active: true,
    createdAt: new Date().toISOString(),
  };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function validConditionCount(conditions: EvraklarCondition[]): number {
  return conditions.filter((c) => c.enabled && c.value.trim() !== '').length;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type DrawerMode = 'new' | 'edit' | 'delete';

interface RuleDrawerProps {
  mode: DrawerMode;
  rule: EvraklarRule | null;
  countries: string[];
  docTypes: string[];
  onSave: (rule: EvraklarRule) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const FIELD_ORDER: EvraklarConditionField[] = [
  'mensei', 'teslim_ulkesi', 'gonderici_ulkesi', 'gtip_no',
];

export default function RuleDrawer({
  mode, rule, countries, docTypes, onSave, onDelete, onClose,
}: RuleDrawerProps) {
  const open = mode !== null && (mode === 'new' || mode === 'edit' || mode === 'delete');

  const [draft, setDraft] = useState<EvraklarRule>(blankRule);

  // Sync draft when rule/mode changes
  useEffect(() => {
    if (mode === 'new') {
      setDraft(blankRule());
    } else if (rule) {
      // Ensure all 4 condition fields are present in the draft
      const condsByField = Object.fromEntries(rule.conditions.map((c) => [c.field, c]));
      const merged = FIELD_ORDER.map((f) =>
        condsByField[f] ?? DEFAULT_CONDITIONS().find((c) => c.field === f)!
      );
      setDraft({ ...rule, conditions: merged });
    }
  }, [mode, rule]);

  function updateCondition(field: EvraklarConditionField, updated: EvraklarCondition) {
    setDraft((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c) => (c.field === field ? updated : c)),
    }));
  }

  const validCount = validConditionCount(draft.conditions);
  const canSave    = draft.name.trim() !== '' && validCount >= 2 && draft.requiredDocuments.length >= 1;

  const title =
    mode === 'new'    ? 'Yeni Kural'    :
    mode === 'edit'   ? 'Kuralı Düzenle' :
    'Kuralı Sil';

  const subtitle =
    mode === 'new'    ? 'Koşullar ve istenen belgeleri tanımlayın' :
    mode === 'edit'   ? draft.name :
    'Bu işlem geri alınamaz';

  const footer =
    mode === 'delete' ? (
      <>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button
          variant="danger"
          icon={Trash2}
          onClick={() => onDelete(draft.id)}
        >
          Evet, sil
        </Button>
      </>
    ) : (
      <>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={() => onSave({
            ...draft,
            id: draft.id || `er-${Date.now()}`,
          })}
        >
          {mode === 'new' ? 'Kaydet' : 'Güncelle'}
        </Button>
      </>
    );

  return (
    <Drawer open={open} onClose={onClose} title={title} subtitle={subtitle} footer={footer}>
      {mode === 'delete' ? (
        <div className="space-y-4">
          <Note variant="warn">
            <strong>{draft.name}</strong> kuralı kalıcı olarak silinecek. Bu işlem geri alınamaz.
            Devam etmek istediğinizden emin misiniz?
          </Note>
          <div className="bg-surface-2 border border-line rounded-[9px] p-4 space-y-2">
            <div className="text-[12.5px] text-muted">
              <span className="font-semibold text-text-strong">Koşullar: </span>
              {draft.conditions.filter((c) => c.enabled && c.value).map((c) => c.value).join(' · ') || '—'}
            </div>
            <div className="text-[12.5px] text-muted">
              <span className="font-semibold text-text-strong">Belgeler: </span>
              {draft.requiredDocuments.join(', ') || '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Validation note */}
          <Note variant="info">
            Bir kural geçerli sayılabilmesi için <strong>en az 2 koşulun</strong> etkinleştirilmesi ve değer
            girilmesi gerekir. Ayrıca <strong>en az 1 belge</strong> seçili olmalıdır. Kaydet butonu yalnızca
            bu koşullar sağlandığında aktif olur.
          </Note>

          {/* Rule name */}
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wide text-muted mb-1.5">
              Kural Adı
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="Kural adını girin…"
              className="w-full border border-line-strong rounded-[8px] px-3 py-2.5 text-[13px] text-text font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                Koşullar <span className="normal-case tracking-normal ml-1 text-muted-2">(tümü sağlandığında)</span>
              </label>
              <span
                className={[
                  'text-[12px] font-semibold',
                  validCount >= 2 ? 'text-ok' : 'text-warn',
                ].join(' ')}
              >
                {validCount} / {draft.conditions.length} etkin
              </span>
            </div>
            <div className="space-y-2">
              {FIELD_ORDER.map((field) => {
                const cond = draft.conditions.find((c) => c.field === field);
                if (!cond) return null;
                return (
                  <ConditionRow
                    key={field}
                    condition={cond}
                    countries={countries}
                    onChange={(updated) => updateCondition(field, updated)}
                  />
                );
              })}
            </div>
            {validCount < 2 && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warn">
                <AlertTriangle size={13} strokeWidth={1.75} />
                En az 2 koşul etkinleştirip değer girilmelidir.
              </p>
            )}
          </div>

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                İstenen Belgeler
              </label>
              <span
                className={[
                  'text-[12px] font-semibold',
                  draft.requiredDocuments.length >= 1 ? 'text-ok' : 'text-warn',
                ].join(' ')}
              >
                {draft.requiredDocuments.length} seçili
              </span>
            </div>
            <DocumentPicker
              docTypes={docTypes}
              selected={draft.requiredDocuments}
              onChange={(docs) => setDraft((p) => ({ ...p, requiredDocuments: docs }))}
            />
            {draft.requiredDocuments.length === 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warn">
                <AlertTriangle size={13} strokeWidth={1.75} />
                En az 1 belge seçilmelidir.
              </p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
