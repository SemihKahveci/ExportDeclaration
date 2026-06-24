import { useState, useEffect } from 'react';
import { Send, Clock } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import Note from '../../components/ui/Note';
import type { GtipQueryResult } from '../../types';

interface GtipRecordDrawerProps {
  open: boolean;
  target: GtipQueryResult | null;
  onClose: () => void;
  onSave: (materialNo: string, description: string, gtipNo: string, customer: string, source: string, note: string) => void;
}

export default function GtipRecordDrawer({ open, target, onClose, onSave }: GtipRecordDrawerProps) {
  const [gtipNo, setGtipNo]     = useState('');
  const [customer, setCustomer] = useState('Arçelik A.Ş.');
  const [source, setSource]     = useState('GTİP Sorgulama Talebi');
  const [note, setNote]         = useState('');

  useEffect(() => {
    if (!open) return;
    setGtipNo('');
    setNote('');
    setCustomer('Arçelik A.Ş.');
    setSource('GTİP Sorgulama Talebi');
  }, [open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="GTİP Kaydı Ekle"
      subtitle="Malzeme bilgileri sorgu sonucundan gelir; değiştirilemez"
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button
            variant="primary"
            icon={Send}
            onClick={() =>
              onSave(
                target?.materialNo ?? '',
                target?.description ?? '',
                gtipNo,
                customer,
                source,
                note,
              )
            }
          >
            Onaya Gönder
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Note variant="info">
          Bu ekrandan yalnızca GTİP numarası girilir. Malzeme no ve tanımı sorgu sonucundan gelir ve
          değiştirilemez. Kayıt, onay kurallarına göre onay sürecine düşer.
        </Note>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Malzeme No" htmlFor="dr-mat-no">
            <Input
              id="dr-mat-no"
              value={target?.materialNo ?? ''}
              readOnly
              className="!bg-surface-2 !text-muted cursor-not-allowed font-semibold"
            />
          </Field>
          <Field label="GTİP No" htmlFor="dr-gtip-no">
            <Input
              id="dr-gtip-no"
              value={gtipNo}
              onChange={(e) => setGtipNo(e.target.value)}
              placeholder="3926.90.97.90.18"
              className="font-mono"
            />
          </Field>
        </div>

        <Field label="Malzeme Tanımı" htmlFor="dr-mat-desc">
          <Input
            id="dr-mat-desc"
            value={target?.description ?? ''}
            readOnly
            className="!bg-surface-2 !text-muted cursor-not-allowed font-semibold"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Müşteri" htmlFor="dr-customer">
            <Select id="dr-customer" value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option>Arçelik A.Ş.</option>
              <option>Valeo eAutomotive Hungary Kft.</option>
              <option>Ford Otosan</option>
            </Select>
          </Field>
          <Field label="Giriş Kaynağı" htmlFor="dr-source">
            <Select id="dr-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option>GTİP Sorgulama Talebi</option>
              <option>Operasyon Manuel Giriş</option>
            </Select>
          </Field>
        </div>

        <Field label="Açıklama" htmlFor="dr-note">
          <Textarea
            id="dr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Bu GTİP neden girildi? Müşteri talebi / ürün açıklaması / ek not"
          />
        </Field>

        {/* Approval notice */}
        <div
          className="flex items-center gap-3 rounded-[9px] px-4 py-3 text-[12.5px]"
          style={{ background: 'var(--warn-tint)', border: '1px solid #e8d0a2', color: '#7a5a16' }}
        >
          <Clock size={16} className="shrink-0" strokeWidth={2} />
          <span>
            Kayıt durumu: <strong>Onay Bekliyor.</strong>{' '}
            Onaylanana kadar sonraki süreçlerde öneri olarak gösterilir; kesin sistem GTİP'i olarak kullanılmaz.
          </span>
        </div>
      </div>
    </Drawer>
  );
}
