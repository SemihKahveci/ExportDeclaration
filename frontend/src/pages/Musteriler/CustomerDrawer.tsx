import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import { useToast } from '../../components/ui/Toast';
import type {
  CustomerAddress,
  MailDomain,
  CustomerMail,
  DocumentRule,
  NotificationRule,
  NotifyWorkingMode,
} from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DrawerMode = 'addr' | 'domain' | 'mail' | 'rule' | 'notify';

export type DrawerPayload =
  | { mode: 'addr';   data: Omit<CustomerAddress, 'id' | 'customerId'> }
  | { mode: 'domain'; data: Omit<MailDomain, 'id' | 'customerId'> }
  | { mode: 'mail';   data: Omit<CustomerMail, 'id' | 'customerId'> }
  | { mode: 'rule';   data: Omit<DocumentRule, 'id' | 'customerId'> }
  | { mode: 'notify'; data: Omit<NotificationRule, 'id' | 'customerId'> };

interface CustomerDrawerProps {
  open: boolean;
  mode: DrawerMode;
  customerName: string;
  initialAddress?: CustomerAddress;
  initialDomain?: MailDomain;
  initialMail?: CustomerMail;
  initialRule?: DocumentRule;
  initialNotify?: NotificationRule;
  onClose: () => void;
  onSave: (payload: DrawerPayload) => void;
}

const SELECT_PLACEHOLDER = '';

const NOTIFICATION_PROCESS_LIST = [
  'GTİP Eksik · Kontrollü',
  'GTİP Hatalı · Kontrollü',
  'Evrak Eksik · Otomatik',
  'Beyanname Başladı · Otomatik',
  'Tescil Başladı · Otomatik',
  'Tescil Edildi · Otomatik',
  'Kapanış Evrakları · Manuel',
  'Para Talep · Kontrollü',
];

const DOCUMENT_LIST = [
  'Fatura', 'Çeki Listesi', 'CMR', 'Konşimento', 'AWB', 'Booking',
  'Dolaşım Belgesi', 'Menşe Şahadetnamesi', 'ATR', 'EUR.1',
  'Sigorta Poliçesi', 'Özet Beyan Bilgisi',
];

const NOTIFY_PROCESS_LIST = [
  'Eksik Evrak Hatırlatma', 'GTİP Eksik Bildirimi', 'GTİP Hatalı Bildirimi',
  'Yanlış Beyanname Bildirimi', 'Beyanname Yazımı Başladı',
  'Tescil Bilgilendirmesi', 'Beyanname Tescil Edildi',
  'Kapanış Evrakları Gönderimi', 'Para Talep / Ödeme Bildirimi',
];

const NOTIFY_MODE_OPTIONS = ['Otomatik', 'Kontrollü', 'Kapalı'] as const;
const RECIPIENT_RULE_OPTIONS = ['Mail', 'Domain', 'Mail + Domain', 'Kullanıcı seçimi'] as const;

function normalizeRecipientRule(value: string): string {
  const map: Record<string, string> = {
    'Mail tanımlarından': 'Mail',
    'Domain eşleşmesine göre': 'Domain',
    'Operatör seçer': 'Kullanıcı seçimi',
  };
  if (value.startsWith('—')) return SELECT_PLACEHOLDER;
  return map[value] ?? value;
}

function normalizeWorkingMode(mode: NotifyWorkingMode): string {
  if (mode === 'Manuel') return 'Kapalı';
  return mode;
}

const TRANSACTION_TYPES = ['İhracat', 'İthalat', 'Transit', 'Antrepo'];
const TRANSPORT_MODES = ['Karayolu', 'Denizyolu', 'Havayolu'];
const REMINDER_TYPES = ['Otomatik', 'Kontrollü', 'Manuel'] as const;
const FREQUENCY_OPTIONS = [
  'Her 2 saatte bir',
  'Günde 1 kez',
  'Günde 2 kez',
  "Cut-off'a göre dinamik",
  'Manuel takip',
];

function CheckGrid({
  items,
  selected,
  onChange,
  cols = 2,
}: {
  items: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  cols?: number;
}) {
  function toggle(item: string) {
    onChange(
      selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]
    );
  }
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((item) => {
        const on = selected.includes(item);
        return (
          <label
            key={item}
            className={[
              'flex items-center gap-2 text-[13px] font-medium px-2.5 py-2 border rounded-[7px] cursor-pointer transition-colors',
              on ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong bg-surface text-text hover:border-accent',
            ].join(' ')}
          >
            <span
              onClick={() => toggle(item)}
              className={[
                'w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors',
                on ? 'bg-accent border-accent' : 'border-line-strong',
              ].join(' ')}
            >
              {on && <Check size={10} strokeWidth={3} className="text-white" />}
            </span>
            <span onClick={() => toggle(item)} className="flex-1 leading-snug">{item}</span>
          </label>
        );
      })}
    </div>
  );
}

function PlaceholderOption() {
  return <option value={SELECT_PLACEHOLDER}>Seçiniz</option>;
}

export default function CustomerDrawer({
  open,
  mode,
  customerName,
  initialAddress,
  initialDomain,
  initialMail,
  initialRule,
  initialNotify,
  onClose,
  onSave,
}: CustomerDrawerProps) {
  const { toast } = useToast();

  const [aAddrLines, setAAddrLines] = useState('');
  const [aCity, setACity]           = useState('');
  const [aCountry, setACountry]     = useState('');
  const [aTaxNo, setATaxNo]         = useState('');

  const [dDomain, setDDomain]       = useState('');
  const [dMatch, setDMatch]         = useState<'active' | 'passive'>('active');
  const [dNote, setDNote]           = useState('');

  const [mEmail, setMEmail]         = useState('');
  const [mDomain, setMDomain]       = useState('');
  const [mOwner, setMOwner]         = useState('');
  const [mMatch, setMMatch]         = useState<'active' | 'passive'>('active');
  const [mProcesses, setMProcesses] = useState<string[]>([]);
  const [mStatus, setMStatus]       = useState<'active' | 'passive'>('active');

  const [rTip, setRTip]             = useState(SELECT_PLACEHOLDER);
  const [rTas, setRTas]             = useState(SELECT_PLACEHOLDER);
  const [rDocs, setRDocs]           = useState<string[]>([]);
  const [rReminder, setRReminder]   = useState<string>(SELECT_PLACEHOLDER);
  const [rFreq, setRFreq]           = useState(SELECT_PLACEHOLDER);
  const [rStatus, setRStatus]       = useState<string>(SELECT_PLACEHOLDER);

  const [nProcess, setNProcess]     = useState(SELECT_PLACEHOLDER);
  const [nMode, setNMode]           = useState(SELECT_PLACEHOLDER);
  const [nChannels, setNChannels]   = useState<string[]>(['E-posta']);
  const [nRecipient, setNRecipient] = useState(SELECT_PLACEHOLDER);
  const [nStatus, setNStatus]       = useState<string>(SELECT_PLACEHOLDER);

  useEffect(() => {
    if (!open) return;
    if (mode === 'addr' && initialAddress) {
      setAAddrLines(initialAddress.addressLines);
      setACity(initialAddress.city);
      setACountry(initialAddress.country);
      setATaxNo(initialAddress.taxNo);
    } else if (mode === 'addr') {
      setAAddrLines('');
      setACity('');
      setACountry('');
      setATaxNo('');
    }
    if (mode === 'domain' && initialDomain) {
      setDDomain(initialDomain.domain);
      setDMatch(initialDomain.matchStatus);
      setDNote(initialDomain.note);
    } else if (mode === 'domain') {
      setDDomain('');
      setDMatch('active');
      setDNote('');
    }
    if (mode === 'mail' && initialMail) {
      setMEmail(initialMail.email);
      setMDomain(initialMail.domain);
      setMOwner(initialMail.owner);
      setMMatch(initialMail.matchStatus);
      setMProcesses(initialMail.notificationProcesses);
      setMStatus(initialMail.status);
    } else if (mode === 'mail') {
      setMEmail('');
      setMDomain('');
      setMOwner('');
      setMMatch('active');
      setMProcesses([]);
      setMStatus('active');
    }
    if (mode === 'rule' && initialRule) {
      setRTip(initialRule.transactionType);
      setRTas(initialRule.transportMode);
      setRDocs(initialRule.requiredDocs);
      setRReminder(initialRule.reminderType);
      setRFreq(initialRule.frequency);
      setRStatus(initialRule.status);
    } else if (mode === 'rule') {
      setRTip(SELECT_PLACEHOLDER);
      setRTas(SELECT_PLACEHOLDER);
      setRDocs([]);
      setRReminder(SELECT_PLACEHOLDER);
      setRFreq(SELECT_PLACEHOLDER);
      setRStatus(SELECT_PLACEHOLDER);
    }
    if (mode === 'notify' && initialNotify) {
      setNProcess(initialNotify.process);
      setNMode(normalizeWorkingMode(initialNotify.workingMode));
      setNChannels(initialNotify.channels.length > 0 ? initialNotify.channels : ['E-posta']);
      setNRecipient(normalizeRecipientRule(initialNotify.recipientRule));
      setNStatus(initialNotify.status);
    } else if (mode === 'notify') {
      setNProcess(SELECT_PLACEHOLDER);
      setNMode(SELECT_PLACEHOLDER);
      setNChannels(['E-posta']);
      setNRecipient(SELECT_PLACEHOLDER);
      setNStatus(SELECT_PLACEHOLDER);
    }
  }, [open, mode, initialAddress, initialDomain, initialMail, initialRule, initialNotify]);

  useEffect(() => {
    if (mode !== 'notify') return;
    if (nMode === 'Otomatik' && nRecipient === 'Kullanıcı seçimi') {
      setNRecipient(SELECT_PLACEHOLDER);
    }
  }, [mode, nMode, nRecipient]);

  const companyName = customerName.trim();

  const canSave = useMemo(() => {
    if (mode === 'addr') {
      return (
        !!companyName &&
        aAddrLines.trim() !== '' &&
        aCity.trim() !== '' &&
        aCountry.trim() !== '' &&
        aTaxNo.trim() !== ''
      );
    }
    if (mode === 'domain') return dDomain.trim() !== '';
    if (mode === 'mail') {
      return (
        mEmail.trim() !== '' &&
        mDomain.trim() !== '' &&
        mOwner.trim() !== '' &&
        mProcesses.length > 0
      );
    }
    if (mode === 'rule') {
      return (
        rTip !== SELECT_PLACEHOLDER &&
        rTas !== SELECT_PLACEHOLDER &&
        rDocs.length > 0 &&
        rReminder !== SELECT_PLACEHOLDER &&
        rFreq !== SELECT_PLACEHOLDER &&
        rStatus !== SELECT_PLACEHOLDER
      );
    }
    if (mode === 'notify') {
      return (
        nProcess !== SELECT_PLACEHOLDER &&
        nMode !== SELECT_PLACEHOLDER &&
        nRecipient !== SELECT_PLACEHOLDER &&
        nStatus !== SELECT_PLACEHOLDER
      );
    }
    return true;
  }, [
    mode, companyName, aAddrLines, aCity, aCountry, aTaxNo,
    dDomain, mEmail, mDomain, mOwner, mProcesses,
    rTip, rTas, rDocs, rReminder, rFreq, rStatus,
    nProcess, nMode, nRecipient, nStatus,
  ]);

  function handleSave() {
    if (!canSave) {
      if (mode === 'mail' && mProcesses.length === 0) {
        toast('En az bir bildirim süreci seçilmelidir');
      } else if (mode === 'rule' && rDocs.length === 0) {
        toast('En az bir gerekli evrak seçilmelidir');
      } else {
        toast('Lütfen zorunlu alanları doldurun');
      }
      return;
    }

    if (mode === 'addr') {
      onSave({
        mode: 'addr',
        data: {
          company: companyName,
          addressLines: aAddrLines.trim(),
          city: aCity.trim(),
          country: aCountry.trim(),
          taxNo: aTaxNo.trim(),
          evrimStatus: initialAddress?.evrimStatus ?? 'local',
          changed: true,
        },
      });
    } else if (mode === 'domain') {
      onSave({
        mode: 'domain',
        data: { domain: dDomain.trim(), matchStatus: dMatch, note: dNote.trim() },
      });
    } else if (mode === 'mail') {
      onSave({
        mode: 'mail',
        data: {
          email: mEmail.trim(),
          domain: mDomain.trim(),
          owner: mOwner.trim(),
          matchStatus: mMatch,
          notificationProcesses: mProcesses,
          status: mStatus,
        },
      });
    } else if (mode === 'rule') {
      onSave({
        mode: 'rule',
        data: {
          transactionType: rTip,
          transportMode: rTas,
          scenario: '',
          requiredDocs: rDocs,
          reminderType: rReminder as DocumentRule['reminderType'],
          frequency: rFreq,
          status: rStatus as DocumentRule['status'],
        },
      });
    } else if (mode === 'notify') {
      onSave({
        mode: 'notify',
        data: {
          process: nProcess,
          workingMode: nMode as NotifyWorkingMode,
          channels: nChannels,
          recipientRule: nRecipient,
          requiresApproval: nMode === 'Kontrollü',
          status: nStatus as NotificationRule['status'],
        },
      });
    }
  }

  const titleMap: Record<DrawerMode, string> = {
    addr:   initialAddress ? 'Adresi Düzenle'          : 'Yeni Adres',
    domain: initialDomain  ? 'Domain Düzenle'          : 'Yeni Mail Domain',
    mail:   initialMail    ? 'Mail Tanımı Düzenle'     : 'Yeni Mail Tanımı',
    rule:   initialRule    ? 'Evrak Kuralı Düzenle'   : 'Yeni Evrak Kuralı',
    notify: initialNotify  ? 'Bildirim Kuralı Düzenle' : 'Yeni Bildirim Kuralı',
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={titleMap[mode]}
      subtitle={customerName}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            Kaydet
          </Button>
        </>
      }
    >
      {mode === 'addr' && (
        <div className="space-y-4">
          <Field label="Firma Ünvanı" htmlFor="a-company">
            <Input
              id="a-company"
              value={companyName}
              readOnly
              className="bg-surface-2 text-muted cursor-not-allowed"
            />
          </Field>
          <Field label="Adres Satırları" htmlFor="a-addr" required>
            <Textarea
              id="a-addr"
              value={aAddrLines}
              onChange={(e) => setAAddrLines(e.target.value)}
              rows={3}
              placeholder="Her satır ayrı"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Şehir / Bölge" htmlFor="a-city" required>
              <Input id="a-city" value={aCity} onChange={(e) => setACity(e.target.value)} />
            </Field>
            <Field label="Ülke" htmlFor="a-country" required>
              <Input id="a-country" value={aCountry} onChange={(e) => setACountry(e.target.value)} />
            </Field>
          </div>
          <Field label="VKN / Tax No" htmlFor="a-taxno" required>
            <Input
              id="a-taxno"
              value={aTaxNo}
              onChange={(e) => setATaxNo(e.target.value)}
              className="font-mono"
            />
          </Field>
        </div>
      )}

      {mode === 'domain' && (
        <div className="space-y-4">
          <Field label="Mail Domain / Uzantısı" htmlFor="d-domain" required>
            <Input
              id="d-domain"
              value={dDomain}
              onChange={(e) => setDDomain(e.target.value)}
              placeholder="@firma.com"
            />
          </Field>
          <Field label="Gelen Mail Eşleştirme" htmlFor="d-match">
            <Select
              id="d-match"
              value={dMatch}
              onChange={(e) => setDMatch(e.target.value as 'active' | 'passive')}
            >
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </Select>
          </Field>
          <Field label="Açıklama" htmlFor="d-note">
            <Input id="d-note" value={dNote} onChange={(e) => setDNote(e.target.value)} />
          </Field>
        </div>
      )}

      {mode === 'mail' && (
        <div className="space-y-4">
          <Field label="Mail Adresi" htmlFor="m-email" required>
            <Input
              id="m-email"
              value={mEmail}
              onChange={(e) => setMEmail(e.target.value)}
              placeholder="ad@firma.com"
            />
          </Field>
          <Field label="Mail Domain" htmlFor="m-domain" required>
            <Input
              id="m-domain"
              value={mDomain}
              onChange={(e) => setMDomain(e.target.value)}
              placeholder="@firma.com"
              className="font-mono"
            />
          </Field>
          <Field label="Kişi / Birim" htmlFor="m-owner" required>
            <Input id="m-owner" value={mOwner} onChange={(e) => setMOwner(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Eşleştirme" htmlFor="m-match">
              <Select id="m-match" value={mMatch} onChange={(e) => setMMatch(e.target.value as 'active' | 'passive')}>
                <option value="active">Aktif</option>
                <option value="passive">Pasif</option>
              </Select>
            </Field>
            <Field label="Durum" htmlFor="m-status">
              <Select id="m-status" value={mStatus} onChange={(e) => setMStatus(e.target.value as 'active' | 'passive')}>
                <option value="active">Aktif</option>
                <option value="passive">Pasif</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Bildirim Alacağı Süreçler"
            required
            hint={mProcesses.length === 0 ? 'En az bir süreç seçilmelidir.' : undefined}
          >
            <CheckGrid items={NOTIFICATION_PROCESS_LIST} selected={mProcesses} onChange={setMProcesses} cols={2} />
          </Field>
        </div>
      )}

      {mode === 'rule' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="İşlem Tipi" htmlFor="r-tip" required>
              <Select id="r-tip" value={rTip} onChange={(e) => setRTip(e.target.value)}>
                <PlaceholderOption />
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Taşıma Şekli" htmlFor="r-tas" required>
              <Select id="r-tas" value={rTas} onChange={(e) => setRTas(e.target.value)}>
                <PlaceholderOption />
                {TRANSPORT_MODES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Gerekli Evraklar"
            required
            hint={rDocs.length === 0 ? 'En az bir evrak seçilmelidir.' : 'Fatura temel belgedir; diğer evraklar buradan seçilir.'}
          >
            <div className="mt-1">
              <CheckGrid items={DOCUMENT_LIST} selected={rDocs} onChange={setRDocs} cols={2} />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hatırlatma Tipi" htmlFor="r-reminder" required>
              <Select
                id="r-reminder"
                value={rReminder}
                onChange={(e) => setRReminder(e.target.value)}
              >
                <PlaceholderOption />
                {REMINDER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Sıklık" htmlFor="r-freq" required>
              <Select id="r-freq" value={rFreq} onChange={(e) => setRFreq(e.target.value)}>
                <PlaceholderOption />
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Durum" htmlFor="r-status" required>
            <Select id="r-status" value={rStatus} onChange={(e) => setRStatus(e.target.value)}>
              <PlaceholderOption />
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
            </Select>
          </Field>
        </div>
      )}

      {mode === 'notify' && (
        <div className="space-y-4">
          <Field label="İşlem / Bildirim Süreci" htmlFor="n-process" required>
            <Select id="n-process" value={nProcess} onChange={(e) => setNProcess(e.target.value)}>
              <PlaceholderOption />
              {NOTIFY_PROCESS_LIST.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Çalışma Şekli"
            htmlFor="n-mode"
            required
            hint="Otomatik: sistem tetikler · Kontrollü: operatör onaylar · Kapalı: bildirim gitmez"
          >
            <Select
              id="n-mode"
              value={nMode}
              onChange={(e) => setNMode(e.target.value)}
            >
              <PlaceholderOption />
              {NOTIFY_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Bildirim Kanalı" required>
            <div className="mt-1">
              <div className="flex items-center gap-2 text-[13px] font-medium px-2.5 py-2 border rounded-[7px] border-accent bg-accent-tint text-accent w-fit">
                <span className="w-[15px] h-[15px] rounded-[4px] border border-accent bg-accent flex items-center justify-center shrink-0">
                  <Check size={10} strokeWidth={3} className="text-white" />
                </span>
                E-posta
              </div>
            </div>
          </Field>
          <Field label="Alıcı Kuralı" htmlFor="n-recipient" required>
            <Select
              id="n-recipient"
              value={nRecipient}
              onChange={(e) => setNRecipient(e.target.value)}
            >
              <PlaceholderOption />
              {RECIPIENT_RULE_OPTIONS.filter(
                (opt) => nMode !== 'Otomatik' || opt !== 'Kullanıcı seçimi'
              ).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Select>
          </Field>
          <Field label="Durum" htmlFor="n-status" required>
            <Select
              id="n-status"
              value={nStatus}
              onChange={(e) => setNStatus(e.target.value)}
            >
              <PlaceholderOption />
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
            </Select>
          </Field>
        </div>
      )}
    </Drawer>
  );
}
