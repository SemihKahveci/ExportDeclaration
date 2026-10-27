import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { CustomerMail, EvrakDocRow, EvrakFile } from "../../types";
import { sendDocumentReminder } from "../../api/mailApi";
import { customersService } from "../../services/customers";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { ApiError } from "../../api/apiClient";
import { useToast } from "../../components/ui/Toast";

interface DocumentReminderModalProps {
  open: boolean;
  file: EvrakFile | undefined;
  docs: EvrakDocRow[];
  onClose: () => void;
}

export default function DocumentReminderModal({ open, file, docs, onClose }: DocumentReminderModalProps) {
  const { toast } = useToast();
  const [mails, setMails] = useState<CustomerMail[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!open) {
      setMails([]);
      setSelectedId("");
      return;
    }
    const customerId = file?.customerId;
    if (!customerId) {
      setMails([]);
      setSelectedId("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    customersService.getMails(customerId).then((rows) => {
      if (cancelled) return;
      const saved = rows.filter((mail) => mail.email.trim());
      setMails(saved);
      setSelectedId(saved[0]?.id ?? "");
    }).catch(() => {
      if (!cancelled) {
        setMails([]);
        setSelectedId("");
        toast("Müşteri mail adresleri alınamadı");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, file?.customerId, toast]);

  const selected = mails.find((mail) => mail.id === selectedId);
  const canSend = Boolean(file?.customerId && selected && !loading && !sending);

  async function handleSend() {
    if (!file?.customerId || !selected) return;
    setSending(true);
    try {
      await sendDocumentReminder({
        customerId: file.customerId,
        to: selected.email,
        customerName: file.customer,
        reference: file.ref,
        missingDocuments: docs.filter((doc) => doc.status === "Eksik").map((doc) => doc.name)
      });
      toast(`${selected.email} adresine evrak hatırlatması gönderildi`);
      onClose();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Mail gönderilemedi";
      toast(message, { duration: 7000 });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Evrak hatırlatması"
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button
            variant="primary"
            disabled={!canSend}
            onClick={() => void handleSend()}
            writeCap="beyanname.write"
            title={mails.length === 0 ? "Kayıtlı mail adresi yok" : undefined}
          >
            {sending ? "Gönderiliyor…" : "Mail Gönder"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-text">
          {file ? `${file.ref} · ${file.customer}` : "Dosya seçilmedi"}
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin" />
            Mail adresleri yükleniyor
          </div>
        ) : mails.length === 0 ? (
          <p className="text-[13px] text-muted rounded border border-line bg-surface-2 px-3 py-2.5">
            Bu müşteriye kayıtlı mail adresi yok. Mail gönderilemez.
          </p>
        ) : (
          <div className="border border-line rounded overflow-hidden">
            {mails.map((mail) => (
              <label
                key={mail.id}
                className="flex items-start gap-3 px-3 py-2.5 border-b border-line last:border-b-0 cursor-pointer hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="reminder-mail"
                  className="mt-1"
                  checked={selectedId === mail.id}
                  onChange={() => setSelectedId(mail.id)}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-strong break-all">{mail.email}</span>
                  {mail.owner && <span className="block text-[12px] text-muted mt-0.5">{mail.owner}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
