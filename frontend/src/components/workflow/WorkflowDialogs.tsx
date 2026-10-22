import { useRef, useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

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
