import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import type { DocumentRule } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { Select } from '../../components/ui/Fields';
import Button from '../../components/ui/Button';

// ─── Mode badge ───────────────────────────────────────────────────────────────

const MODE_STYLES: Record<string, string> = {
  Otomatik:   'bg-ok-tint text-ok',
  Kontrollü:  'bg-[#e8f0f8] text-[var(--hat-blue)]',
  Manuel:     'bg-warn-tint text-warn',
};

function ModeBadge({ mode }: { mode: string }) {
  const cls = MODE_STYLES[mode] ?? 'bg-surface-2 text-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-[10px] py-[4px] rounded-full ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {mode}
    </span>
  );
}

function StatusBadge({ status }: { status: 'Aktif' | 'Pasif' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${status === 'Aktif' ? 'text-ok' : 'text-muted'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {status}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocRulesTabProps {
  rules: DocumentRule[];
  onNew: () => void;
  onEdit: (idx: number) => void;
}

export default function DocRulesTab({ rules, onNew, onEdit }: DocRulesTabProps) {
  const [filterTip, setFilterTip] = useState('Tümü');
  const [filterTas, setFilterTas] = useState('Tümü');
  const [filterSt, setFilterSt] = useState('Tümü');

  const visible = rules.filter((r) => {
    if (filterTip !== 'Tümü' && r.transactionType !== filterTip) return false;
    if (filterTas !== 'Tümü' && r.transportMode !== filterTas) return false;
    if (filterSt !== 'Tümü' && r.status !== filterSt) return false;
    return true;
  });

  function clearFilters() {
    setFilterTip('Tümü');
    setFilterTas('Tümü');
    setFilterSt('Tümü');
  }

  return (
    <Card>
      <CardHead
        title="Müşteri Evrak Kuralları"
        sub="İşlem tipi, taşıma şekli ve senaryoya göre müşteriden istenecek evrak setleri."
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={onNew}>
            Yeni Evrak Kuralı
          </Button>
        }
      />
      <CardBody>
        <div className="flex gap-3 flex-wrap items-end mb-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-1">İşlem Tipi</label>
            <Select value={filterTip} onChange={(e) => setFilterTip(e.target.value)} className="!w-auto !py-[7px]">
              <option>Tümü</option>
              <option>İhracat</option>
              <option>İthalat</option>
              <option>Transit</option>
              <option>Antrepo</option>
            </Select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-1">Taşıma Şekli</label>
            <Select value={filterTas} onChange={(e) => setFilterTas(e.target.value)} className="!w-auto !py-[7px]">
              <option>Tümü</option>
              <option>Karayolu</option>
              <option>Denizyolu</option>
              <option>Havayolu</option>
            </Select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-1">Durum</label>
            <Select value={filterSt} onChange={(e) => setFilterSt(e.target.value)} className="!w-auto !py-[7px]">
              <option>Tümü</option>
              <option>Aktif</option>
              <option>Pasif</option>
            </Select>
          </div>
          <Button size="sm" onClick={clearFilters}>Temizle</Button>
        </div>
      </CardBody>
      <Table>
        <thead>
          <tr>
            <Th>İşlem Tipi</Th>
            <Th>Taşıma</Th>
            <Th>Senaryo</Th>
            <Th>Gerekli Evraklar</Th>
            <Th>Hatırlatma</Th>
            <Th>Sıklık</Th>
            <Th>Durum</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-muted text-[13px]">
                Bu kriterlere uyan evrak kuralı bulunamadı.
              </td>
            </tr>
          ) : (
            visible.map((r) => {
              const realIdx = rules.indexOf(r);
              return (
                <Tr key={r.id}>
                  <Td><span className="font-semibold text-text-strong">{r.transactionType}</span></Td>
                  <Td><span className="text-[13px]">{r.transportMode}</span></Td>
                  <Td><span className="text-[13px]">{r.scenario}</span></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.requiredDocs.map((d) => (
                        <span key={d} className="inline-flex text-[11.5px] font-semibold px-2 py-1 rounded-[6px] bg-surface-2 border border-line text-text whitespace-nowrap">
                          {d}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td><ModeBadge mode={r.reminderType} /></Td>
                  <Td><span className="text-muted text-[12px]">{r.frequency}</span></Td>
                  <Td><StatusBadge status={r.status} /></Td>
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
      <div className="px-5 py-3 text-[12px] text-muted-2 leading-relaxed border-t border-line">
        Fatura temel belge olarak kabul edilir; diğer evraklar eksik olsa bile kullanıcı "eksik evrakla işleme başla" seçeneğiyle devam edebilir.
      </div>
    </Card>
  );
}
