import { useState, useEffect } from 'react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Select, Textarea } from '../../components/ui/Fields';
import type { DeclarationFieldRule, DeclFieldConflictAction } from '../../types';
import {
  FIELD_GROUPS,
  SOURCE_DOCUMENT_OPTIONS,
  CONFLICT_ACTION_OPTIONS,
} from '../../services/declarationFieldRules';

interface DeclFieldRuleDrawerProps {
  open: boolean;
  initial?: DeclarationFieldRule;
  /** Pre-select group when adding from a specific field row */
  initialGroup?: string;
  /** Pre-select field when adding from a specific field row */
  initialField?: string;
  customerName: string;
  onClose: () => void;
  onSave: (data: Omit<DeclarationFieldRule, 'id' | 'customerId'>) => void;
}

const FALLBACK_OPTIONS = ['—', ...SOURCE_DOCUMENT_OPTIONS];

const firstGroup = FIELD_GROUPS[0];

export default function DeclFieldRuleDrawer({
  open,
  initial,
  initialGroup,
  initialField,
  customerName,
  onClose,
  onSave,
}: DeclFieldRuleDrawerProps) {
  const [group,          setGroup]         = useState(firstGroup.label);
  const [fieldName,      setFieldName]     = useState(firstGroup.fields[0]);
  const [primarySource,  setPrimarySource] = useState(SOURCE_DOCUMENT_OPTIONS[0]);
  const [fallbackSource, setFallback]      = useState('—');
  const [conflictAction, setConflict]      = useState<DeclFieldConflictAction>('Ana kaynak öncelikli');
  const [status,         setStatus]        = useState<'Aktif' | 'Pasif'>('Aktif');
  const [description,    setDescription]   = useState('');

  const fieldsForGroup = FIELD_GROUPS.find((g) => g.label === group)?.fields ?? [];

  useEffect(() => {
    if (!open) return;

    if (initial) {
      setGroup(initial.fieldGroup);
      setFieldName(initial.fieldName);
      setPrimarySource(initial.primarySource);
      setFallback(initial.fallbackSource || '—');
      setConflict(initial.conflictAction);
      setStatus(initial.status);
      setDescription(initial.description);
    } else {
      const resolvedGroup = initialGroup ?? firstGroup.label;
      const resolvedFields = FIELD_GROUPS.find((g) => g.label === resolvedGroup)?.fields ?? [];
      const resolvedField  = initialField ?? resolvedFields[0] ?? '';
      setGroup(resolvedGroup);
      setFieldName(resolvedField);
      setPrimarySource(SOURCE_DOCUMENT_OPTIONS[0]);
      setFallback('—');
      setConflict('Ana kaynak öncelikli');
      setStatus('Aktif');
      setDescription('');
    }
  }, [open, initial, initialGroup, initialField]);

  function handleGroupChange(newGroup: string) {
    setGroup(newGroup);
    const fields = FIELD_GROUPS.find((g) => g.label === newGroup)?.fields ?? [];
    setFieldName(fields[0] ?? '');
  }

  function handleSave() {
    onSave({
      fieldGroup:     group,
      fieldName,
      primarySource,
      fallbackSource: fallbackSource === '—' ? '' : fallbackSource,
      conflictAction,
      status,
      description,
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? 'Alan Kuralı Düzenle' : 'Yeni Alan Kuralı'}
      subtitle={customerName}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={handleSave}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Alan Grubu" htmlFor="dfr-group">
          <Select
            id="dfr-group"
            value={group}
            onChange={(e) => handleGroupChange(e.target.value)}
          >
            {FIELD_GROUPS.map((g) => (
              <option key={g.label}>{g.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Beyanname Alanı" htmlFor="dfr-field">
          <Select
            id="dfr-field"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
          >
            {fieldsForGroup.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ana Kaynak Doküman" htmlFor="dfr-primary">
            <Select
              id="dfr-primary"
              value={primarySource}
              onChange={(e) => setPrimarySource(e.target.value)}
            >
              {SOURCE_DOCUMENT_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>

          <Field label="Yedek Kaynak Doküman" htmlFor="dfr-fallback">
            <Select
              id="dfr-fallback"
              value={fallbackSource}
              onChange={(e) => setFallback(e.target.value)}
            >
              {FALLBACK_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Uyuşmazlık Aksiyonu" htmlFor="dfr-conflict">
          <Select
            id="dfr-conflict"
            value={conflictAction}
            onChange={(e) => setConflict(e.target.value as DeclFieldConflictAction)}
          >
            {CONFLICT_ACTION_OPTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>

        <Field label="Durum" htmlFor="dfr-status">
          <Select
            id="dfr-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'Aktif' | 'Pasif')}
          >
            <option>Aktif</option>
            <option>Pasif</option>
          </Select>
        </Field>

        <Field label="Açıklama" htmlFor="dfr-desc">
          <Textarea
            id="dfr-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Opsiyonel not veya kural gerekçesi…"
          />
        </Field>
      </div>
    </Drawer>
  );
}
