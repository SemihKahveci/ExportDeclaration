import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Filter, ChevronRight, Loader2 } from 'lucide-react';

import type { CustomsFile, FileStatus } from '../../types';
import { filesService, STAT_SUMMARY, STATUS_COUNTS } from '../../services/files';

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

const CHIPS: ChipDef[] = [
  { key: 'all',               label: 'Tümü',               count: STATUS_COUNTS.total },
  { key: 'yeni-talep',        label: 'Yeni Talep',          count: STATUS_COUNTS.yeniTalep },
  { key: 'gtip-hazirlik',     label: 'GTİP Hazırlıkta',    count: STATUS_COUNTS.gtipHazirlik },
  { key: 'evrak-bekleniyor',  label: 'Evrak Bekleniyor',   count: STATUS_COUNTS.evrakBekleniyor },
  { key: 'beyanname-yazim',   label: 'Beyanname Yazımda',  count: STATUS_COUNTS.beyanname },
  { key: 'ic-kontrol',        label: 'İç Kontrolde',       count: STATUS_COUNTS.icKontrol },
  { key: 'tescil',            label: 'Tescilde',            count: STATUS_COUNTS.tescil },
  { key: 'kapanis-bekleyen',  label: 'Kapanış Bekleyen',   count: STATUS_COUNTS.kapanisBekleyen },
];

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

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

  useEffect(() => {
    filesService.list().then((data) => {
      setFiles(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (chipFilter !== 'all' && f.status !== chipFilter) return false;
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

  function handleNewRequestSave() {
    setNewRequestOpen(false);
    toast('Yeni talep oluşturuldu · Yeni Talep statüsüyle eklendi');
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
          <Button icon={Download} onClick={() => toast('Excel indirme hazırlanıyor…')}>
            Dışa Aktar
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setNewRequestOpen(true)}
          >
            Yeni Talep
          </Button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3.5">
        <StatCard
          value={STAT_SUMMARY.aktifDosya}
          label="Aktif Dosya"
          className="[border-left:3px_solid_var(--accent)]"
        />
        <StatCard
          value={STAT_SUMMARY.evrakBekleyen}
          label="Evrak Bekleyen"
          className="[border-left:3px_solid_var(--warn)]"
        />
        <StatCard
          value={STAT_SUMMARY.beyannamedYazim}
          label="Beyanname Yazımda"
          className="[border-left:3px_solid_var(--hat-blue)]"
        />
        <StatCard
          value={STAT_SUMMARY.eskalasyon}
          label="Eskalasyon"
          className="[border-left:3px_solid_var(--hat-red)]"
        />
        <StatCard
          value={STAT_SUMMARY.tescilde}
          label="Tescilde"
          className="[border-left:3px_solid_var(--hat-blue)]"
        />
      </div>

      {/* ── Filter toolbar ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map((chip) => {
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
                  <Tr key={file.ref} onClick={() => setDetailFile(file)}>
                    <Td>
                      <span className="font-mono text-[12px] font-semibold text-text-strong">
                        {file.ref}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-semibold text-text-strong block leading-snug">
                        {file.customer}
                      </span>
                      <span className="text-[11.5px] text-muted">{file.customerCity}</span>
                    </Td>
                    <Td><FileStatusPill status={file.status} /></Td>
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
                        onNavigate={(ref) => navigate(`/evrak-hazirlik?ref=${ref}`)}
                      />
                    </Td>
                    <Td><AssigneeCell assignee={file.assignee} /></Td>
                    <Td className="text-muted-2 w-8">
                      <ChevronRight size={16} strokeWidth={1.75} />
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>

          {/* Pagination footer */}
          <div className="flex items-center px-4 py-3 border-t border-line bg-surface-2 text-[12.5px] text-muted">
            <span>
              {STATUS_COUNTS.total} dosyadan{' '}
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
        file={detailFile}
        onClose={() => setDetailFile(null)}
      />
    </div>
  );
}
