import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { CustomerMail, EvrakDocRow, EvrakFile, NotificationRule } from "../../types";
import { sendDocumentReminder } from "../../api/mailApi";
import { customersService } from "../../services/customers";
import { useAppContext } from "../../context/AppContext";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { ApiError } from "../../api/apiClient";
import { useToast } from "../../components/ui/Toast";

const PROCESS = "Eksik Evrak Hatırlatma";

interface DocumentReminderModalProps {
  open: boolean;
  file: EvrakFile | undefined;
  docs: EvrakDocRow[];
  onClose: () => void;
}

function recipientKind(rule: string | undefined): "defined" | "sender" | "both" {
  const text = (rule ?? "").trim().toLocaleLowerCase("tr-TR");
  if (text === "her ikisi") return "both";
  if (text.includes("gönderen") || text.includes("gonderen")) return "sender";
  return "defined";
}

function previewRecipients(mails: CustomerMail[], rule: NotificationRule | undefined, sender: string): string[] {
  if (rule && (rule.status === "Pasif" || rule.workingMode === "Kapalı" || rule.workingMode === "Manuel")) return [];
  const kind = recipientKind(rule?.recipientRule);
  const active = mails.filter((mail) => mail.status !== "passive" && mail.matchStatus !== "passive" && mail.email.trim());
  const tagged = active.filter((mail) => mail.notificationProcesses.includes(PROCESS));
  const defined = [...new Set((tagged.length > 0 ? tagged : active).map((mail) => mail.email.trim().toLowerCase()))];
  if (kind === "sender") return sender ? [sender] : [];
  if (kind === "both") return [...new Set([...defined, ...(sender ? [sender] : [])])];
  return defined;
}

export default function DocumentReminderModal({ open, file, docs, onClose }: DocumentReminderModalProps) {
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [blocked, setBlocked] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setRecipients([]);
      setBlocked("");
      return;
    }
    const customerId = file?.customerId;
    if (!customerId) {
      setRecipients([]);
      setBlocked("Dosyanın müşterisi yok.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      customersService.getMails(customerId),
      customersService.getNotifyRules(customerId)
    ]).then(([mails, rules]) => {
      if (cancelled) return;
      const rule = rules.find((item) => item.process === PROCESS);
      if (rule && (rule.status === "Pasif" || rule.workingMode === "Kapalı")) {
        setRecipients([]);
        setBlocked("Bu müşteride eksik evrak bildirimi kapalı.");
        return;
      }
      const next = previewRecipients(mails, rule, currentUser.email?.trim().toLowerCase() ?? "");
      setRecipients(next);
      setBlocked(next.length === 0 ? "Bildirim kuralına göre alıcı bulunamadı." : "");
    }).catch(() => {
      if (!cancelled) {
        setRecipients([]);
        setBlocked("Bildirim alıcıları alınamadı.");
        toast("Bildirim alıcıları alınamadı");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, file?.customerId, currentUser.email, toast]);

  const canSend = Boolean(file?.customerId && recipients.length > 0 && !loading && !sending);

  async function handleSend() {
    if (!file?.customerId) return;
    setSending(true);
    try {
      const result = await sendDocumentReminder({
        customerId: file.customerId,
        customerName: file.customer,
        reference: file.ref,
        missingDocuments: docs.filter((doc) => doc.status === "Eksik").map((doc) => doc.name)
      });
      toast(result.to.length > 0 ? `Hatırlatma ${result.to.length} adrese gönderildi` : "Alıcı bulunamadı");
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
          <Button variant="primary" disabled={!canSend} onClick={() => void handleSend()} writeCap="beyanname.write">
            {sending ? "Gönderiliyor…" : "Mail Gönder"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-text">
          {file ? `${file.ref} · ${file.customer}` : "Dosya seçilmedi"}
        </p>
        <p className="text-[12.5px] text-muted leading-relaxed">
          Alıcılar müşterinin bildirim kuralına göre belirlenir: tanımlı mailler, maili gönderen kullanıcı veya her ikisi.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin" />
            Alıcılar yükleniyor
          </div>
        ) : blocked ? (
          <p className="text-[13px] text-muted rounded border border-line bg-surface-2 px-3 py-2.5">{blocked}</p>
        ) : (
          <ul className="border border-line rounded overflow-hidden">
            {recipients.map((email) => (
              <li key={email} className="px-3 py-2.5 border-b border-line last:border-b-0 text-[13px] font-semibold text-text-strong break-all">
                {email}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
