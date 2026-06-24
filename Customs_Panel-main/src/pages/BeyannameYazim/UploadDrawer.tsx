import { useState, useEffect } from 'react';
import type { BeyannameListeItem } from '../../types';
import { beyannameListeService } from '../../services/declarations';
import { DOCUMENT_TYPE_OPTIONS } from '../../services/documents';
import Drawer from '../../components/ui/Drawer';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import UploadBox from '../../components/ui/UploadBox';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

interface UploadDrawerProps {
  open: boolean;
  items: BeyannameListeItem[];
  preselectedRef?: string;
  onClose: () => void;
}

export default function UploadDrawer({ open, items, preselectedRef, onClose }: UploadDrawerProps) {
  const { toast } = useToast();

  const [customer, setCustomer] = useState('');
  const [ref,      setRef]      = useState('');
  const [docType,  setDocType]  = useState('');
  const [file,     setFile]     = useState<File | null>(null);
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (open && preselectedRef) {
      const match = items.find((i) => i.ref === preselectedRef);
      setRef(preselectedRef);
      setCustomer(match?.customer ?? '');
    }
    if (!open) {
      setRef('');
      setCustomer('');
      setDocType('');
      setFile(null);
      setNote('');
    }
  }, [open, preselectedRef, items]);

  function handleRefChange(value: string) {
    setRef(value);
    const match = items.find((i) => i.ref === value);
    setCustomer(match?.customer ?? '');
  }

  function handleClose() {
    onClose();
  }

  async function handleSave() {
    if (!ref || !docType) return;
    setSaving(true);
    await beyannameListeService.uploadDocument({ ref, customer, docType, file, note });
    setSaving(false);
    toast(`Dosya yüklendi · ${docType} — ${ref}`);
    handleClose();
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Dosya Yükle"
      subtitle="Beyanname dosyasına yeni bir evrak ekleyin"
    >
      <div className="space-y-5">
        <Field label="Beyanname / Referans" required>
          <Select
            value={ref}
            onChange={(e) => handleRefChange(e.target.value)}
            disabled={!!preselectedRef}
          >
            <option value="">Referans seçin…</option>
            {items.map((item) => (
              <option key={item.id} value={item.ref}>
                {item.ref} — {item.customer}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Müşteri">
          <Input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Müşteri adı…"
          />
        </Field>

        <Field label="Evrak Tipi" required>
          <Select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            <option value="">Evrak tipi seçin…</option>
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
        </Field>

        <Field label="Dosya Yükle">
          <UploadBox
            onFiles={(files) => setFile(files[0] ?? null)}
            hint="PDF, DOCX, XLSX, JPG — maks. 20 MB"
          />
        </Field>

        <Field label="Açıklama">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="İsteğe bağlı not veya açıklama…"
            rows={3}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <Button variant="default" onClick={handleClose}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!ref || !docType || saving}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
