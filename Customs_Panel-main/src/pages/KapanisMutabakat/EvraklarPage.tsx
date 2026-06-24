import { useEffect, useState } from 'react';
import {
  RefreshCw, X, Download, Mail, Send, Eye, CheckCheck, Loader2,
} from 'lucide-react';
import type { KapanicFile, KapanicDoc, KapanicCostItem, KapanicPageStats } from '../../types';
import { kapanisService } from '../../services/declarations';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { Field, Input, Textarea } from '../../components/ui/Fields';
import { useToast } from '../../components/ui/Toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusPillVariant(status: KapanicFile['status']): 'ok' | 'warn' | 'gray' | 'accent' {
  switch (status) {
    case 'mutabakat-hazir':  return 'ok';
    case 'kontrol-bekliyor': return 'warn';
    case 'maliyet-bekliyor': return 'warn';
    case 'kapandi':          return 'gray';
  }
}

function statusLabel(status: KapanicFile['status']): string {
  switch (status) {
    case 'kontrol-bekliyor': return 'Kontrol Bekliyor';
    case 'mutabakat-hazir':  return 'Mutabakat Hazır';
    case 'maliyet-bekliyor': return 'Maliyet Bekliyor';
    case 'kapandi':          return 'Kapandı';
  }
}

// ─── Document card ────────────────────────────────────────────────────────────

function DocCard({ doc, selected, onSelect, onView, onDownload }: {
  doc: KapanicDoc;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onDownload: () => void;
}) {
  const isReady = doc.status === 'Var';
  return (
    <div
      onClick={onSelect}
      className={[
        'flex flex-col rounded-xl border p-4 cursor-pointer transition-colors',
        selected
          ? 'border-accent bg-accent-tint'
          : 'border-line-strong bg-surface hover:bg-surface-2',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[13.5px] font-bold text-text-strong leading-snug">{doc.name}</span>
        {doc.required && <Pill variant="accent">Zorunlu</Pill>}
      </div>
      <div className="text-[12px] text-muted space-y-1 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Durum:</span>
          <Pill variant={isReady ? 'ok' : 'warn'}>{doc.status}</Pill>
        </div>
        <div><span className="font-semibold">Format:</span> <span className="text-text font-medium">{doc.format}</span></div>
        <div><span className="font-semibold">Son işlem:</span> <span className="text-text font-medium">{doc.date}</span></div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="mini" icon={Eye} onClick={(e) => { e.stopPropagation(); onView(); }}>Görüntüle</Button>
        <Button size="mini" icon={Download} onClick={(e) => { e.stopPropagation(); onDownload(); }}>İndir</Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KapanicEvraklarPage() {
  const { toast } = useToast();

  const [loading,       setLoading]       = useState(true);
  const [files,         setFiles]         = useState<KapanicFile[]>([]);
  const [docs,          setDocs]          = useState<KapanicDoc[]>([]);
  const [costs,         setCosts]         = useState<KapanicCostItem[]>([]);
  const [stats,         setStats]         = useState<KapanicPageStats | null>(null);
  const [selectedId,    setSelectedId]    = useState<string>('kap-001');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [mailOpen,      setMailOpen]      = useState(false);

  const [mailTo,      setMailTo]      = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody,    setMailBody]    = useState('');

  useEffect(() => {
    Promise.all([
      kapanisService.getFiles(),
      kapanisService.getDocs(),
      kapanisService.getCosts(),
      kapanisService.getStats(),
    ]).then(([f, d, c, s]) => {
      setFiles(f);
      setDocs(d);
      setCosts(c);
      setStats(s);
      setLoading(false);
    });
  }, []);

  const selected = files.find((f) => f.id === selectedId) ?? null;

  function handleSelectFile(file: KapanicFile) {
    setSelectedId(file.id);
    setSelectedDocId(null);
    setMailTo(file.mailRecipient);
    setMailSubject(file.mailSubject);
    setMailBody(file.mailBody);
    toast(`${file.ref} seçildi`);
  }

  useEffect(() => {
    if (!selected) return;
    setMailTo(selected.mailRecipient);
    setMailSubject(selected.mailSubject);
    setMailBody(selected.mailBody);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-[13px]">Yükleniyor…</span>
      </div>
    );
  }

  const totalCost = '987.659,44 TL';

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
            Evraklar ve Beyanname Maliyetleri
          </h1>
          <p className="text-[12.5px] text-muted mt-1 max-w-[600px]">
            Kapanış aşamasındaki evrak durumları, müşteri belgesi teslimi ve maliyet kalemleri.
          </p>
        </div>
        <Button variant="default" icon={RefreshCw} onClick={() => toast('Kontroller yenilendi')}>
          Yenile
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.waiting}     label="Kapanış bekleyen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.uploaded}    label="Evrak yüklenen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.reconciled}  label="Mutabakat hazır" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-green)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.warnings}    label="Kontrol uyarısı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-red)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.costPending} label="Maliyet bekleyen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Master-detail layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '288px 1fr' }}>
        {/* Left: file list */}
        <Card className="self-start">
          <CardHead title="Beyannameler" sub="Kapanış aşamasındaki dosyalar" />
          <div>
            {files.map((f) => (
              <div
                key={f.id}
                onClick={() => handleSelectFile(f)}
                className={[
                  'px-4 py-3.5 border-b border-line last:border-0 cursor-pointer transition-colors hover:bg-surface-2',
                  f.id === selectedId ? 'bg-accent-tint' : '',
                ].join(' ')}
              >
                <div className="text-[13.5px] font-bold text-text-strong">{f.ref}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{f.customer}</div>
                <div className="mt-2">
                  <Pill variant={statusPillVariant(f.status)}>{statusLabel(f.status)}</Pill>
                </div>
                <div className="text-[11.5px] text-muted-2 font-mono mt-1.5">{f.tescilNo}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Right: detail */}
        {selected && (
          <div className="space-y-4">
            {/* File summary */}
            <Card>
              <CardHead
                title={`${selected.ref} · Dosya Özeti`}
                sub={`${selected.tescilNo} · ${selected.customer}`}
                actions={
                  <Pill variant={statusPillVariant(selected.status)}>
                    {statusLabel(selected.status)}
                  </Pill>
                }
              />
              <CardBody>
                <div className="bg-surface-2 border border-line rounded-xl px-3.5">
                  {[
                    { label: 'Beyanname No',   value: selected.tescilNo,      mono: true  },
                    { label: 'Müşteri',         value: selected.customer,      mono: false },
                    { label: 'Tescil Durumu',   value: selected.tescilDurumu,  pill: 'ok'   as const },
                    { label: 'Kapanış Durumu',  value: selected.kapanicDurumu, pill: selected.status === 'kapandi' ? 'gray' as const : 'warn' as const },
                  ].map(({ label, value, mono, pill }) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-b-0">
                      <span className="text-[12.5px] font-semibold text-muted shrink-0">{label}</span>
                      {pill ? (
                        <Pill variant={pill}>{value}</Pill>
                      ) : (
                        <span className={`text-[12.5px] font-medium text-text-strong text-right ${mono ? 'font-mono' : ''}`}>
                          {value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* ── Evraklar section ── */}
            <Card>
              <CardHead title="Evraklar" sub="Kapanış için gerekli belgeler" />
              <CardBody>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {docs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      selected={selectedDocId === doc.id}
                      onSelect={() => setSelectedDocId(doc.id)}
                      onView={() => toast(`${doc.name} görüntüleniyor`)}
                      onDownload={() => toast('Evrak indiriliyor')}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button icon={Download} onClick={() => toast('Tüm evraklar ZIP olarak indiriliyor')}>
                    Tüm Evrakları Toplu İndir
                  </Button>
                  <Button variant="blue" icon={Mail} onClick={() => setMailOpen(true)}>
                    Evrakları Müşteriye Mail At
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* ── Beyanname Maliyetleri section ── */}
            <Card>
              <CardHead title="Beyanname Maliyetleri" sub="Bu beyanname kapsamında oluşan maliyet kalemleri" />
              <CardBody>
                <div className="border border-line rounded-xl overflow-hidden mb-4">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Maliyet Kalemi</Th>
                        <Th>Tutar</Th>
                        <Th>Para Birimi</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map((c) => (
                        <Tr key={c.id}>
                          <Td className="font-semibold text-text-strong">{c.label}</Td>
                          <Td className="font-mono">{c.amount}</Td>
                          <Td>{c.currency}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <div className="bg-surface-2 border border-line rounded-xl px-4 py-3.5 mb-4">
                  <div className="text-[20px] font-extrabold text-text-strong">{totalCost}</div>
                  <div className="text-[11.5px] text-muted font-semibold mt-1">Toplam maliyet</div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button icon={Download} onClick={() => toast('Maliyet dökümü indiriliyor')}>
                    Maliyet Dökümünü İndir
                  </Button>
                  <Button variant="primary" icon={Send} onClick={() => toast('Maliyet mutabakata gönderildi')}>
                    Mutabakata Gönder
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      {/* Customer mail modal */}
      <Modal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title="Müşteriye Evrak Maili"
        footer={
          <>
            <Button onClick={() => setMailOpen(false)} icon={X}>Vazgeç</Button>
            <Button
              variant="primary"
              icon={Send}
              onClick={() => {
                setMailOpen(false);
                toast('Evrak maili müşteriye gönderildi');
              }}
            >
              Mail Gönder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Alıcı" htmlFor="mail-to">
            <Input id="mail-to" value={mailTo} onChange={(e) => setMailTo(e.target.value)} />
          </Field>
          <Field label="Konu" htmlFor="mail-subject">
            <Input id="mail-subject" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
          </Field>
          <Field label="Mesaj" htmlFor="mail-body">
            <Textarea id="mail-body" rows={6} value={mailBody} onChange={(e) => setMailBody(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
