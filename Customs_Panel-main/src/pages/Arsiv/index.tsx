import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Search, X, Loader2, FileText, CreditCard, Eye,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Download,
} from 'lucide-react';
import type { CustomsFile, ArchiveStats, OperationType } from '../../types';
import { filesService } from '../../services/files';
import { costsService } from '../../services/costs';
import { useCan } from '../../permissions/useCan';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Drawer from '../../components/ui/Drawer';

// ─── Config per operation type ────────────────────────────────────────────────

interface TypeConfig {
  label: string;
  icon: React.ReactNode;
  operationType: OperationType;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  ithalat: {
    label: 'İthalat',
    icon: <ArrowDownToLine size={18} strokeWidth={1.75} />,
    operationType: 'ithalat',
  },
  ihracat: {
    label: 'İhracat',
    icon: <ArrowUpFromLine size={18} strokeWidth={1.75} />,
    operationType: 'ihracat',
  },
  transit: {
    label: 'Transit',
    icon: <ArrowLeftRight size={18} strokeWidth={1.75} />,
    operationType: 'transit',
  },
};

// ─── Document definitions per operation type ──────────────────────────────────

interface ArchiveDoc {
  name: string;
  format: string;
  available: boolean;
}

function getDocsForFile(file: CustomsFile): ArchiveDoc[] {
  const base: ArchiveDoc[] = [
    { name: 'Beyanname',           format: 'PDF', available: true },
    { name: 'Beyanname Ekli Liste', format: 'PDF', available: true },
    { name: 'Fatura',              format: 'PDF', available: true },
    { name: 'Çeki Listesi',        format: 'PDF', available: file.missingDocuments.indexOf('Çeki Listesi') === -1 },
    { name: 'Teslim Tesellüm',     format: 'PDF', available: true },
    { name: 'Mühürlü Evraklar',    format: 'JPG', available: true },
  ];

  if (file.operationType === 'ithalat' || file.operationType === 'transit') {
    base.splice(4, 0, {
      name: 'CMR / Konşimento / AWB',
      format: 'PDF',
      available: file.missingDocuments.indexOf('CMR') === -1 && file.missingDocuments.indexOf('Konşimento') === -1,
    });
  }

  return base;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-surface-2 border border-line">
      <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</span>
      <span className="text-[13px] font-semibold text-text-strong leading-snug">{value}</span>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  file: CustomsFile;
  totalCost: string;
  docCount: number;
  onClose: () => void;
}

function DetailDrawer({ file, totalCost, docCount, onClose }: DetailDrawerProps) {
  const opLabel: Record<OperationType, string> = {
    ithalat: 'İthalat',
    ihracat: 'İhracat',
    transit: 'Transit',
    antrepo: 'Antrepo',
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={file.ref}
      subtitle="Arşivlenmiş dosya özeti"
      footer={<Button onClick={onClose}>Kapat</Button>}
    >
      <div className="space-y-4">
        {/* Primary grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <InfoRow label="Referans No"     value={<span className="font-mono">{file.ref}</span>} />
          <InfoRow label="Beyanname No"    value={<span className="font-mono">{file.declarationNo ?? '—'}</span>} />
          <InfoRow label="Müşteri"         value={file.customer} />
          <InfoRow label="İşlem Türü"      value={opLabel[file.operationType] ?? file.operationType} />
          <InfoRow label="Tescil Tarihi"   value={formatDate(file.receivedAt)} />
          <InfoRow label="Kapanış Tarihi"  value={formatDate(file.closedAt)} />
          <InfoRow label="Kapanış Durumu"  value={
            file.escalation
              ? <Pill variant="warn">Kontrol Uyarılı</Pill>
              : <Pill variant="ok">Eksiksiz</Pill>
          } />
          <InfoRow label="Sorumlu"         value={file.assignee?.name ?? '—'} />
          <InfoRow label="Toplam Maliyet"  value={totalCost || '—'} />
          <InfoRow label="Evrak Sayısı"    value={`${docCount} evrak`} />
        </div>

        {/* Escalation note */}
        {file.escalation && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-[12px]"
            style={{ background: 'var(--warn-tint)', borderColor: '#e8d0a2', color: '#7a5a16' }}
          >
            <span className="font-semibold">Kontrol Uyarısı:</span>
            <span>Kapanış sırasında eskalasyon işaretliydi.</span>
          </div>
        )}

        {/* Last activity */}
        <div className="p-3 rounded-lg bg-surface-2 border border-line">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Son Aktivite</p>
          <p className="text-[13px] text-text leading-snug">{file.lastActivity}</p>
        </div>
      </div>
    </Drawer>
  );
}

// ─── Documents Drawer ─────────────────────────────────────────────────────────

interface DocsDrawerProps {
  file: CustomsFile;
  onClose: () => void;
}

function DocsDrawer({ file, onClose }: DocsDrawerProps) {
  const docs = useMemo(() => getDocsForFile(file), [file]);
  const available = docs.filter((d) => d.available);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Evraklar — ${file.ref}`}
      subtitle={`${file.customer} · Kapanış: ${formatDate(file.closedAt)}`}
      footer={<Button onClick={onClose}>Kapat</Button>}
    >
      <div className="space-y-1">
        <p className="text-[12px] text-muted mb-3">
          {available.length}/{docs.length} evrak mevcut
        </p>
        <div className="divide-y divide-line">
          {docs.map((doc) => (
            <div key={doc.name} className="flex items-center justify-between py-3">
              <div>
                <p className="text-[13px] font-semibold text-text-strong">{doc.name}</p>
                <p className="text-[11.5px] text-muted mt-0.5">{doc.format}</p>
              </div>
              {doc.available ? (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" icon={Eye}>Görüntüle</Button>
                  <Button size="sm" icon={Download}>İndir</Button>
                </div>
              ) : (
                <Pill variant="warn">Yok</Pill>
              )}
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

// ─── Costs Drawer ─────────────────────────────────────────────────────────────

interface CostsDrawerProps {
  file: CustomsFile;
  onClose: () => void;
}

function CostsDrawer({ file, onClose }: CostsDrawerProps) {
  const [costs, setCosts] = useState<{ id: string; label: string; amount: number; currency: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    costsService.list(file.ref).then((list) => {
      setCosts(list);
      setLoading(false);
    });
  }, [file.ref]);

  // Group totals by currency
  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    costs.forEach((c) => {
      map[c.currency] = (map[c.currency] ?? 0) + c.amount;
    });
    return map;
  }, [costs]);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Maliyetler — ${file.ref}`}
      subtitle={`${file.customer} · ${formatDate(file.closedAt)}`}
      footer={<Button onClick={onClose}>Kapat</Button>}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : costs.length === 0 ? (
        <p className="text-[13px] text-muted py-8 text-center">Bu dosya için maliyet kaydı bulunamadı.</p>
      ) : (
        <div className="space-y-4">
          {/* Line items */}
          <div className="divide-y divide-line">
            <div className="grid grid-cols-3 pb-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Maliyet Kalemi</span>
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Tutar</span>
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Para Birimi</span>
            </div>
            {costs.map((c) => (
              <div key={c.id} className="grid grid-cols-3 py-2.5">
                <span className="text-[13px] text-text">{c.label}</span>
                <span className="text-[13px] font-semibold text-text-strong tabular-nums text-right">
                  {c.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[12px] text-muted text-right">{c.currency}</span>
              </div>
            ))}
          </div>

          {/* Totals per currency */}
          <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">Toplam</p>
            {Object.entries(totals).map(([cur, amt]) => (
              <div key={cur} className="flex items-center justify-between">
                <span className="text-[12.5px] text-muted">{cur}</span>
                <span className="text-[14px] font-extrabold text-text-strong tabular-nums">
                  {amt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {cur}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DrawerType = 'detail' | 'docs' | 'costs' | null;

export default function ArsivPage() {
  const { operationType: typeParam } = useParams<{ operationType: string }>();
  const { can } = useCan();

  const config = typeParam ? TYPE_CONFIG[typeParam] : undefined;
  const operationType = config?.operationType;

  const [loading,  setLoading]  = useState(true);
  const [files,    setFiles]    = useState<CustomsFile[]>([]);
  const [stats,    setStats]    = useState<ArchiveStats | null>(null);
  const [selected, setSelected] = useState<CustomsFile | null>(null);
  const [drawer,   setDrawer]   = useState<DrawerType>(null);

  // Filters
  const [search,      setSearch]      = useState('');
  const [filterCust,  setFilterCust]  = useState('');
  const [filterFrom,  setFilterFrom]  = useState('');
  const [filterTo,    setFilterTo]    = useState('');
  const [filterClose, setFilterClose] = useState('');

  // Cost totals for detail drawer
  const [costTotals, setCostTotals] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!operationType) return;
    setLoading(true);
    setFiles([]);
    setStats(null);
    setSearch('');
    setFilterCust('');
    setFilterFrom('');
    setFilterTo('');
    setFilterClose('');
    Promise.all([
      filesService.listArchived(operationType),
      filesService.getArchivedStats(operationType),
    ]).then(([list, s]) => {
      setFiles(list);
      setStats(s);
      setLoading(false);
    });
  }, [operationType]);

  // Pre-load cost totals for display in table
  useEffect(() => {
    if (files.length === 0) return;
    Promise.all(
      files.map((f) => costsService.list(f.ref).then((costs) => {
        const map: Record<string, number> = {};
        costs.forEach((c) => { map[c.currency] = (map[c.currency] ?? 0) + c.amount; });
        const summary = Object.entries(map)
          .map(([cur, amt]) => `${amt.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${cur}`)
          .join(' / ');
        return [f.ref, summary] as [string, string];
      }))
    ).then((pairs) => {
      setCostTotals(Object.fromEntries(pairs));
    });
  }, [files]);

  const customers = useMemo(
    () => Array.from(new Set(files.map((f) => f.customer))).sort(),
    [files],
  );

  const filtered = useMemo(() => {
    return files.filter((f) => {
      const q = search.toLowerCase();
      if (q && !f.ref.toLowerCase().includes(q) && !f.customer.toLowerCase().includes(q) && !(f.declarationNo ?? '').toLowerCase().includes(q)) return false;
      if (filterCust  && f.customer !== filterCust) return false;
      if (filterClose === 'eksiksiz' && (f.escalation || f.missingDocuments.length > 0)) return false;
      if (filterClose === 'uyarili'  && !f.escalation && f.missingDocuments.length === 0) return false;
      if (filterFrom && f.closedAt && f.closedAt < filterFrom) return false;
      if (filterTo   && f.closedAt && f.closedAt > filterTo + 'T23:59:59Z') return false;
      return true;
    });
  }, [files, search, filterCust, filterClose, filterFrom, filterTo]);

  const hasFilters = search !== '' || filterCust !== '' || filterClose !== '' || filterFrom !== '' || filterTo !== '';

  function clearFilters() {
    setSearch('');
    setFilterCust('');
    setFilterFrom('');
    setFilterTo('');
    setFilterClose('');
  }

  function openDrawer(file: CustomsFile, type: DrawerType) {
    setSelected(file);
    setDrawer(type);
  }

  function closeDrawer() {
    setDrawer(null);
    setSelected(null);
  }

  if (!config) {
    return (
      <div className="px-7 pt-6 pb-12 flex items-center justify-center min-h-[300px]">
        <p className="text-[14px] text-muted">
          Geçersiz arşiv türü: <code className="font-mono">{typeParam ?? '(yok)'}</code>.
          Lütfen sol menüden geçerli bir arşiv türü seçin.
        </p>
      </div>
    );
  }

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted shrink-0">
              {config.icon}
            </div>
            <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
              {config.label} Arşivi
            </h1>
          </div>
          <p className="text-[12.5px] text-muted mt-0.5">
            Tamamlanmış beyannameleri ve kapanmış dosyaları görüntüleyin.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.total}     label="Toplam Arşiv Kaydı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.thisMonth} label="Bu Ay Kapanan" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.clean}     label="Eksiksiz Kapanan" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.warned}    label="Kontrol Uyarılı Kapanan" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-warn rounded-l" />
            </div>
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <StatCard key={i} value="—" label="" />
          ))
        )}
      </div>

      {/* Main card */}
      <Card>
        <CardHead
          title={`${config.label} Arşiv Kayıtları`}
          sub="Kapanmış ve tamamlanmış dosyalar"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Referans / müşteri / beyanname ara…"
                  className="pl-8 pr-3 h-8 border border-line-strong rounded-[7px] text-[12.5px] text-text bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint w-56"
                />
              </div>

              {/* Date range */}
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                title="Kapanış tarihi başlangıç"
              />
              <span className="text-[12px] text-muted">–</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                title="Kapanış tarihi bitiş"
              />

              {/* Customer filter */}
              <select
                value={filterCust}
                onChange={(e) => setFilterCust(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Müşteri (Tümü)</option>
                {customers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Status filter */}
              <select
                value={filterClose}
                onChange={(e) => setFilterClose(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Durum (Tümü)</option>
                <option value="eksiksiz">Eksiksiz Kapanan</option>
                <option value="uyarili">Kontrol Uyarılı</option>
              </select>

              {hasFilters && (
                <Button size="sm" icon={X} onClick={clearFilters}>
                  Temizle
                </Button>
              )}
            </div>
          }
        />

        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-muted">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-[13px]">Yükleniyor…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted">
              {hasFilters
                ? 'Filtreyle eşleşen arşiv kaydı bulunamadı.'
                : `${config.label} arşivinde henüz kayıt yok.`}
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Referans No</Th>
                  <Th>Beyanname No</Th>
                  <Th>Müşteri</Th>
                  <Th>Tescil Tarihi</Th>
                  <Th>Kapanış Tarihi</Th>
                  <Th>Evraklar</Th>
                  <Th>Maliyetler</Th>
                  <Th>Durum</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <Tr key={f.ref} onClick={() => openDrawer(f, 'detail')}>
                    <Td>
                      <span className="font-semibold text-[13px] text-text-strong font-mono">{f.ref}</span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] font-mono text-text">{f.declarationNo ?? '—'}</span>
                    </Td>
                    <Td>
                      <div>
                        <p className="font-medium text-[13px] text-text-strong">{f.customer}</p>
                        <p className="text-[11.5px] text-muted">{f.customerCity}</p>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-text">{formatDate(f.receivedAt)}</span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-text">{formatDate(f.closedAt)}</span>
                    </Td>
                    <Td>
                      <Pill variant={f.missingDocuments.length === 0 ? 'ok' : 'warn'}>
                        {f.missingDocuments.length === 0 ? 'Eksiksiz' : 'Eksikli'}
                      </Pill>
                    </Td>
                    <Td>
                      <span className="text-[12px] text-text tabular-nums">
                        {costTotals[f.ref] ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <Pill variant={f.escalation ? 'warn' : 'ok'}>
                        {f.escalation ? 'Kontrol Uyarılı' : 'Eksiksiz'}
                      </Pill>
                    </Td>
                    <Td>
                      <div
                        className="flex items-center gap-1.5 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button size="sm" icon={Eye} onClick={() => openDrawer(f, 'detail')}>
                          Detay
                        </Button>
                        <Button size="sm" icon={FileText} onClick={() => openDrawer(f, 'docs')}>
                          Evrakları Gör
                        </Button>
                        {can('kapanis.maliyet') && (
                          <Button size="sm" icon={CreditCard} onClick={() => openDrawer(f, 'costs')}>
                            Maliyetleri Gör
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Drawers */}
      {drawer === 'detail' && selected && (
        <DetailDrawer
          file={selected}
          totalCost={costTotals[selected.ref] ?? ''}
          docCount={getDocsForFile(selected).filter((d) => d.available).length}
          onClose={closeDrawer}
        />
      )}
      {drawer === 'docs' && selected && (
        <DocsDrawer file={selected} onClose={closeDrawer} />
      )}
      {drawer === 'costs' && selected && (
        <CostsDrawer file={selected} onClose={closeDrawer} />
      )}
    </div>
  );
}
