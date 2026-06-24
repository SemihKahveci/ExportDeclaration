import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import type { DocProcess } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { Input, Select } from '../../components/ui/Fields';
import StatCard from '../../components/ui/StatCard';
import Pill from '../../components/ui/Pill';
import Note from '../../components/ui/Note';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import ParseTestCard from './ParseTestCard';

// ─── Pill helpers ─────────────────────────────────────────────────────────────

function parseResultVariant(result: string) {
  if (result === 'Başarılı') return 'ok' as const;
  if (result === 'Kısmi Başarılı' || result === 'Test Bekliyor') return 'warn' as const;
  if (result === 'Başarısız') return 'red' as const;
  return 'gray' as const;
}

function parseableVariant(v: string) {
  return v === 'Evet' ? 'ok' as const : 'gray' as const;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocProcessesTabProps {
  docs: DocProcess[];
  onNew: () => void;
  onEdit: (idx: number) => void;
  onDocUpdated: (id: string, patch: Partial<DocProcess>) => void;
}

export default function DocProcessesTab({ docs, onNew, onEdit, onDocUpdated }: DocProcessesTabProps) {
  const { toast } = useToast();
  const [filterName, setFilterName]       = useState('');
  const [filterProcess, setFilterProcess] = useState('Tümü');
  const [filterParse, setFilterParse]     = useState('Tümü');

  const activeCount    = docs.filter((d) => d.status === 'Aktif').length;
  const parseableCount = docs.filter((d) => d.parseable === 'Evet').length;
  const testPendingCount = docs.filter((d) => d.testResult === 'Test Bekliyor').length;

  const visible = docs.filter((d) => {
    if (filterName && !d.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterProcess !== 'Tümü' && d.process !== filterProcess) return false;
    if (filterParse !== 'Tümü' && d.parseable !== filterParse) return false;
    return true;
  });

  function clearFilters() {
    setFilterName('');
    setFilterProcess('Tümü');
    setFilterParse('Tümü');
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={docs.length}       label="Tanımlı evrak tipi" />
        <StatCard value={activeCount}       label="Aktif evrak" />
        <StatCard value={parseableCount}    label="Parse edilebilir" />
        <StatCard value={testPendingCount}  label="Test bekleyen" />
      </div>

      {/* Parse test */}
      <ParseTestCard docs={docs} onDocUpdated={onDocUpdated} />

      {/* Document process table */}
      <Card>
        <CardHead
          title="Doküman Süreç Tanımları"
          sub="Evrak tipleri, parse edilebilirlik durumu ve test sonuçları"
          actions={
            <Button variant="primary" size="sm" icon={Plus} onClick={onNew}>
              Yeni Evrak Tipi
            </Button>
          }
        />
        <CardBody>
          <Note variant="warn">
            Kullanıcı örnek evrak yükleyerek sistemin evrağı ne kadar parse edebildiğini görebilir ve destek talebi oluşturabilir.
          </Note>

          <div className="flex gap-3 flex-wrap items-end mt-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-1">Evrak Tipi</label>
              <Input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Fatura, CMR…"
                className="!w-auto !py-[7px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-1">Süreç</label>
              <Select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className="!w-auto !py-[7px]">
                <option>Tümü</option>
                <option>GTİP Hazırlık</option>
                <option>Evrak Hazırlık</option>
                <option>Beyanname Yazım</option>
                <option>Tescil</option>
                <option>Kapanış</option>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-1">Parse Edilir</label>
              <Select value={filterParse} onChange={(e) => setFilterParse(e.target.value)} className="!w-auto !py-[7px]">
                <option>Tümü</option>
                <option>Evet</option>
                <option>Hayır</option>
              </Select>
            </div>
            <Button size="sm" onClick={clearFilters}>Temizle</Button>
          </div>
        </CardBody>

        <Table>
          <thead>
            <tr>
              <Th>Evrak Tipi</Th>
              <Th>Süreç</Th>
              <Th>Format</Th>
              <Th>Parse Edilir</Th>
              <Th>Son Test</Th>
              <Th>Başarı</Th>
              <Th>Destek Notu</Th>
              <Th>Durum</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted text-[13px]">
                  Bu kriterlere uyan evrak bulunamadı.
                </td>
              </tr>
            ) : (
              visible.map((d) => {
                const realIdx = docs.indexOf(d);
                return (
                  <Tr key={d.id}>
                    <Td><span className="font-semibold text-text-strong">{d.name}</span></Td>
                    <Td><span className="text-muted text-[12.5px]">{d.process}</span></Td>
                    <Td><span className="text-[12.5px]">{d.format}</span></Td>
                    <Td><Pill variant={parseableVariant(d.parseable)}>{d.parseable}</Pill></Td>
                    <Td><Pill variant={parseResultVariant(d.testResult)}>{d.testResult}</Pill></Td>
                    <Td><span className="font-mono text-[12.5px]">{d.successRate}</span></Td>
                    <Td>
                      <button
                        className="text-accent-d font-semibold text-[12px] underline hover:no-underline"
                        onClick={() => toast(d.supportNote)}
                      >
                        Notu gör
                      </button>
                    </Td>
                    <Td><Pill variant={d.status === 'Aktif' ? 'ok' : 'gray'}>{d.status}</Pill></Td>
                    <Td className="w-px">
                      <button
                        onClick={() => onEdit(realIdx)}
                        className="text-muted-2 hover:text-accent transition-colors"
                      >
                        <Pencil size={15} strokeWidth={2} />
                      </button>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
