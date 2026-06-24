import { useState, useEffect } from 'react';
import type { BeyannameListeItem } from '../../types';
import Modal from '../../components/ui/Modal';
import { Field, Select } from '../../components/ui/Fields';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

interface ReminderModalProps {
  open: boolean;
  items: BeyannameListeItem[];
  preselectedRef?: string;
  onClose: () => void;
}

export default function ReminderModal({ open, items, preselectedRef, onClose }: ReminderModalProps) {
  const { toast } = useToast();
  const [ref, setRef] = useState('');

  const isGlobal = !preselectedRef;
  const selected = isGlobal
    ? null
    : (items.find((i) => i.ref === ref) ?? null);

  const itemsWithMissing = items.filter((i) => i.missingDocuments.length > 0);

  useEffect(() => {
    if (!open) {
      setRef('');
      return;
    }
    if (preselectedRef) setRef(preselectedRef);
  }, [open, preselectedRef]);

  function handleSend() {
    if (isGlobal) {
      toast('Tüm eksik evrak hatırlatmaları gönderildi');
    } else if (selected) {
      toast(`${selected.ref} için eksik evrak hatırlatması gönderildi`);
    }
    onClose();
  }

  const canSend = isGlobal
    ? itemsWithMissing.length > 0
    : selected !== null && selected.missingDocuments.length > 0;

  const missingDocs = selected?.missingDocuments ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isGlobal ? 'Eksik Evrak Hatırlat — Toplu' : 'Eksik Evrak Hatırlat'}
      footer={
        <>
          <Button variant="default" onClick={onClose}>İptal</Button>
          <Button variant="primary" onClick={handleSend} disabled={!canSend}>
            Gönder
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {isGlobal ? (
          <>
            <p className="text-[13px] text-text">
              Aşağıdaki beyannamelerin müşterilerine eksik evrak hatırlatması gönderilecek.
            </p>
            {itemsWithMissing.length === 0 ? (
              <div className="px-3 py-2 text-[13px] bg-surface-2 border border-line rounded text-muted">
                Eksik evrak bulunan beyanname yok.
              </div>
            ) : (
              <div className="border border-line rounded bg-surface-2">
                {itemsWithMissing.map((item, i) => (
                  <div
                    key={item.id}
                    className={`px-3 py-2.5 ${i < itemsWithMissing.length - 1 ? 'border-b border-line' : ''}`}
                  >
                    <p className="text-[12.5px] font-semibold text-text-strong">{item.ref} — {item.customer}</p>
                    <p className="text-[11.5px] text-muted mt-0.5">{item.missingDocuments.join(', ')}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="Beyanname / Referans" required>
              <Select
                value={ref}
                onChange={(e) => setRef(e.target.value)}
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

            {selected && (
              <>
                <Field label="Müşteri Alıcı">
                  <div className="px-3 py-2 text-[13px] bg-surface-2 border border-line rounded text-text">
                    {selected.customer}
                  </div>
                </Field>

                <Field label="Eksik Evraklar">
                  {missingDocs.length === 0 ? (
                    <div className="px-3 py-2 text-[13px] bg-surface-2 border border-line rounded text-muted">
                      Bu beyanname için eksik evrak bulunmuyor.
                    </div>
                  ) : (
                    <div className="border border-line rounded bg-surface-2">
                      {missingDocs.map((doc, i) => (
                        <div
                          key={doc}
                          className={`flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-text ${i < missingDocs.length - 1 ? 'border-b border-line' : ''}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-warn" />
                          {doc}
                        </div>
                      ))}
                    </div>
                  )}
                </Field>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
