import { useRef, useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

export type GtipFaultRow = {
  lineNo: number;
  materialNo: string;
  description: string;
  invoiceGtip: string;
};

export function GtipChoiceModal({
  open,
  onClose,
  onContinue,
  onAskCustomer,
}: {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  onAskCustomer: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="GTİP kaydı tutuyor"
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button onClick={onAskCustomer}>Müşteriden iste</Button>
          <Button variant="primary" onClick={onContinue}>Devam et</Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed">
        Fatura GTİP’i müşterinin onaylı kaydıyla tutuyor. Devam edelim mi, yoksa müşteriden mi isteyelim?
      </p>
    </Modal>
  );
}

export function GtipFaultListModal({
  open,
  onClose,
  faults,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  faults: GtipFaultRow[];
  onDownload: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="GTİP eksik / hatalı kalemler"
      footer={
        <>
          <Button onClick={onClose}>Kapat</Button>
          <Button variant="primary" onClick={onDownload} disabled={faults.length === 0}>
            CSV indir
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed mb-3">
        Aşağıdaki kalemler müşterinin onaylı malzeme kaydında bulunamadı veya GTİP’i kullanılamıyor.
      </p>
      <div className="max-h-[320px] overflow-auto border border-line rounded-[8px]">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold">Kalem</th>
              <th className="text-left px-2 py-1.5 font-semibold">Malzeme</th>
              <th className="text-left px-2 py-1.5 font-semibold">Tanım</th>
              <th className="text-left px-2 py-1.5 font-semibold">Fatura GTİP</th>
            </tr>
          </thead>
          <tbody>
            {faults.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-muted">Kayıt yok</td>
              </tr>
            ) : (
              faults.map((row) => (
                <tr key={`${row.lineNo}-${row.materialNo}-${row.invoiceGtip}`} className="border-t border-line">
                  <td className="px-2 py-1.5 font-mono">{row.lineNo}</td>
                  <td className="px-2 py-1.5 font-mono">{row.materialNo}</td>
                  <td className="px-2 py-1.5">{row.description}</td>
                  <td className="px-2 py-1.5 font-mono">{row.invoiceGtip}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function useHoldStepConfirm() {
  const [open, setOpen] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  function confirmIfHeld(held: boolean): Promise<boolean> {
    if (!held) return Promise.resolve(true);
    setOpen(true);
    return new Promise((resolve) => {
      pending.current = resolve;
    });
  }

  function close(ok: boolean) {
    setOpen(false);
    pending.current?.(ok);
    pending.current = null;
  }

  const dialog = (
    <Modal
      open={open}
      onClose={() => close(false)}
      title="Dosya beklemedeydi"
      footer={
        <>
          <Button onClick={() => close(false)}>Vazgeç</Button>
          <Button variant="primary" onClick={() => close(true)}>Evet, devam et</Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed">
        Bu dosya beklemedeydi, bu adımı yapmak istiyor musunuz?
      </p>
    </Modal>
  );

  return { confirmIfHeld, dialog };
}
