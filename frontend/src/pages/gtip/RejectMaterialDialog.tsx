import { useEffect, useState } from 'react';
import type { MaterialFieldKey } from '../../types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { MATERIAL_FIELD_OPTIONS } from './materialRecordView';

interface RejectMaterialDialogProps {
  open: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (fields: MaterialFieldKey[], note: string) => void;
}

export default function RejectMaterialDialog({ open, count, busy, onClose, onConfirm }: RejectMaterialDialogProps) {
  const [fields, setFields] = useState<MaterialFieldKey[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setFields([]);
    setNote('');
  }, [open]);

  function toggle(key: MaterialFieldKey) {
    setFields((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={count > 1 ? `${count} kaydı reddet` : 'Kaydı reddet'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button variant="primary" disabled={busy || fields.length === 0} onClick={() => onConfirm(fields, note.trim())}>
            {busy ? 'Reddediliyor…' : 'Reddet'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-text">Hatalı olan alanları seçin. En az bir alan zorunlu. Not isteğe bağlı.</p>
        <div className="flex flex-col gap-2">
          {MATERIAL_FIELD_OPTIONS.map((field) => (
            <label key={field.key} className="flex items-center gap-2 text-text-strong">
              <input
                type="checkbox"
                checked={fields.includes(field.key)}
                onChange={() => toggle(field.key)}
                className="w-3.5 h-3.5"
                style={{ accentColor: 'var(--accent-d)' }}
              />
              {field.label}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold text-text-strong">Not</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="rounded border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            placeholder="İsteğe bağlı açıklama"
          />
        </label>
      </div>
    </Modal>
  );
}
