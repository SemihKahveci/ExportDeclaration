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

interface NewRequestDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function NewRequestDrawer({ open, onClose, onSave }: NewRequestDrawerProps) {
  const [customers,       setCustomers]       = useState<CustomerListItem[]>([]);
  const [allMtUsers,      setAllMtUsers]      = useState<AppUser[]>([]);
  const [allMtMgrUsers,   setAllMtMgrUsers]   = useState<AppUser[]>([]);
  const [selectedCustId,  setSelectedCustId]  = useState('');

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

  // Reset form when drawer opens
  useEffect(() => {
    if (open) setSelectedCustId('');
  }, [open]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustId) ?? null;

  const assignedMt    = allMtUsers.find((u) => u.id === selectedCustomer?.assignedMtUserId);
  const assignedMtMgr = allMtMgrUsers.find((u) => u.id === selectedCustomer?.assignedMtManagerUserId);

  const noMtAssigned = selectedCustId && selectedCustomer && !selectedCustomer.assignedMtUserId;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Yeni Talep"
      subtitle="Yeni bir ihracat dosyası oluştur"
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={onSave}>Talebi Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="İşlem Tipi" htmlFor="nr-islem">
            <Select id="nr-islem">
              <option>İhracat</option>
              <option>İthalat</option>
              <option>Transit</option>
              <option>Antrepo</option>
            </Select>
          </Field>
          <Field label="Taşıma Şekli" htmlFor="nr-tasima">
            <Select id="nr-tasima">
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

        {/* MT fields — auto-filled from customer, always read-only */}
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

        {/* Warning when selected customer has no MT assigned */}
        {noMtAssigned && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-[12px]" style={{ background: 'var(--warn-tint)', borderColor: '#e8d0a2', color: '#7a5a16' }}>
            <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <span>Bu müşteri için MT ataması yapılmamış</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Talep Tarihi" htmlFor="nr-talep-tarih">
            <Input id="nr-talep-tarih" type="date" defaultValue="2026-05-25" />
          </Field>
          <Field label="Cut-off Tarihi" htmlFor="nr-cutoff">
            <Input id="nr-cutoff" type="date" />
          </Field>
        </div>

        <Field label="Sorumlu Operatör" htmlFor="nr-sorumlu">
          <Select id="nr-sorumlu">
            <option value="">— Seç —</option>
            <option>M. Demir</option>
            <option>S. Kaya</option>
            <option>A. Yılmaz</option>
          </Select>
        </Field>

        <Field label="Talep Kanalı" htmlFor="nr-kanal">
          <Select id="nr-kanal">
            <option>E-posta</option>
            <option>WhatsApp</option>
            <option>Telefon</option>
            <option>Sistem içi</option>
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
          Kaydedilince dosya <strong>Yeni Talep</strong> statüsüyle tabloya eklenir ve ilgili operatöre atanır.
        </Note>
      </div>
    </Drawer>
  );
}
