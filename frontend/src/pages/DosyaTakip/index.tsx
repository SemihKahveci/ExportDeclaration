import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Filter, ChevronRight, Loader2 } from 'lucide-react';

import type { CustomsFile, FileStatus } from '../../types';
import { filesService, buildStatusCounts, buildStatSummary } from '../../services/files';
import { customersService } from '../../services/customers';
import { ApiError } from '../../api/apiClient';
import { transitionFileHold, transitionRegistrationWorkflow, transitionClosureWorkflow } from '../../api/declarationApi';
import { useCan } from '../../permissions/useCan';
import Modal from '../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';

import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';

import Pill from '../../components/ui/Pill';

import FileStatusPill from './FileStatusPill';
import TransportIcon from './TransportIcon';
import OpenDaysCell from './CutoffCell';
import AssigneeCell from './AssigneeCell';
import HatCell from './HatCell';
import NewRequestDrawer from './NewRequestDrawer';
import FilterDrawer, { EMPTY_FILTERS, type FilterState } from './FilterDrawer';
import FileDetailDrawer from './FileDetailDrawer';

// ─── Status filter chip bar ────────────────────────────────────────────────────

type ChipFilter = 'all' | FileStatus;

interface ChipDef {
  key: ChipFilter;
  label: string;
  count: number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function archivePath(file: CustomsFile): string {
  const type = file.operationType === 'ithalat' || file.operationType === 'transit' ? file.operationType : 'ihracat';
  return `/arsiv/${type}?ref=${encodeURIComponent(file.ref)}`;
}

function isClosedFile(file: CustomsFile): boolean {
  return file.status === 'kapandi' || file.isArchived;
}

// ─── Missing docs pill with tooltip ───────────────────────────────────────────

function MissingDocsPill({ docs, fileRef, onNavigate }: {
  docs: string[];
  fileRef: string;
  onNavigate: (ref: string) => void;
}) {
  if (docs.length === 0) {
    return <Pill variant="ok">Yok</Pill>;
  }
  return (
    <div className="relative group inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNavigate(fileRef); }}
        className="focus:outline-none"
      >
        <Pill variant="warn">{docs.length} eksik</Pill>
      </button>
      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-surface border border-line shadow-lg rounded-lg px-3 py-2 min-w-[150px]">
          <ul className="space-y-1">
            {docs.map((doc) => (
              <li key={doc} className="text-[12px] text-text leading-snug">{doc}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DosyaTakipPage() {
  const { toast } = useToast();
  const { can } = useCan();
  const [holdTarget, setHoldTarget] = useState<CustomsFile | null>(null);
  const [holdNote, setHoldNote] = useState('');
  const [holding, setHolding] = useState(false);
  const [tescilTarget, setTescilTarget] = useState<CustomsFile | null>(null);
  const [tescilNo, setTescilNo] = useState('');
  const [tescilLine, setTescilLine] = useState('Yeşil');
  const [rowBusy, setRowBusy] = useState(false);
  const navigate = useNavigate();

  const [files, setFiles] = useState<CustomsFile[]>([]);
  const [loading, setLoading] = useState(true);

  const [chipFilter, setChipFilter] = useState<ChipFilter>('all');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<FilterState>(EMPTY_FILTERS);

  const [page, setPage] = useState(1);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFile, setDetailFile] = useState<CustomsFile | null>(null);

  const statusCounts = useMemo(() => buildStatusCounts(files), [files]);
  const statSummary = useMemo(() => buildStatSummary(files), [files]);

  const chips = useMemo((): ChipDef[] => [
    { key: 'all',               label: 'Tümü',               count: statusCounts.total },
    { key: 'yeni-talep',        label: 'Yeni Talep',          count: statusCounts.yeniTalep },
    { key: 'evrak-bekleniyor',  label: 'Evrak Bekleniyor',   count: statusCounts.evrakBekleniyor },
    { key: 'gtip-eksik',        label: 'GTİP Eksik/Hatalı', count: statusCounts.gtipEksik },
    { key: 'beyanname-yazim',   label: 'Beyanname Yazımda',  count: statusCounts.beyanname },
    { key: 'ic-kontrol',        label: 'Beyanname Yazım Onayında', count: statusCounts.icKontrol },
    { key: 'tescil',            label: 'Tescilde',            count: statusCounts.tescil },
    { key: 'kapanis-bekleyen',  label: 'Kapanış Bekleyen',   count: statusCounts.kapanisBekleyen },
    { key: 'kapandi',           label: 'Kapandı',             count: statusCounts.kapandi },
    { key: 'beklemede',         label: 'Beklemede',           count: statusCounts.beklemede },
  ], [statusCounts]);

  useEffect(() => {
    filesService.list().then((data) => {
      setFiles(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const watchingStatus = detailFile !== null || files.some((file) => file.status === 'yeni-talep');

  useEffect(() => {
    if (!watchingStatus) return;
    let cancelled = false;
    const timer = setInterval(() => {
      filesService.list().then((data) => {
        if (!cancelled) setFiles(data);
      }).catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [watchingStatus]);

  const openDetail = useMemo(() => {
    if (!detailFile) return null;
    return files.find((file) =>
      (detailFile.declarationId && file.declarationId === detailFile.declarationId) || file.ref === detailFile.ref
    ) ?? detailFile;
  }, [files, detailFile]);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      const closed = f.status === 'kapandi' || f.isArchived;
      if (chipFilter === 'kapandi') {
        if (!closed) return false;
      } else if (closed) {
        return false;
      } else if (chipFilter !== 'all' && f.status !== chipFilter) {
        return false;
      }
      if (activeFilters.musteri && f.customer !== activeFilters.musteri) return false;
      if (activeFilters.status && f.status !== activeFilters.status) return false;
      if (activeFilters.tasima && f.transportMode !== activeFilters.tasima) return false;
      if (activeFilters.hat && f.line !== activeFilters.hat) return false;
      if (activeFilters.sorumlu && f.assignee?.name !== activeFilters.sorumlu) return false;
      return true;
    });
  }, [files, chipFilter, activeFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function applyFilters() {
    setActiveFilters(filters);
    setPage(1);
    setFilterOpen(false);
    const hasAny = Object.values(filters).some(Boolean);
    toast(hasAny ? `${filtered.length} dosya listeleniyor` : 'Filtre temizlendi');
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setActiveFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function handleChip(key: ChipFilter) {
    setChipFilter(key);
    setPage(1);
  }

  async function refreshFiles() {
    const data = await filesService.list();
    setFiles(data);
  }

  async function saveHold() {
    if (!holdTarget?.declarationId) return;
    const note = holdNote.trim();
    if (!note) {
      toast('Beklemeye almak için not zorunludur.');
      return;
    }
    setHolding(true);
    try {
      await transitionFileHold(holdTarget.declarationId, { action: 'HOLD', note });
      setHoldTarget(null);
      setHoldNote('');
      await refreshFiles();
      toast('Dosya beklemeye alındı');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Dosya beklemeye alınamadı');
    } finally {
      setHolding(false);
    }
  }

  async function resumeFile(file: CustomsFile) {
    if (!file.declarationId) return;
    setRowBusy(true);
    try {
      await transitionFileHold(file.declarationId, { action: 'RESUME' });
      await refreshFiles();
      toast('Dosya önceki statüye döndü');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Dosya devam ettirilemedi');
    } finally {
      setRowBusy(false);
    }
  }

  async function saveTescilStart() {
    if (!tescilTarget?.declarationId) return;
    if (!tescilNo.trim()) {
      toast('Tescil numarası zorunludur.');
      return;
    }
    setRowBusy(true);
    try {
      await transitionRegistrationWorkflow(tescilTarget.declarationId, {
        action: 'RECORD_REGISTRATION_STARTED',
        tescilNo: tescilNo.trim(),
        line: tescilLine,
      });
      setTescilTarget(null);
      setTescilNo('');
      await refreshFiles();
      toast('Tescil başlangıç bildirimi kaydedildi');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Tescil başlangıcı kaydedilemedi');
    } finally {
      setRowBusy(false);
    }
  }

  async function completeTescil(file: CustomsFile) {
    if (!file.declarationId) return;
    setRowBusy(true);
    try {
      await transitionRegistrationWorkflow(file.declarationId, { action: 'COMPLETE_REGISTRATION' });
      await refreshFiles();
      toast('Tescil tamamlandı; dosya kapanış bekliyor');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Tescil tamamlanamadı');
    } finally {
      setRowBusy(false);
    }
  }

  async function closeFile(file: CustomsFile) {
    if (!file.declarationId) return;
    setRowBusy(true);
    try {
      await transitionClosureWorkflow(file.declarationId, { action: 'CLOSE_FILE' });
      await refreshFiles();
      toast('Dosya kapatıldı');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Dosya kapatılamadı');
    } finally {
      setRowBusy(false);
    }
  }

  async function handleNewRequestSave(payload: import('./NewRequestDrawer').NewRequestPayload) {
    try {
      const rules = await customersService.getDocRules(payload.customerId);
      if (!rules.some((rule) => rule.status === 'Aktif')) {
        setNewRequestOpen(false);
        toast('Bu müşteri için en az bir evrak kuralı gerekli. Evrak kuralları ekranına geçiliyor.', { duration: 4200 });
        window.setTimeout(() => {
          navigate(`/musteriler?customerId=${encodeURIComponent(payload.customerId)}&tab=rule`);
        }, 2200);
        return;
      }
      await filesService.create(payload);
      setNewRequestOpen(false);
      const data = await filesService.list();
      setFiles(data);
      toast('Yeni talep oluşturuldu · Yeni Talep statüsüyle eklendi');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Talep kaydedilemedi · lütfen tekrar deneyin';
      toast(message);
    }
  }

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  return (
    <div className="p-6 pb-12 space-y-6 min-w-0">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-end gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-text-strong tracking-tight">
            İhracat Dosya Takip
          </h1>
          <p className="text-muted text-[13px] mt-0.5">
            Yeni talepten kapanışa kadar tüm dosyaları statü bazlı izleyin.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <Button icon={Download} onClick={() => toast('Excel indirme hazırlanıyor…')} writeCap="dosya_takip.edit">
            Dışa Aktar
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setNewRequestOpen(true)}
            writeCap="dosya_takip.edit"
          >
            Yeni Talep
          </Button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3.5">
        <StatCard
          value={statSummary.aktifDosya}
          label="Aktif Dosya"
          className="[border-left:3px_solid_var(--accent)]"
        />
        <StatCard
          value={statSummary.evrakBekleyen}
          label="Evrak Bekleyen"
          className="[border-left:3px_solid_var(--warn)]"
        />
        <StatCard
          value={statSummary.beyannamedYazim}
          label="Beyanname Yazımda"
          className="[border-left:3px_solid_var(--hat-blue)]"
        />
        <StatCard
          value={statSummary.eskalasyon}
          label="Eskalasyon"
          className="[border-left:3px_solid_var(--hat-red)]"
        />
        <StatCard
          value={statSummary.tescilde}
          label="Tescilde"
          className="[border-left:3px_solid_var(--hat-blue)]"
        />
      </div>

      {/* ── Filter toolbar ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map((chip) => {
          const active = chipFilter === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => handleChip(chip.key)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors select-none whitespace-nowrap',
                active
                  ? 'bg-ink border-ink text-white'
                  : 'bg-surface border-line-strong text-text hover:border-muted-2',
              ].join(' ')}
            >
              {chip.label}
              <span className={`text-[11px] font-bold ${active ? 'opacity-70' : 'text-muted'}`}>
                {chip.count}
              </span>
            </button>
          );
        })}

        <div className="w-px h-5 bg-line-strong mx-1 shrink-0" />

        <Button
          icon={Filter}
          size="sm"
          variant={hasActiveFilters ? 'primary' : 'default'}
          onClick={() => setFilterOpen(true)}
        >
          Filtreler{hasActiveFilters ? ' ·' : ''}
        </Button>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[13px]">Dosyalar yükleniyor…</span>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Dosya No</Th>
                <Th>Müşteri</Th>
                <Th>Statü</Th>
                <Th>Taşıma</Th>
                <Th>Hat</Th>
                <Th>Beyanname No</Th>
                <Th>Açık Gün</Th>
                <Th>Eksik Evraklar</Th>
                <Th>Sorumlu</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted text-[13px]">
                    Bu kriterlere uyan dosya bulunamadı.
                  </td>
                </tr>
              ) : (
                pageRows.map((file) => (
                  <Tr key={file.ref} onClick={() => {
                    if (isClosedFile(file)) navigate(archivePath(file));
                    else setDetailFile(file);
                  }}>
                    <Td>
                      <button
                        type="button"
                        className="font-mono text-[12px] font-semibold text-accent hover:underline"
                        title={isClosedFile(file) ? 'Arşiv kaydı' : 'Beyanname Yazım ve MT Kontrol'}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isClosedFile(file)) {
                            navigate(archivePath(file));
                            return;
                          }
                          const query = file.declarationId
                            ? `declarationId=${encodeURIComponent(file.declarationId)}&ref=${encodeURIComponent(file.ref)}&tab=yazim`
                            : `ref=${encodeURIComponent(file.ref)}&tab=yazim`;
                          navigate(`/beyanname?${query}`);
                        }}
                      >
                        {file.ref}
                      </button>
                    </Td>
                    <Td>
                      <span className="font-semibold text-text-strong block leading-snug">
                        {file.customer}
                      </span>
                      <span className="text-[11.5px] text-muted">{file.customerCity}</span>
                    </Td>
                    <Td>
                      <FileStatusPill status={file.status} />
                      {file.returnNotice ? <span className="block text-[11px] text-warn mt-1 max-w-[200px] leading-snug">{file.returnNotice}</span> : null}
                      {file.status === 'beklemede' && file.holdNote ? <span className="block text-[11px] text-muted mt-1 max-w-[200px] leading-snug">{file.holdNote}</span> : null}
                    </Td>
                    <Td><TransportIcon mode={file.transportMode} /></Td>
                    <Td><HatCell line={file.line} /></Td>
                    <Td>
                      {file.declarationNo
                        ? <span className="font-mono text-[12px] text-text-strong">{file.declarationNo}</span>
                        : <span className="text-muted-2 font-mono text-[12px]">—</span>
                      }
                    </Td>
                    <Td>
                      <OpenDaysCell
                        receivedAt={file.receivedAt}
                        escalation={file.escalation}
                      />
                    </Td>
                    <Td>
                      <MissingDocsPill
                        docs={file.missingDocuments}
                        fileRef={file.ref}
                        onNavigate={(ref) => navigate(file.declarationId ? `/evrak-hazirlik?declarationId=${encodeURIComponent(file.declarationId)}&ref=${encodeURIComponent(ref)}` : `/evrak-hazirlik?ref=${encodeURIComponent(ref)}`)}
                      />
                    </Td>
                    <Td><AssigneeCell assignee={file.assignee} /></Td>
                    <Td className="text-muted-2">
                      <div className="flex flex-col items-stretch gap-1 min-w-[180px]" onClick={(event) => event.stopPropagation()}>
                        {file.status === 'tescil' && file.tescilStatus !== 'started' && file.tescilStatus !== 'completed' && (
                          <Button size="mini" variant="primary" disabled={rowBusy || !can('tescil.notify')} onClick={() => { setTescilTarget(file); setTescilNo(''); setTescilLine('Yeşil'); }}>
                            Başlangıç Bildirimi Kaydet
                          </Button>
                        )}
                        {file.status === 'tescil' && file.tescilStatus === 'started' && (
                          <Button size="mini" variant="primary" disabled={rowBusy || !can('tescil.notify')} onClick={() => void completeTescil(file)}>
                            Tamamlanma Bildirimi Kaydet
                          </Button>
                        )}
                        {file.status === 'kapanis-bekleyen' && (
                          <Button size="mini" variant="primary" disabled={rowBusy || !can('kapanis.close')} onClick={() => void closeFile(file)}>
                            Dosyayı Kapat
                          </Button>
                        )}
                        {file.status === 'beklemede' ? (
                          <Button size="mini" disabled={rowBusy || !can('dosya_takip.edit')} onClick={() => void resumeFile(file)}>
                            Devam Ettir
                          </Button>
                        ) : !isClosedFile(file) && (
                          <Button size="mini" disabled={rowBusy || !can('dosya_takip.edit')} onClick={() => { setHoldTarget(file); setHoldNote(''); }}>
                            Beklemeye Al
                          </Button>
                        )}
                        <ChevronRight size={16} strokeWidth={1.75} className="self-end" />
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>

          {/* Pagination footer */}
          <div className="flex items-center px-4 py-3 border-t border-line bg-surface-2 text-[12.5px] text-muted">
            <span>
              {filtered.length} dosyadan{' '}
              {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–
              {Math.min(page * PAGE_SIZE, filtered.length)} arası gösteriliyor
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 rounded border border-line-strong bg-surface text-text font-semibold hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={[
                    'w-7 h-7 rounded border font-semibold transition-colors text-[12px]',
                    p === page
                      ? 'bg-ink border-ink text-white'
                      : 'border-line-strong bg-surface text-text hover:bg-surface-2',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-7 h-7 rounded border border-line-strong bg-surface text-text font-semibold hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                ›
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Drawers ─────────────────────────────────────────────── */}
      <NewRequestDrawer
        open={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        onSave={handleNewRequestSave}
      />

      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      <FileDetailDrawer
        file={openDetail}
        onClose={() => setDetailFile(null)}
      />

      <Modal
        open={holdTarget !== null}
        onClose={() => !holding && setHoldTarget(null)}
        title="Beklemeye Al"
        footer={
          <>
            <Button onClick={() => setHoldTarget(null)} disabled={holding}>Vazgeç</Button>
            <Button variant="primary" onClick={() => void saveHold()} disabled={holding || !holdNote.trim()}>
              {holding ? 'Kaydediliyor…' : 'Beklemeye Al'}
            </Button>
          </>
        }
      >
        <Field label="Not">
          <Textarea rows={4} value={holdNote} onChange={(event) => setHoldNote(event.target.value)} placeholder="Dosya neden bekletiliyor?" />
        </Field>
      </Modal>

      <Modal
        open={tescilTarget !== null}
        onClose={() => !rowBusy && setTescilTarget(null)}
        title="Başlangıç Bildirimi"
        footer={
          <>
            <Button onClick={() => setTescilTarget(null)} disabled={rowBusy}>Vazgeç</Button>
            <Button variant="primary" onClick={() => void saveTescilStart()} disabled={rowBusy || !tescilNo.trim()}>Kaydet</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Tescil numarası">
            <Input value={tescilNo} onChange={(event) => setTescilNo(event.target.value)} />
          </Field>
          <Field label="Hat">
            <Select value={tescilLine} onChange={(event) => setTescilLine(event.target.value)}>
              <option>Kırmızı</option>
              <option>Sarı</option>
              <option>Mavi</option>
              <option>Yeşil</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
