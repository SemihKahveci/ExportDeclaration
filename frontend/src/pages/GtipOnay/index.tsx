import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  LayoutGrid,
  Plus,
  Download,
  Pencil,
  Check,
  X,
  Search,
  Loader2,
} from 'lucide-react';
import type { MaterialCustomer, MaterialRecord, TransactionType } from '../../types';
import { gtipService } from '../../services/gtip';
import { ApiError } from '../../api/apiClient';
import { useToast } from '../../components/ui/Toast';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import CustomerPanel from './CustomerPanel';
import TransactionTypeSelector, { type ActiveTransactionType } from './TransactionTypeSelector';
import TransactionTypeBadge from './TransactionTypeBadge';
import NewRecordDrawer from './NewRecordDrawer';
import ImportModal from './ImportModal';

// ─── Scope tag ────────────────────────────────────────────────────────────────

function ScopeTag({ transactionType }: { transactionType: ActiveTransactionType }) {
  const Icon =
    transactionType === 'ihracat' ? ArrowUpRight :
    transactionType === 'ithalat' ? ArrowDownLeft :
    transactionType === 'transit' ? ArrowLeftRight :
    LayoutGrid;

  const label =
    transactionType === 'tumu'
      ? 'Tümü'
      : transactionType === 'ihracat' ? 'İhracat + Tümü'
      : transactionType === 'ithalat' ? 'İthalat + Tümü'
      : 'Transit + Tümü';

  return (
    <span className="inline-flex items-center gap-1.5 bg-accent-tint text-accent font-bold px-[9px] py-[2px] rounded-full text-[11.5px]">
      <Icon size={13} strokeWidth={2} />
      {label}
    </span>
  );
}

// ─── Status cell ──────────────────────────────────────────────────────────────

function StatusCell({ status }: { status: MaterialRecord['status'] }) {
  const ok = status === 'verified';
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-[12.5px] ${ok ? 'text-ok' : 'text-warn'}`}>
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: ok ? 'var(--ok)' : 'var(--warn)' }}
      />
      {ok ? 'Doğrulanmış' : 'Onay Bekleyen'}
    </span>
  );
}

// ─── Source cell ──────────────────────────────────────────────────────────────

function SourceCell({ source }: { source: MaterialRecord['source'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted text-[12.5px]">
      {source === 'manuel'
        ? <Pencil size={14} strokeWidth={1.8} />
        : <Download size={14} strokeWidth={1.8} />
      }
      {source === 'manuel' ? 'Manuel' : 'Fatura'}
    </span>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'verified' | 'pending';

interface SummaryCardProps {
  count: number;
  label: string;
  dotColor?: string;
  active: boolean;
  onClick: () => void;
}

function SummaryCard({ count, label, dotColor, active, onClick }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex flex-col min-w-[140px] px-[17px] py-3 rounded-[10px] border transition-all text-left cursor-pointer',
        active
          ? 'border-accent shadow-[0_0_0_3px_var(--accent-tint)] bg-surface'
          : 'border-line bg-surface hover:border-muted-2',
      ].join(' ')}
    >
      <span className="text-[24px] font-bold text-text-strong leading-none">{count}</span>
      <span className="flex items-center gap-1.5 text-[12px] text-muted font-semibold mt-[5px]">
        {dotColor && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        )}
        {label}
      </span>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GtipOnayPage() {
  const { toast } = useToast();

  const [customers, setCustomers] = useState<MaterialCustomer[]>([]);
  const [records, setRecords] = useState<MaterialRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [transactionType, setTransactionType] = useState<ActiveTransactionType>('ihracat');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');

  const [newRecordOpen, setNewRecordOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // load customers once
  useEffect(() => {
    gtipService.getCustomers().then((data) => {
      setCustomers(data);
      setSelectedCustomerId((prev) => prev || data[0]?.id || '');
    });
  }, []);

  // reload records when customer changes
  useEffect(() => {
    if (!selectedCustomerId) return;
    setLoading(true);
    setStatusFilter('pending');
    setSearch('');
    gtipService.getRecords(selectedCustomerId).then((data) => {
      setRecords(data);
      setLoading(false);
    });
  }, [selectedCustomerId]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // counts are based on the raw records (before status filter / search)
  const total = records.length;
  const verified = records.filter((r) => r.status === 'verified').length;
  const pending = records.filter((r) => r.status === 'pending').length;

  // filtered view
  const visible = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter === 'verified' && r.status !== 'verified') return false;
      if (statusFilter === 'pending' && r.status !== 'pending') return false;
      if (transactionType !== 'tumu') {
        const tt = transactionType as TransactionType;
        const allFour: TransactionType[] = ['ithalat', 'ihracat', 'transit', 'antrepo'];
        const isAll = allFour.every((t) => r.transactionTypes.includes(t));
        if (!isAll && !r.transactionTypes.includes(tt)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.materialNo.toLowerCase().includes(q) &&
          !r.description.toLowerCase().includes(q) &&
          !r.gtipNo.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [records, statusFilter, transactionType, search]);

  async function refreshCustomers() {
    const data = await gtipService.getCustomers();
    setCustomers(data);
  }

  async function handleApprove(id: string) {
    const rec = records.find((r) => r.id === id);
    try {
      const updated = await gtipService.approveRecord(id);
      setRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
      toast(`${rec?.materialNo ?? 'Kayıt'} onaylandı · Doğrulanmış`);
    } catch {
      toast('Onaylama başarısız · lütfen tekrar dene');
    }
  }

  async function handleReject(id: string) {
    const rec = records.find((r) => r.id === id);
    try {
      await gtipService.rejectRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      await refreshCustomers();
      toast(`${rec?.materialNo ?? 'Kayıt'} reddedildi · kayıt listeden çıkarıldı`);
    } catch {
      toast('Reddetme başarısız · lütfen tekrar dene');
    }
  }

  async function handleNewRecord(record: Omit<MaterialRecord, 'id' | 'customerId'>) {
    if (!selectedCustomerId) return;
    try {
      const created = await gtipService.createRecord(selectedCustomerId, record);
      setRecords((prev) => [created, ...prev]);
      await refreshCustomers();
      setNewRecordOpen(false);
      toast('Kayıt eklendi · Onay Bekleyen kuyruğuna alındı');
    } catch {
      toast('Kayıt eklenemedi · lütfen tekrar dene');
    }
  }

  async function handleImport(file: File) {
    if (!selectedCustomerId) return;
    try {
      const result = await gtipService.importMaterialRecordsExcel(selectedCustomerId, file);
      setRecords((prev) => [...result.records, ...prev]);
      await refreshCustomers();
      const skipped = result.errors?.length
        ? ` · ${result.errors.length} satır atlandı`
        : '';
      toast(`Dosya yüklendi · ${result.count} malzeme eklendi${skipped}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'İçe aktarım başarısız · lütfen tekrar dene';
      toast(msg);
      throw err;
    }
  }

  async function handleTemplateDownload() {
    try {
      await gtipService.downloadMaterialRecordTemplate();
      toast('Excel şablonu indirildi · doldurup yükleyebilirsiniz');
    } catch {
      toast('Şablon indirilemedi · lütfen tekrar dene');
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left customer panel — fixed 282px */}
      <div className="w-[282px] shrink-0 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <CustomerPanel
          customers={customers}
          selectedId={selectedCustomerId}
          onSelect={setSelectedCustomerId}
          search={custSearch}
          onSearch={setCustSearch}
        />
      </div>

      {/* Right records area */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 pt-5 pb-12">
        {/* Page heading */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-extrabold text-text-strong tracking-tight leading-snug">
              GTİP Onay · {selectedCustomer?.name ?? '—'}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-[12.5px] text-muted flex-wrap">
              Onay bekleyen malzeme kayıtları ·
              <ScopeTag transactionType={transactionType} />
              · malzeme ↔ GTİP eşlemesi
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <TransactionTypeSelector value={transactionType} onChange={setTransactionType} />
            <Button icon={Download} onClick={() => setImportOpen(true)}>
              İçe Aktar
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setNewRecordOpen(true)}>
              Yeni Kayıt
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <SummaryCard
            count={total}
            label="Toplam kayıt"
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          <SummaryCard
            count={verified}
            label="Doğrulanmış"
            dotColor="var(--ok)"
            active={statusFilter === 'verified'}
            onClick={() => setStatusFilter('verified')}
          />
          <SummaryCard
            count={pending}
            label="Onay Bekleyen"
            dotColor="var(--warn)"
            active={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
          />
        </div>

        {/* Toolbar row */}
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[12.5px] text-muted flex-1">
            Bir özet kartına tıklayarak listeyi süzebilirsin.
          </p>
          <div className="relative w-[300px] shrink-0">
            <Search size={15} strokeWidth={2} className="absolute left-2.5 top-[9px] text-muted-2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Malzeme no, tanım veya GTİP ara…"
              className="w-full border border-line-strong bg-surface rounded-[8px] pl-[30px] pr-3 py-[8px] text-[13px] text-text placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-[13px]">Kayıtlar yükleniyor…</span>
          </div>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Malzeme No</Th>
                  <Th>Malzeme Tanımı</Th>
                  <Th>GTİP No</Th>
                  <Th>Uygulanabilir Tip</Th>
                  <Th>Durum</Th>
                  <Th>Kaynak</Th>
                  <Th>Güncelleme</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted text-[13px]">
                      Bu kriterlere uyan kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  visible.map((rec) => (
                    <Tr key={rec.id}>
                      <Td>
                        <span className="font-mono text-[12.5px] font-semibold text-text-strong">
                          {rec.materialNo}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-semibold text-text-strong text-[13px]">
                          {rec.description}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[12.5px] font-semibold text-text-strong">
                          {rec.gtipNo}
                        </span>
                      </Td>
                      <Td>
                        <TransactionTypeBadge types={rec.transactionTypes} />
                      </Td>
                      <Td>
                        <StatusCell status={rec.status} />
                      </Td>
                      <Td>
                        <SourceCell source={rec.source} />
                      </Td>
                      <Td>
                        <span className="text-muted text-[12.5px]">{rec.updatedAt}</span>
                      </Td>
                      <Td className="w-px">
                        <div className="flex items-center gap-1.5 justify-end">
                          {rec.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(rec.id)}
                                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-[9px] py-[5px] rounded-[7px] border transition-colors whitespace-nowrap border-[#bcdcca] text-ok bg-[#eef6f1] hover:bg-ok hover:border-ok hover:text-white"
                              >
                                <Check size={12} strokeWidth={2.4} />
                                Onayla
                              </button>
                              <button
                                onClick={() => handleReject(rec.id)}
                                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-[9px] py-[5px] rounded-[7px] border transition-colors whitespace-nowrap border-[#ecd0d0] text-[var(--hat-red)] bg-[#fbf0f0] hover:bg-[var(--hat-red)] hover:border-[var(--hat-red)] hover:text-white"
                              >
                                <X size={12} strokeWidth={2.4} />
                                Reddet
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setNewRecordOpen(true)}
                            className="text-muted-2 hover:text-accent transition-colors"
                          >
                            <Pencil size={16} strokeWidth={2} />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Drawers & Modals */}
      <NewRecordDrawer
        open={newRecordOpen}
        customerName={selectedCustomer?.name ?? '—'}
        onClose={() => setNewRecordOpen(false)}
        onSave={handleNewRecord}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onTemplateDownload={handleTemplateDownload}
        onImport={handleImport}
      />
    </div>
  );
}
