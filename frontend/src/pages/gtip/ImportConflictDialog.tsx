import type { MaterialImportConflict } from '../../api/materialRecordApi';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { MATERIAL_FIELD_OPTIONS } from './materialRecordView';

interface ImportConflictDialogProps {
  conflicts: MaterialImportConflict[] | null;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onClose: () => void;
}

function fieldLabel(key: string): string {
  return MATERIAL_FIELD_OPTIONS.find((field) => field.key === key)?.label ?? key;
}

export default function ImportConflictDialog({
  conflicts,
  busy,
  onConfirm,
  onDecline,
  onClose,
}: ImportConflictDialogProps) {
  const rows = conflicts ?? [];
  const preview = rows.slice(0, 6);
  return (
    <Modal
      open={conflicts !== null && rows.length > 0}
      onClose={() => { if (!busy) onClose(); }}
      title="İçeride eşleşen kayıtlar var"
      footer={
        <>
          <Button onClick={onDecline} disabled={busy}>Uyarı Excel’ini indir</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'GTİP Onay’a gönder'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] text-text">
        <p>
          {rows.length} satırda malzeme no veya tanım mevcut kayıtla aynı, GTİP ya da diğer alanlar farklı.
          Devam ederseniz bu satırlar GTİP Onay’a gider. Oradan onaylanırsa mevcut kayıt güncellenir.
        </p>
        <div className="border border-line rounded-lg divide-y divide-line">
          {preview.map((row) => (
            <div key={`${row.existingId}-${row.row}`} className="px-3 py-2">
              <div className="font-semibold text-text-strong">Satır {row.row} · {row.materialNo}</div>
              <div className="text-[12px] text-muted mt-0.5">
                Farklı alanlar: {row.differingFields.map(fieldLabel).join(', ')}
              </div>
            </div>
          ))}
        </div>
        {rows.length > preview.length && (
          <p className="text-[12px] text-muted">ve {rows.length - preview.length} satır daha</p>
        )}
      </div>
    </Modal>
  );
}
