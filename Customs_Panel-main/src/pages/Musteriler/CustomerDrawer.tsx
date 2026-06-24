import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import type {
  CustomerAddress,
  MailDomain,
  CustomerMail,
  DocumentRule,
  NotificationRule,
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

// ─── Constants ────────────────────────────────────────────────────────────────

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

const CHANNEL_LIST = ['E-posta'];

// ─── Toggle checkbox grid ──────────────────────────────────────────────────────

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
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
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

// ─── Main drawer ──────────────────────────────────────────────────────────────

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
  // ── Address state ──────────────────────────────────────────────────────────
  const [aCompany, setACompany]     = useState('');
  const [aAddrLines, setAAddrLines] = useState('');
  const [aCity, setACity]           = useState('');
  const [aCountry, setACountry]     = useState('');
  const [aTaxNo, setATaxNo]         = useState('');

  // ── Domain state ───────────────────────────────────────────────────────────
  const [dDomain, setDDomain]       = useState('');
  const [dMatch, setDMatch]         = useState<'active' | 'passive'>('active');
  const [dNote, setDNote]           = useState('');

  // ── Mail state ─────────────────────────────────────────────────────────────
  const [mEmail, setMEmail]         = useState('');
  const [mDomain, setMDomain]       = useState('');
  const [mOwner, setMOwner]         = useState('');
  const [mMatch, setMMatch]         = useState<'active' | 'passive'>('active');
  const [mProcesses, setMProcesses] = useState<string[]>([]);
  const [mStatus, setMStatus]       = useState<'active' | 'passive'>('active');

  // ── Doc rule state ─────────────────────────────────────────────────────────
  const [rTip, setRTip]             = useState('İhracat');
  const [rTas, setRTas]             = useState('Karayolu');
  const [rScenario, setRScenario]   = useState('');
  const [rDocs, setRDocs]           = useState<string[]>([]);
  const [rReminder, setRReminder]   = useState<'Otomatik' | 'Kontrollü' | 'Manuel'>('Otomatik');
  const [rFreq, setRFreq]           = useState('Her 2 saatte bir');
  const [rStatus, setRStatus]       = useState<'Aktif' | 'Pasif'>('Aktif');

  // ── Notify rule state ──────────────────────────────────────────────────────
  const [nProcess, setNProcess]     = useState(NOTIFY_PROCESS_LIST[0]);
  const [nMode, setNMode]           = useState<'Otomatik' | 'Kontrollü' | 'Manuel' | 'Kapalı'>('Otomatik');
  const [nChannels, setNChannels]   = useState<string[]>(['E-posta']);
  const [nRecipient, setNRecipient] = useState('Mail tanımlarından');
  const [nApproval, setNApproval]   = useState(false);
  const [nStatus, setNStatus]       = useState<'Aktif' | 'Pasif'>('Aktif');

  // Populate from initial values when drawer opens
  useEffect(() => {
    if (!open) return;
    if (mode === 'addr' && initialAddress) {
      setACompany(initialAddress.company);
      setAAddrLines(initialAddress.addressLines);
      setACity(initialAddress.city);
      setACountry(initialAddress.country);
      setATaxNo(initialAddress.taxNo);
    } else if (mode === 'addr') {
      setACompany(''); setAAddrLines(''); setACity(''); setACountry(''); setATaxNo('');
    }
    if (mode === 'domain' && initialDomain) {
      setDDomain(initialDomain.domain); setDMatch(initialDomain.matchStatus); setDNote(initialDomain.note);
    } else if (mode === 'domain') {
      setDDomain(''); setDMatch('active'); setDNote('');
    }
    if (mode === 'mail' && initialMail) {
      setMEmail(initialMail.email); setMDomain(initialMail.domain); setMOwner(initialMail.owner);
      setMMatch(initialMail.matchStatus); setMProcesses(initialMail.notificationProcesses); setMStatus(initialMail.status);
    } else if (mode === 'mail') {
      setMEmail(''); setMDomain(''); setMOwner(''); setMMatch('active'); setMProcesses([]); setMStatus('active');
    }
    if (mode === 'rule' && initialRule) {
      setRTip(initialRule.transactionType); setRTas(initialRule.transportMode); setRScenario(initialRule.scenario);
      setRDocs(initialRule.requiredDocs); setRReminder(initialRule.reminderType); setRFreq(initialRule.frequency); setRStatus(initialRule.status);
    } else if (mode === 'rule') {
      setRTip('İhracat'); setRTas('Karayolu'); setRScenario(''); setRDocs([]); setRReminder('Otomatik'); setRFreq('Her 2 saatte bir'); setRStatus('Aktif');
    }
    if (mode === 'notify' && initialNotify) {
      setNProcess(initialNotify.process); setNMode(initialNotify.workingMode); setNChannels(initialNotify.channels);
      setNRecipient(initialNotify.recipientRule); setNApproval(initialNotify.requiresApproval); setNStatus(initialNotify.status);
    } else if (mode === 'notify') {
      setNProcess(NOTIFY_PROCESS_LIST[0]); setNMode('Otomatik'); setNChannels(['E-posta']);
      setNRecipient('Mail tanımlarından'); setNApproval(false); setNStatus('Aktif');
    }
  }, [open, mode, initialAddress, initialDomain, initialMail, initialRule, initialNotify]);

  function handleSave() {
    if (mode === 'addr') {
      onSave({ mode: 'addr', data: { company: aCompany, addressLines: aAddrLines, city: aCity, country: aCountry, taxNo: aTaxNo, evrimStatus: 'local', changed: true } });
    } else if (mode === 'domain') {
      onSave({ mode: 'domain', data: { domain: dDomain, matchStatus: dMatch, note: dNote } });
    } else if (mode === 'mail') {
      onSave({ mode: 'mail', data: { email: mEmail, domain: mDomain, owner: mOwner, matchStatus: mMatch, notificationProcesses: mProcesses, status: mStatus } });
    } else if (mode === 'rule') {
      onSave({ mode: 'rule', data: { transactionType: rTip, transportMode: rTas, scenario: rScenario, requiredDocs: rDocs, reminderType: rReminder, frequency: rFreq, status: rStatus } });
    } else if (mode === 'notify') {
      onSave({ mode: 'notify', data: { process: nProcess, workingMode: nMode, channels: ['E-posta'], recipientRule: nRecipient, requiresApproval: nApproval, status: nStatus } });
    }
  }

  const titleMap: Record<DrawerMode, string> = {
    addr:   initialAddress ? 'Adresi Düzenle'         : 'Yeni Adres',
    domain: initialDomain  ? 'Domain Düzenle'         : 'Yeni Mail Domain',
    mail:   initialMail    ? 'Mail Tanımı Düzenle'    : 'Yeni Mail Tanımı',
    rule:   initialRule    ? 'Evrak Kuralı Düzenle'   : 'Yeni Evrak Kuralı',
    notify: initialNotify  ? 'Bildirim Kuralı Düzenle': 'Yeni Bildirim Kuralı',
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
          <Button variant="primary" onClick={handleSave}>Kaydet</Button>
        </>
      }
    >
      {/* ── ADDRESS ── */}
      {mode === 'addr' && (
        <div className="space-y-4">
          <Field label="Firma Ünvanı" htmlFor="a-company">
            <Input id="a-company" value={aCompany} onChange={(e) => setACompany(e.target.value)} />
          </Field>
          <Field label="Adres Satırları" htmlFor="a-addr">
            <Textarea id="a-addr" value={aAddrLines} onChange={(e) => setAAddrLines(e.target.value)} rows={3} placeholder="Her satır ayrı" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Şehir / Bölge" htmlFor="a-city">
              <Input id="a-city" value={aCity} onChange={(e) => setACity(e.target.value)} />
            </Field>
            <Field label="Ülke" htmlFor="a-country">
              <Input id="a-country" value={aCountry} onChange={(e) => setACountry(e.target.value)} />
            </Field>
          </div>
          <Field label="VKN / Tax No" htmlFor="a-taxno">
            <Input id="a-taxno" value={aTaxNo} onChange={(e) => setATaxNo(e.target.value)} className="font-mono" />
          </Field>
        </div>
      )}

      {/* ── DOMAIN ── */}
      {mode === 'domain' && (
        <div className="space-y-4">
          <Field label="Mail Domain / Uzantısı" htmlFor="d-domain">
            <Input id="d-domain" value={dDomain} onChange={(e) => setDDomain(e.target.value)} placeholder="@firma.com" />
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

      {/* ── MAIL ── */}
      {mode === 'mail' && (
        <div className="space-y-4">
          <Field label="Mail Adresi" htmlFor="m-email">
            <Input id="m-email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder="ad@firma.com" />
          </Field>
          <Field label="Mail Domain" htmlFor="m-domain">
            <Input id="m-domain" value={mDomain} onChange={(e) => setMDomain(e.target.value)} placeholder="@firma.com" className="font-mono" />
          </Field>
          <Field label="Kişi / Birim" htmlFor="m-owner">
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
          <Field label="Bildirim Alacağı Süreçler">
            <CheckGrid items={NOTIFICATION_PROCESS_LIST} selected={mProcesses} onChange={setMProcesses} cols={2} />
          </Field>
        </div>
      )}

      {/* ── DOCUMENT RULE ── */}
      {mode === 'rule' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="İşlem Tipi" htmlFor="r-tip">
              <Select id="r-tip" value={rTip} onChange={(e) => setRTip(e.target.value)}>
                <option>İhracat</option>
                <option>İthalat</option>
                <option>Transit</option>
                <option>Antrepo</option>
              </Select>
            </Field>
            <Field label="Taşıma Şekli" htmlFor="r-tas">
              <Select id="r-tas" value={rTas} onChange={(e) => setRTas(e.target.value)}>
                <option>Karayolu</option>
                <option>Denizyolu</option>
                <option>Havayolu</option>
              </Select>
            </Field>
          </div>
          <Field label="Senaryo / Koşul" htmlFor="r-scenario">
            <Input id="r-scenario" value={rScenario} onChange={(e) => setRScenario(e.target.value)} placeholder="Ör. Standart ihracat, bildirimli işlem" />
          </Field>
          <Field label="Gerekli Evraklar" hint="Fatura her zaman zorunludur; buradan seçilmese bile sisteme dahildir.">
            <div className="mt-1">
              <CheckGrid items={DOCUMENT_LIST} selected={rDocs} onChange={setRDocs} cols={2} />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hatırlatma Tipi" htmlFor="r-reminder">
              <Select
                id="r-reminder"
                value={rReminder}
                onChange={(e) => setRReminder(e.target.value as typeof rReminder)}
              >
                <option>Otomatik</option>
                <option>Kontrollü</option>
                <option>Manuel</option>
              </Select>
            </Field>
            <Field label="Sıklık" htmlFor="r-freq">
              <Select id="r-freq" value={rFreq} onChange={(e) => setRFreq(e.target.value)}>
                <option>Her 2 saatte bir</option>
                <option>Günde 1 kez</option>
                <option>Günde 2 kez</option>
                <option>Cut-off'a göre dinamik</option>
                <option>Manuel takip</option>
              </Select>
            </Field>
          </div>
          <Field label="Durum" htmlFor="r-status">
            <Select id="r-status" value={rStatus} onChange={(e) => setRStatus(e.target.value as 'Aktif' | 'Pasif')}>
              <option>Aktif</option>
              <option>Pasif</option>
            </Select>
          </Field>
        </div>
      )}

      {/* ── NOTIFICATION RULE ── */}
      {mode === 'notify' && (
        <div className="space-y-4">
          <Field label="İşlem / Bildirim Süreci" htmlFor="n-process">
            <Select id="n-process" value={nProcess} onChange={(e) => setNProcess(e.target.value)}>
              {NOTIFY_PROCESS_LIST.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Çalışma Şekli" htmlFor="n-mode" hint="Otomatik: sistem tetikler · Kontrollü: operatör onaylar · Manuel: operatör gönderir · Kapalı: bildirim gitmez">
            <Select id="n-mode" value={nMode} onChange={(e) => setNMode(e.target.value as typeof nMode)}>
              <option>Otomatik</option>
              <option>Kontrollü</option>
              <option>Manuel</option>
              <option>Kapalı</option>
            </Select>
          </Field>
        <Field label="Bildirim Kanalı">
          <div className="mt-1">
            <div className="flex items-center gap-2 text-[13px] font-medium px-2.5 py-2 border rounded-[7px] border-accent bg-accent-tint text-accent w-fit">
              <span className="w-[15px] h-[15px] rounded-[4px] border border-accent bg-accent flex items-center justify-center shrink-0">
                <Check size={10} strokeWidth={3} className="text-white" />
              </span>
              E-posta
            </div>
          </div>
        </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alıcı Kuralı" htmlFor="n-recipient">
              <Select id="n-recipient" value={nRecipient} onChange={(e) => setNRecipient(e.target.value)}>
                <option>Mail tanımlarından</option>
                <option>Domain eşleşmesine göre</option>
                <option>Operatör seçer</option>
                <option>— (göndermez)</option>
              </Select>
            </Field>
            <Field label="Onay Gerekir mi?" htmlFor="n-approval">
              <Select
                id="n-approval"
                value={nApproval ? 'Evet' : 'Hayır'}
                onChange={(e) => setNApproval(e.target.value === 'Evet')}
              >
                <option>Hayır</option>
                <option>Evet</option>
              </Select>
            </Field>
          </div>
          <Field label="Durum" htmlFor="n-status">
            <Select id="n-status" value={nStatus} onChange={(e) => setNStatus(e.target.value as 'Aktif' | 'Pasif')}>
              <option>Aktif</option>
              <option>Pasif</option>
            </Select>
          </Field>
        </div>
      )}
    </Drawer>
  );
}
