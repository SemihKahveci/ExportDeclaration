import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import Note from '../../components/ui/Note';
import UploadBox from '../../components/ui/UploadBox';
import { customersService } from '../../services/customers';
import { usersService } from '../../services/users';
import type { CustomerListItem, AppUser } from '../../types';

export interface NewRequestPayload {
  customerId: string;
  customerName: string;
  customerCity: string;
  operationType: string;
  transportMode: string;
  assigneeName: string | null;
}

interface NewRequestDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: NewRequestPayload) => void | Promise<void>;
}

function parseCityFromMeta(meta?: string): string {
  if (!meta) return '—';
  return meta.split(' · ')[0]?.trim() || '—';
}

export default function NewRequestDrawer({ open, onClose, onSave }: NewRequestDrawerProps) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [allMtUsers, setAllMtUsers] = useState<AppUser[]>([]);
  const [allMtMgrUsers, setAllMtMgrUsers] = useState<AppUser[]>([]);
  const [selectedCustId, setSelectedCustId] = useState('');
  const [operationType, setOperationType] = useState('İhracat');
  const [transportMode, setTransportMode] = useState('Karayolu');
  const [assigneeName, setAssigneeName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      customersService.getCustomerList(),
      usersService.getMtUsers(),
      usersService.getMtManagerUsers(),
    ]).then(([list, mt, mtMgr]) => {
      setCustomers(list);
      setAllMtUsers(mt);
      setAllMtMgrUsers(mtMgr);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedCustId('');
    setOperationType('İhracat');
    setTransportMode('Karayolu');
    setAssigneeName('');
    setSaving(false);
  }, [open]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustId) ?? null;
  const assignedMt = allMtUsers.find((u) => u.id === selectedCustomer?.assignedMtUserId);
  const assignedMtMgr = allMtMgrUsers.find((u) => u.id === selectedCustomer?.assignedMtManagerUserId);
  const noMtAssigned = selectedCustId && selectedCustomer && !selectedCustomer.assignedMtUserId;

  async function handleSave() {
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      await onSave({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerCity: parseCityFromMeta(selectedCustomer.meta),
        operationType,
        transportMode,
        assigneeName: assigneeName.trim() || assignedMt?.name || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Yeni Talep"
      subtitle="Yeni bir operasyon dosyası oluştur"
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={handleSave} disabled={!selectedCustId || saving}>
            {saving ? 'Kaydediliyor…' : 'Talebi Kaydet'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="İşlem Tipi" htmlFor="nr-islem" required>
            <Select id="nr-islem" value={operationType} onChange={(e) => setOperationType(e.target.value)}>
              <option>İhracat</option>
              <option>İthalat</option>
              <option>Transit</option>
              <option>Antrepo</option>
            </Select>
          </Field>
          <Field label="Taşıma Şekli" htmlFor="nr-tasima">
            <Select id="nr-tasima" value={transportMode} onChange={(e) => setTransportMode(e.target.value)}>
              <option>Karayolu</option>
              <option>Denizyolu</option>
              <option>Havayolu</option>
            </Select>
          </Field>
        </div>

        <Field label="Müşteri" htmlFor="nr-musteri" required>
          <Select
            id="nr-musteri"
            value={selectedCustId}
            onChange={(e) => setSelectedCustId(e.target.value)}
          >
            <option value="">— Müşteri seç —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="MT" htmlFor="nr-mt">
            <Input
              id="nr-mt"
              value={assignedMt?.name ?? ''}
              placeholder={selectedCustId ? (noMtAssigned ? 'Atanmamış' : '—') : '— Müşteri seç —'}
              readOnly
              disabled
              className="cursor-default select-none"
            />
          </Field>
          <Field label="MT Yöneticisi" htmlFor="nr-mt-mgr">
            <Input
              id="nr-mt-mgr"
              value={assignedMtMgr?.name ?? ''}
              placeholder={selectedCustId ? '—' : '— Müşteri seç —'}
              readOnly
              disabled
              className="cursor-default select-none"
            />
          </Field>
        </div>

        {noMtAssigned && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-[12px]" style={{ background: 'var(--warn-tint)', borderColor: '#e8d0a2', color: '#7a5a16' }}>
            <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <span>Bu müşteri için MT ataması yapılmamış</span>
          </div>
        )}

        <Field label="Sorumlu Operatör" htmlFor="nr-sorumlu">
          <Select id="nr-sorumlu" value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)}>
            <option value="">— Seç —</option>
            <option value="M. Demir">M. Demir</option>
            <option value="S. Kaya">S. Kaya</option>
            <option value="A. Yılmaz">A. Yılmaz</option>
          </Select>
        </Field>

        <Field label="Fatura / Evrak Yükle">
          <UploadBox
            title="Dosya seç veya sürükle"
            hint="PDF, XML, JPG, PNG, XLSX"
            multiple
            onFiles={() => {}}
          />
        </Field>

        <Field label="Notlar" htmlFor="nr-notlar">
          <Textarea id="nr-notlar" placeholder="Özel talimat, ek bilgi…" rows={3} />
        </Field>

        <Note variant="info">
          Kaydedilince dosya <strong>Yeni Talep</strong> statüsüyle tabloya eklenir.
        </Note>
      </div>
    </Drawer>
  );
}
