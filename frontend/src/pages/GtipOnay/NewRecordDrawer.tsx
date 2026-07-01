import { useState } from 'react';
import { Check, Info } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Fields';
import Note from '../../components/ui/Note';
import type { TransactionType, RecordSource, MaterialRecord } from '../../types';

interface NewRecordDrawerProps {
  open: boolean;
  customerName: string;
  onClose: () => void;
  onSave: (record: Omit<MaterialRecord, 'id' | 'customerId'>) => void;
}

const ALL_TYPES: TransactionType[] = ['ithalat', 'ihracat', 'transit', 'antrepo'];

const TYPE_LABELS: Record<TransactionType, string> = {
  ithalat: 'İthalat',
  ihracat: 'İhracat',
  transit: 'Transit',
  antrepo: 'Antrepo',
};

function today(): string {
  const d = new Date();
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('.');
}

export default function NewRecordDrawer({
  open,
  customerName,
  onClose,
  onSave,
}: NewRecordDrawerProps) {
  const [materialNo, setMaterialNo] = useState('');
  const [description, setDescription] = useState('');
  const [gtipNo, setGtipNo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>(ALL_TYPES);

  function toggleType(t: TransactionType) {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function handleSave() {
    const source: RecordSource = 'manuel';
    const types = selectedTypes.length === 0 ? [...ALL_TYPES] : selectedTypes;
    onSave({
      materialNo: materialNo.trim() || `MLZ-${Math.floor(100000 + Math.random() * 900000)}`,
      description: description.trim() || '(tanımsız malzeme)',
      gtipNo: gtipNo.trim() || '0000.00.00.00.00',
      transactionTypes: types,
      status: 'pending',
      source,
      updatedAt: today(),
    });
    setMaterialNo('');
    setDescription('');
    setGtipNo('');
    setSelectedTypes(ALL_TYPES);
  }

  const allSelected = ALL_TYPES.every((t) => selectedTypes.includes(t));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Yeni Kayıt"
      subtitle={`${customerName} · malzeme ↔ GTİP eşlemesi`}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={handleSave}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Malzeme Numarası" htmlFor="nr-mlz">
          <Input
            id="nr-mlz"
            value={materialNo}
            onChange={(e) => setMaterialNo(e.target.value)}
            placeholder="MLZ-…"
            className="font-mono"
          />
        </Field>

        <Field label="Malzeme Tanımı" htmlFor="nr-tanim">
          <Input
            id="nr-tanim"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ör. Hermetik kompresör 1/4 HP"
          />
        </Field>

        <Field label="GTİP Numarası" htmlFor="nr-gtip">
          <Input
            id="nr-gtip"
            value={gtipNo}
            onChange={(e) => setGtipNo(e.target.value)}
            placeholder="0000.00.00.00.00"
            className="font-mono"
          />
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted mt-1.5">
            <Info size={13} strokeWidth={2} />
            GTİP girildikten sonra malzeme tanımıyla uyumu kontrol edilir.
          </p>
        </Field>

        <Field label="Uygulanabilir İşlem Tipleri">
          <div className="grid grid-cols-2 gap-2">
            {ALL_TYPES.map((t) => {
              const on = selectedTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={[
                    'flex items-center gap-2.5 border rounded-[8px] px-3 py-[9px] text-[13px] font-semibold transition-colors text-left',
                    on
                      ? 'border-accent bg-accent-tint text-accent'
                      : 'border-line-strong bg-surface text-text hover:border-muted-2',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors',
                      on ? 'bg-accent border-accent' : 'border-line-strong',
                    ].join(' ')}
                  >
                    {on && <Check size={11} strokeWidth={3} className="text-white" />}
                  </span>
                  {TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
          <p className="text-[11.5px] text-muted mt-1.5">
            {allSelected ? 'Hepsi seçili → "Tümü" olarak gösterilir.' : `${selectedTypes.length} tip seçili.`}
          </p>
        </Field>

        <Note variant="warn">
          Yeni kayıt <strong>Onay Bekleyen</strong> olarak eklenir; doğrulandıktan sonra beyannamede kullanılabilir.
        </Note>
      </div>
    </Drawer>
  );
}
