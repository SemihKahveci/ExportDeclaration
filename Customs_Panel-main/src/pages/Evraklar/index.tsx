import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Loader2, X } from 'lucide-react';
import type { EvraklarRule, EvraklarPageStats } from '../../types';
import { evraklarService } from '../../services/rules';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import RuleDrawer from './RuleDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

type DrawerMode = 'new' | 'edit' | 'delete' | null;

// ─── Condition tag helpers ────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  mensei:           'Menşei',
  teslim_ulkesi:    'Teslim',
  gonderici_ulkesi: 'Gönderici',
  gtip_no:          'GTİP',
};

function ConditionTags({ rule }: { rule: EvraklarRule }) {
  const active = rule.conditions.filter((c) => c.enabled && c.value.trim() !== '');
  if (active.length === 0) return <span className="text-muted-2 text-[12px]">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {active.map((c, i) => (
        <span key={c.field} className="inline-flex items-center gap-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 border border-line text-[11.5px] text-text-strong font-medium">
            <span className="text-muted">{FIELD_LABELS[c.field] ?? c.field}:</span>
            {c.value}
          </span>
          {i < active.length - 1 && (
            <span className="text-[10px] font-bold text-muted-2 uppercase tracking-wide">VE</span>
          )}
        </span>
      ))}
    </div>
  );
}

function DocTags({ docs }: { docs: string[] }) {
  if (docs.length === 0) return <span className="text-muted-2 text-[12px]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {docs.map((d) => (
        <span
          key={d}
          className="inline-block px-2 py-0.5 rounded-full bg-accent-tint text-accent text-[11px] font-medium border border-accent/20"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvraklarPage() {
  const { toast } = useToast();
  const [loading, setLoading]     = useState(true);
  const [rules, setRules]         = useState<EvraklarRule[]>([]);
  const [stats, setStats]         = useState<EvraklarPageStats | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [docTypes, setDocTypes]   = useState<string[]>([]);

  // Filters
  const [search,       setSearch]       = useState('');
  const [filterDoc,    setFilterDoc]    = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Drawer
  const [drawerMode,   setDrawerMode]   = useState<DrawerMode>(null);
  const [drawerRule,   setDrawerRule]   = useState<EvraklarRule | null>(null);

  useEffect(() => {
    Promise.all([
      evraklarService.getRules(),
      evraklarService.getStats(),
      evraklarService.getCountries(),
      evraklarService.getDocumentTypes(),
    ]).then(([r, s, c, d]) => {
      setRules(r);
      setStats(s);
      setCountries(c);
      setDocTypes(d);
      setLoading(false);
    });
  }, []);

  // Derive stats from current rules whenever rules change
  function recalcStats(updated: EvraklarRule[]) {
    const active  = updated.filter((r) => r.active).length;
    const allDocs = new Set(updated.flatMap((r) => r.requiredDocuments));
    setStats({ total: updated.length, active, passive: updated.length - active, docTypes: allDocs.size });
  }

  // Filtered rules
  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterDoc && !r.requiredDocuments.includes(filterDoc)) return false;
      if (filterStatus === 'Aktif'  && !r.active) return false;
      if (filterStatus === 'Pasif'  &&  r.active) return false;
      return true;
    });
  }, [rules, search, filterDoc, filterStatus]);

  function clearFilters() {
    setSearch('');
    setFilterDoc('');
    setFilterStatus('');
  }

  // ── Drawer handlers ────────────────────────────────────────────────────────

  function openNew() {
    setDrawerRule(null);
    setDrawerMode('new');
  }

  function openEdit(rule: EvraklarRule) {
    setDrawerRule(rule);
    setDrawerMode('edit');
  }

  function openDelete(rule: EvraklarRule, e: React.MouseEvent) {
    e.stopPropagation();
    setDrawerRule(rule);
    setDrawerMode('delete');
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerRule(null);
  }

  async function handleSave(rule: EvraklarRule) {
    const isNew = !rules.find((r) => r.id === rule.id);
    await evraklarService.save(rule);
    const updated = isNew
      ? [rule, ...rules]
      : rules.map((r) => (r.id === rule.id ? rule : r));
    setRules(updated);
    recalcStats(updated);
    closeDrawer();
    toast(isNew ? 'Yeni kural oluşturuldu' : 'Kural güncellendi');
  }

  async function handleDelete(id: string) {
    await evraklarService.delete(id);
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    recalcStats(updated);
    closeDrawer();
    toast('Kural silindi');
  }

  async function handleToggle(rule: EvraklarRule, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = await evraklarService.toggleActive(rule.id);
    if (!updated) return;
    const next = rules.map((r) => (r.id === rule.id ? updated : r));
    setRules(next);
    recalcStats(next);
    toast(updated.active ? `"${updated.name}" aktif edildi` : `"${updated.name}" pasif edildi`);
  }

  const hasFilters = search !== '' || filterDoc !== '' || filterStatus !== '';

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">Evraklar</h1>
          <p className="text-[12.5px] text-muted mt-1">
            Beyanname tipi ve koşullara göre zorunlu evrak kural setlerini tanımlayın.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openNew}>
          Yeni Kural
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.total}    label="Tanımlı Kural" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.active}   label="Aktif Kural" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.passive}  label="Pasif Kural" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--muted-2)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.docTypes} label="Kullanılan Belge Türü" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Rule list card */}
      <Card>
        <CardHead
          title="Kural Listesi"
          sub="Koşul ve belge bazlı evrak kuralları"
          actions={
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kural ara…"
                  className="pl-8 pr-3 h-8 border border-line-strong rounded-[7px] text-[12.5px] text-text bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint w-48"
                />
              </div>

              {/* Doc filter */}
              <select
                value={filterDoc}
                onChange={(e) => setFilterDoc(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Belge (Tümü)</option>
                {docTypes.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Durum (Tümü)</option>
                <option value="Aktif">Aktif</option>
                <option value="Pasif">Pasif</option>
              </select>

              {/* Clear */}
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
                ? 'Filtreyle eşleşen kural bulunamadı.'
                : 'Henüz kural tanımlanmadı.'}
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Kural</Th>
                  <Th>Koşullar <span className="font-normal text-muted-2 normal-case tracking-normal">(tümü sağlandığında)</span></Th>
                  <Th>İstenen Belgeler</Th>
                  <Th>Durum</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((rule) => (
                  <Tr
                    key={rule.id}
                    className={rule.active ? '' : 'opacity-50'}
                    onClick={() => openEdit(rule)}
                  >
                    <Td>
                      <span className="font-semibold text-[13px] text-text-strong">{rule.name}</span>
                    </Td>
                    <Td>
                      <ConditionTags rule={rule} />
                    </Td>
                    <Td>
                      <DocTags docs={rule.requiredDocuments} />
                    </Td>
                    <Td>
                      <button
                        onClick={(e) => handleToggle(rule, e)}
                        className="focus:outline-none"
                        title={rule.active ? 'Pasif yap' : 'Aktif yap'}
                      >
                        <Pill variant={rule.active ? 'ok' : 'gray'}>
                          {rule.active ? 'Aktif' : 'Pasif'}
                        </Pill>
                      </button>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" icon={Pencil} onClick={() => openEdit(rule)}>
                          Düzenle
                        </Button>
                        <Button size="sm" icon={Trash2} onClick={(e) => openDelete(rule, e)} />
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Drawer */}
      {drawerMode && (
        <RuleDrawer
          mode={drawerMode}
          rule={drawerRule}
          countries={countries}
          docTypes={docTypes}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
