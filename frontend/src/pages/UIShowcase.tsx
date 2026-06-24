import { useState } from 'react';
import { Plus, Download, Trash2, FileText, Settings, AlertTriangle } from 'lucide-react';

import Pill from '../components/ui/Pill';
import Button from '../components/ui/Button';
import { Card, CardHead, CardBody } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Tabs from '../components/ui/Tabs';
import Drawer from '../components/ui/Drawer';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { Table, Th, Td, Tr } from '../components/ui/Table';
import { Field, Input, Select, Textarea } from '../components/ui/Fields';
import Note from '../components/ui/Note';
import UploadBox from '../components/ui/UploadBox';
import Timeline from '../components/ui/Timeline';
import LineCard from '../components/ui/LineCard';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted">{title}</h2>
        <div className="flex-1 h-px bg-line" />
      </div>
      {children}
    </section>
  );
}

function Row({ children, wrap = false }: { children: React.ReactNode; wrap?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${wrap ? 'flex-wrap' : ''}`}>
      {children}
    </div>
  );
}

const TABS_DEF = [
  { key: 'overview', label: 'Genel Bakış', icon: FileText },
  { key: 'details', label: 'Detaylar', icon: Settings },
  { key: 'history', label: 'Geçmiş' },
];

const TIMELINE_EVENTS = [
  { title: 'Dosya açıldı', meta: '10 May 2024 · 08:00', state: 'done' as const },
  { title: 'Evraklar yüklendi', meta: '10 May 2024 · 09:30', state: 'done' as const },
  { title: 'Beyanname yazıldı', meta: '11 May 2024 · 14:20', state: 'done' as const },
  { title: 'Tescil bekleniyor', meta: 'Bekleniyor', state: 'wait' as const },
  { title: 'Kapanış', meta: 'Henüz başlamadı', state: 'default' as const },
];

export default function UIShowcase() {
  const [activeTab, setActiveTab] = useState('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-16">
      {/* Header */}
      <div className="border-b border-line pb-6">
        <p className="text-[11px] font-mono text-accent uppercase tracking-widest mb-1">DEV ONLY · /__ui</p>
        <h1 className="text-[24px] font-semibold text-text-strong">UI Component Showcase</h1>
        <p className="text-muted text-[13px] mt-1">All Stage 2 primitives. Not included in production builds.</p>
      </div>

      {/* ── Pill ─────────────────────────────────────────────────────── */}
      <Section title="Pill">
        <Row wrap>
          <Pill variant="ok">Tamamlandı</Pill>
          <Pill variant="warn">Beklemede</Pill>
          <Pill variant="red">Kırmızı Hat</Pill>
          <Pill variant="yellow">Sarı Hat</Pill>
          <Pill variant="blue">Mavi Hat</Pill>
          <Pill variant="green">Yeşil Hat</Pill>
          <Pill variant="accent">Tescilli</Pill>
          <Pill variant="gray">Pasif</Pill>
        </Row>
      </Section>

      {/* ── Button ───────────────────────────────────────────────────── */}
      <Section title="Button">
        <div className="space-y-3">
          <Row wrap>
            <Button>Varsayılan</Button>
            <Button variant="primary" icon={Plus}>Yeni Dosya</Button>
            <Button variant="blue" icon={Download}>İndir</Button>
            <Button variant="warn" icon={AlertTriangle}>Uyarı</Button>
            <Button variant="danger" icon={Trash2}>Sil</Button>
          </Row>
          <Row wrap>
            <Button size="sm">Small</Button>
            <Button size="sm" variant="primary" icon={Plus}>Small Primary</Button>
            <Button size="mini">Mini</Button>
            <Button size="mini" variant="primary">Mini Primary</Button>
          </Row>
          <Row wrap>
            <Button disabled>Devre Dışı</Button>
            <Button variant="primary" disabled>Devre Dışı Primary</Button>
          </Row>
        </div>
      </Section>

      {/* ── Card ─────────────────────────────────────────────────────── */}
      <Section title="Card / CardHead / CardBody">
        <Card>
          <CardHead
            title="Beyanname Detayları"
            sub="IHR-2024-001 · Anadolu Tekstil A.Ş."
            actions={<Button size="sm" variant="primary" icon={Plus}>Ekle</Button>}
          />
          <CardBody>
            <p className="text-muted text-[13px]">Kart içeriği buraya gelecek. Herhangi bir React node kabul edilir.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHead title="Başlık Only" />
          <CardBody className="bg-surface-2">
            <p className="text-muted text-[13px]">surface-2 arka plan ile CardBody.</p>
          </CardBody>
        </Card>
      </Section>

      {/* ── StatCard ─────────────────────────────────────────────────── */}
      <Section title="StatCard">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard value={42} label="Açık Dosya" />
          <StatCard value="₺1.2M" label="Toplam Maliyet" />
          <StatCard value={7} label="Bekleyen Evrak" />
          <StatCard value="98%" label="Tamamlanma Oranı" />
        </div>
      </Section>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Section title="Tabs">
        <Tabs tabs={TABS_DEF} active={activeTab} onChange={setActiveTab} />
        <div className="px-1 pt-3 text-[13px] text-muted">
          Aktif sekme: <strong className="text-text-strong">{activeTab}</strong>
        </div>
      </Section>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <Section title="Table">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Referans</Th>
                <Th>Müşteri</Th>
                <Th>Durum</Th>
                <Th>Tarih</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td><span className="font-mono text-[12px]">IHR-2024-001</span></Td>
                <Td>Anadolu Tekstil A.Ş.</Td>
                <Td><Pill variant="accent">Tescilli</Pill></Td>
                <Td className="text-muted">10 May 2024</Td>
              </Tr>
              <Tr>
                <Td><span className="font-mono text-[12px]">IHR-2024-002</span></Td>
                <Td>Marmara Makine Ltd.</Td>
                <Td><Pill variant="warn">Evrak Hazırlık</Pill></Td>
                <Td className="text-muted">11 May 2024</Td>
              </Tr>
              <Tr onClick={() => toast('Satıra tıklandı: IHR-2024-003')}>
                <Td><span className="font-mono text-[12px]">IHR-2024-003</span></Td>
                <Td>Karadeniz Gıda San.</Td>
                <Td><Pill variant="ok">Kapalı</Pill></Td>
                <Td className="text-muted">08 May 2024</Td>
              </Tr>
            </tbody>
          </Table>
        </Card>
      </Section>

      {/* ── Fields ───────────────────────────────────────────────────── */}
      <Section title="Field / Input / Select / Textarea">
        <Card>
          <CardBody className="space-y-4 max-w-md">
            <Field label="Referans No" htmlFor="ref" required hint="Otomatik atanır">
              <Input id="ref" placeholder="IHR-2024-001" />
            </Field>
            <Field label="Müşteri" htmlFor="cust">
              <Select id="cust">
                <option value="">Müşteri seçin…</option>
                <option>Anadolu Tekstil A.Ş.</option>
                <option>Marmara Makine Ltd.</option>
              </Select>
            </Field>
            <Field label="Notlar" htmlFor="notes" error="Bu alan zorunludur">
              <Textarea id="notes" placeholder="Açıklama girin…" />
            </Field>
            <Field label="Devre dışı" htmlFor="dis">
              <Input id="dis" value="Değiştirilemez" disabled readOnly />
            </Field>
          </CardBody>
        </Card>
      </Section>

      {/* ── Note ─────────────────────────────────────────────────────── */}
      <Section title="Note">
        <div className="space-y-2">
          <Note variant="info">Beyanname tescil işlemi için tüm evrakların eksiksiz olması gerekmektedir.</Note>
          <Note variant="warn">Bu işlem geri alınamaz. Devam etmeden önce kontrol edin.</Note>
          <Note variant="ok">Tüm evraklar onaylandı. Beyanname tescile hazır.</Note>
        </div>
      </Section>

      {/* ── UploadBox ────────────────────────────────────────────────── */}
      <Section title="UploadBox">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-muted mb-2">Tekli</p>
            <UploadBox onFiles={(files) => toast(`Yüklendi: ${files[0]?.name}`)} />
          </div>
          <div>
            <p className="text-[11px] text-muted mb-2">Çoklu</p>
            <UploadBox
              title="Birden fazla dosya seçin"
              hint="Sürükle-bırak desteklenir"
              multiple
              onFiles={(files) => toast(`${files.length} dosya seçildi`)}
            />
          </div>
        </div>
      </Section>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <Section title="Timeline">
        <Card>
          <CardBody>
            <Timeline events={TIMELINE_EVENTS} />
          </CardBody>
        </Card>
      </Section>

      {/* ── LineCard ─────────────────────────────────────────────────── */}
      <Section title="LineCard">
        <div className="space-y-3">
          <p className="text-[11px] text-muted">Aktif</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <LineCard line="Kırmızı" active label="Kırmızı Hat" />
            <LineCard line="Sarı" active label="Sarı Hat" />
            <LineCard line="Mavi" active label="Mavi Hat" />
            <LineCard line="Yeşil" active label="Yeşil Hat" />
          </div>
          <p className="text-[11px] text-muted">Pasif</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <LineCard line="Kırmızı" active={false} label="Kırmızı Hat" />
            <LineCard line="Sarı" active={false} label="Sarı Hat" />
            <LineCard line="Mavi" active={false} label="Mavi Hat" />
            <LineCard line="Yeşil" active={false} label="Yeşil Hat" />
          </div>
        </div>
      </Section>

      {/* ── Drawer ───────────────────────────────────────────────────── */}
      <Section title="Drawer">
        <Row>
          <Button onClick={() => setDrawerOpen(true)}>Drawer Aç</Button>
        </Row>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Dosya Detayları"
          subtitle="IHR-2024-001 · Anadolu Tekstil A.Ş."
          footer={
            <>
              <Button onClick={() => setDrawerOpen(false)}>İptal</Button>
              <Button variant="primary" onClick={() => { setDrawerOpen(false); toast('Kaydedildi'); }}>
                Kaydet
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Note variant="info">Bu bir sağdan açılan Drawer bileşenidir. ESC tuşu veya arka plana tıklayarak kapatılabilir.</Note>
            <Timeline events={TIMELINE_EVENTS} />
          </div>
        </Drawer>
      </Section>

      {/* ── Modal ────────────────────────────────────────────────────── */}
      <Section title="Modal">
        <Row>
          <Button onClick={() => setModalOpen(true)}>Modal Aç</Button>
        </Row>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Dosyayı Sil"
          footer={
            <>
              <Button onClick={() => setModalOpen(false)}>İptal</Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={() => { setModalOpen(false); toast('Dosya silindi'); }}
              >
                Sil
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Note variant="warn">Bu işlem geri alınamaz. IHR-2024-001 referanslı dosya kalıcı olarak silinecektir.</Note>
            <p className="text-[13px] text-muted">Devam etmek istediğinizden emin misiniz?</p>
          </div>
        </Modal>
      </Section>

      {/* ── Toast ────────────────────────────────────────────────────── */}
      <Section title="Toast">
        <Row wrap>
          <Button onClick={() => toast('İşlem başarıyla tamamlandı.')}>Toast Göster</Button>
          <Button onClick={() => toast('Beyanname tescil edildi: 24IHR000123')}>Toast (uzun mesaj)</Button>
          <Button onClick={() => { toast('1. mesaj'); setTimeout(() => toast('2. mesaj'), 400); }}>
            Çoklu Toast
          </Button>
        </Row>
      </Section>
    </div>
  );
}
