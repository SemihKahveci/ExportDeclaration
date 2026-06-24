import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, AlertTriangle, Truck, Ship, Plane, Search, X } from 'lucide-react';
import type { BeyannameListeItem, BeyannameRecord, MtKontrolMapping, TransportMode } from '../../types';
import { beyannameService, beyannameListeService } from '../../services/declarations';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import ApprovalTab from './ApprovalTab';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRANSPORT_LABELS: Record<TransportMode, string> = {
  karayolu:  'Karayolu',
  denizyolu: 'Denizyolu',
  havayolu:  'Havayolu',
};

function TransportIcon({ mode }: { mode: TransportMode | null }) {
  if (mode === 'karayolu')  return <Truck size={12} className="text-muted-2" strokeWidth={1.75} />;
  if (mode === 'denizyolu') return <Ship  size={12} className="text-muted-2" strokeWidth={1.75} />;
  if (mode === 'havayolu')  return <Plane size={12} className="text-muted-2" strokeWidth={1.75} />;
  return null;
}

type ApprovalOutcome = 'onaylandi' | 'geri-gonderildi';
type ApprovalStep    = 'first' | 'second';

// ─── Page ─────────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'detail';

export default function BeyannameOnayPage() {
  const { toast } = useToast();

  const [loading,    setLoading]    = useState(true);
  const [listeItems, setListeItems] = useState<BeyannameListeItem[]>([]);
  const [records,    setRecords]    = useState<BeyannameRecord[]>([]);
  const [mappings,   setMappings]   = useState<MtKontrolMapping[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [viewMode,   setViewMode]   = useState<ViewMode>('list');

  // Per-declaration approval outcome, step, and notes
  const [approvalOutcomes, setApprovalOutcomes] = useState<Record<string, ApprovalOutcome>>({});
  const [approvalSteps,    setApprovalSteps]    = useState<Record<string, ApprovalStep>>({});
  const [approvalNotes,    setApprovalNotes]    = useState<Record<string, string>>({});

  // List filters
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      beyannameListeService.getItems(),
      beyannameService.getRecords(),
      beyannameService.getMtKontrolMappings(),
    ]).then(([liste, recs, maps]) => {
      setListeItems(liste);
      setRecords(recs);
      setMappings(maps);
      setLoading(false);
    });
  }, []);

  // Only show items where MT Kontrol is completed (onaya-hazir) and not yet acted upon
  const pendingItems = listeItems.filter(
    (item) =>
      item.status === 'onaya-hazir' &&
      approvalOutcomes[item.id] === undefined
  );

  const filtered = pendingItems.filter((item) => {
    const q = search.toLowerCase();
    return !q || item.ref.toLowerCase().includes(q) || item.customer.toLowerCase().includes(q);
  });

  const selected     = records.find((r) => r.id === selectedId) ?? null;
  const selectedItem = listeItems.find((i) => {
    const rec = records.find((r) => r.id === selectedId);
    return rec && i.ref === rec.ref;
  }) ?? null;

  // Mock: alternate requiresSecondApproval by record index
  const selectedIndex          = records.findIndex((r) => r.id === selectedId);
  const requiresSecondApproval = selectedIndex % 2 === 0;
  const approvalStep           = selectedId ? (approvalSteps[selectedId] ?? 'first') : 'first';

  // Stats
  const hazirCount     = pendingItems.length;
  const onaylandiCount = Object.values(approvalOutcomes).filter((s) => s === 'onaylandi').length;
  const geriCount      = Object.values(approvalOutcomes).filter((s) => s === 'geri-gonderildi').length;
  const toplamCount    = listeItems.filter((i) => i.status === 'onaya-hazir').length;

  function openDetail(item: BeyannameListeItem) {
    const match = records.find((r) => r.ref === item.ref) ?? records[0];
    if (match) setSelectedId(match.id);
    setViewMode('detail');
  }

  function handleSendToSecondApproval() {
    if (!selectedId) return;
    setApprovalSteps((prev) => ({ ...prev, [selectedId]: 'second' }));
    toast('Beyanname 2. onaya gönderildi');
  }

  function handleApproveAndSendToTescil() {
    if (!selectedItem) return;
    setApprovalOutcomes((prev) => ({ ...prev, [selectedItem.id]: 'onaylandi' }));
    toast('Beyanname onaylandı ve tescile gönderildi');
    setViewMode('list');
  }

  function handleGeriGonder() {
    if (!selectedItem) return;
    setApprovalOutcomes((prev) => ({ ...prev, [selectedItem.id]: 'geri-gonderildi' }));
    toast('Beyanname MT kontrole geri gönderildi');
    setViewMode('list');
  }

  function handleNotEkle(note: string) {
    if (!selectedItem) return;
    setApprovalNotes((prev) => ({ ...prev, [selectedItem.id]: note }));
    toast('Not kaydedildi');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-[13px]">Yükleniyor…</span>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className="px-7 pt-4 pb-6 flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
              Beyanname Onay
            </h1>
            <p className="text-[12.5px] text-muted mt-1">
              MT kontrolü tamamlanan beyannameleri kontrol edin ve onaylayın.
            </p>
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="relative overflow-hidden">
            <StatCard value={toplamCount}    label="MT Kontrol Tamamlanan" />
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
          </div>
          <div className="relative overflow-hidden">
            <StatCard value={hazirCount}     label="Onay Bekleyen" />
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
          </div>
          <div className="relative overflow-hidden">
            <StatCard value={onaylandiCount} label="Onaylanan" />
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
          </div>
          <div className="relative overflow-hidden">
            <StatCard value={geriCount}      label="Geri Gönderilen" />
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-red)' }} />
          </div>
        </div>

        {/* Table card */}
        <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="border-b border-line bg-surface-2">
            <div className="flex items-center justify-between px-5 py-3.5">
              <div>
                <span className="text-[13.5px] font-bold text-text-strong">Onay Bekleyen Beyannameler</span>
                <span className="ml-2 text-[11.5px] text-muted">
                  {filtered.length !== pendingItems.length
                    ? `${filtered.length} / ${pendingItems.length} kayıt`
                    : `${pendingItems.length} kayıt`}
                  {' · '}MT kontrolü tamamlanmış
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-5 pb-3">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2 pointer-events-none" strokeWidth={2} />
                <input
                  type="text"
                  placeholder="Referans veya müşteri ara…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 pr-3 text-[12.5px] border border-line-strong bg-surface rounded-lg text-text placeholder:text-muted-2 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 w-52"
                />
              </div>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="h-8 px-3 text-[12px] font-medium text-muted hover:text-text border border-line rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <X size={12} strokeWidth={2} />
                  Temizle
                </button>
              )}
            </div>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Referans</Th>
                <Th>Müşteri</Th>
                <Th>İşlem</Th>
                <Th>Taşıma</Th>
                <Th>Evrak</Th>
                <Th>Statü</Th>
                <Th>İşlemler</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-surface-2 border border-line flex items-center justify-center">
                        <AlertTriangle size={18} strokeWidth={1.5} className="text-muted-2" />
                      </div>
                      <p className="text-[13px] font-semibold text-text-strong">
                        {search ? 'Filtrelerle eşleşen kayıt bulunamadı.' : 'Onay bekleyen beyanname yok.'}
                      </p>
                      <p className="text-[12px] text-muted">
                        {search ? 'Arama kriterlerini değiştirin.' : 'Tüm beyannameler onaylanmış veya geri gönderilmiş.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <Tr
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(item)}
                  >
                    <Td>
                      <div className="font-mono text-[13px] font-bold text-accent">{item.ref}</div>
                      <div className="text-[11px] text-muted mt-0.5">{item.date}</div>
                    </Td>
                    <Td>
                      <div className="text-[13px] font-medium text-text-strong">{item.customer}</div>
                      <div className="text-[11px] text-muted mt-0.5">{item.customerCity}</div>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-text">{item.islemTipi}</span>
                    </Td>
                    <Td>
                      {item.transportMode && (
                        <div className="flex items-center gap-1.5">
                          <TransportIcon mode={item.transportMode} />
                          <span className="text-[12.5px] text-text">{TRANSPORT_LABELS[item.transportMode]}</span>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[12.5px] font-medium text-text">{item.docCount}/{item.totalDocCount}</span>
                    </Td>
                    <Td>
                      <Pill variant="ok">Onaya Hazır</Pill>
                    </Td>
                    <Td>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="mini"
                          variant="primary"
                          onClick={() => openDetail(item)}
                        >
                          İncele
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  return (
    <div className="px-7 pt-4 pb-4 flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3 shrink-0">
        <div>
          <button
            onClick={() => setViewMode('list')}
            className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-accent transition-colors mb-1.5"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            <span>Onay Listesine Dön</span>
          </button>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
            Beyanname Onay
          </h1>
        </div>
        {selected && (
          <div className="mt-6">
            <Pill variant={approvalStep === 'second' ? 'warn' : 'ok'}>
              {approvalStep === 'second' ? '2. Onay Bekliyor' : '1. Onay Bekliyor'}
            </Pill>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-3 shrink-0">
        {selected ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={1}                       label="Seçili Kayıt" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={selected.docCount}       label="Gelen Evrak" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={selected.lateDocCount}   label="Sonradan Gelen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={2}                       label="Beyanname Sayfası" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--muted-2)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={selected.warningCount}   label="Kontrol Uyarısı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: selected.warningCount > 0 ? 'var(--warn)' : 'var(--ok)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Main content card */}
      {selected && (
        <Card className="flex flex-col min-h-0 flex-1">
          <CardHead
            title={`${selected.ref} · ${selected.customer}`}
            sub={`${selected.transportMode} · ${selected.lineItems.length} kalem · ${selected.rejim}`}
            actions={
              <Pill variant={approvalStep === 'second' ? 'warn' : 'ok'}>
                {approvalStep === 'second' ? '2. Onay Bekliyor' : '1. Onay Bekliyor'}
              </Pill>
            }
          />
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <ApprovalTab
              mappings={mappings}
              approvalNote={selectedItem ? (approvalNotes[selectedItem.id] ?? '') : ''}
              requiresSecondApproval={requiresSecondApproval}
              approvalStep={approvalStep}
              onSendToSecondApproval={handleSendToSecondApproval}
              onApproveAndSendToTescil={handleApproveAndSendToTescil}
              onGeriGonder={handleGeriGonder}
              onNotEkle={handleNotEkle}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
