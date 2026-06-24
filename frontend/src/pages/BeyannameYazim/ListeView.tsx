import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Bell, FileWarning, AlertTriangle, Truck, Ship, Plane, Search, X } from 'lucide-react';
import type { BeyannameListeItem, BeyannameListeStatus, GtipSuitabilityStatus, TransportMode } from '../../types';
import StatCard from '../../components/ui/StatCard';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';

interface ListeViewProps {
  items: BeyannameListeItem[];
  onSelectYazim: (item: BeyannameListeItem) => void;
  onSelectKontrol: (item: BeyannameListeItem) => void;
  onRowUpload: (item: BeyannameListeItem) => void;
  onRowReminder: (item: BeyannameListeItem) => void;
}

const STATUS_CONFIG: Record<BeyannameListeStatus, { label: string; variant: 'ok' | 'warn' | 'accent' | 'red' }> = {
  'onaya-hazir':      { label: 'Onaya Hazır',      variant: 'ok'     },
  'kontrol-bekliyor': { label: 'Kontrol Bekliyor', variant: 'accent' },
  'yazim-bekliyor':   { label: 'Yazım Bekliyor',   variant: 'warn'   },
  'kontrol-uyarisi':  { label: 'Kontrol Uyarısı',  variant: 'red'    },
};

const GTIP_STATUS_CONFIG: Record<GtipSuitabilityStatus, { label: string; variant: 'ok' | 'warn' | 'accent' | 'red' }> = {
  'uygun':            { label: 'Uygun',            variant: 'ok'     },
  'eksik':            { label: 'Eksik',            variant: 'warn'   },
  'uyumsuz':          { label: 'Uyumsuz',          variant: 'red'    },
  'kontrol-bekliyor': { label: 'Kontrol Bekliyor', variant: 'accent' },
};

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

const ISLEM_TIPI_OPTIONS = ['Tümü', 'Antrepo', 'İhracat', 'İthalat', 'Transit'];
const DURUM_OPTIONS      = ['Tümü', 'Onaya Hazır', 'Kontrol Bekliyor', 'Yazım Bekliyor', 'Kontrol Uyarısı'];
const TASIMA_OPTIONS     = ['Tümü', 'Karayolu', 'Denizyolu', 'Havayolu'];

export default function ListeView({ items, onSelectYazim, onRowUpload, onRowReminder }: ListeViewProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [islem,  setIslem]  = useState('Tümü');
  const [durum,  setDurum]  = useState('Tümü');
  const [tasima, setTasima] = useState('Tümü');

  const durumToStatus: Record<string, BeyannameListeStatus> = {
    'Onaya Hazır':      'onaya-hazir',
    'Kontrol Bekliyor': 'kontrol-bekliyor',
    'Yazım Bekliyor':   'yazim-bekliyor',
    'Kontrol Uyarısı':  'kontrol-uyarisi',
  };

  const tasimaToMode: Record<string, TransportMode> = {
    Karayolu:  'karayolu',
    Denizyolu: 'denizyolu',
    Havayolu:  'havayolu',
  };

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    if (q && !item.ref.toLowerCase().includes(q) && !item.customer.toLowerCase().includes(q)) return false;
    if (islem !== 'Tümü' && item.islemTipi !== islem) return false;
    if (durum !== 'Tümü' && item.status !== durumToStatus[durum]) return false;
    if (tasima !== 'Tümü' && item.transportMode !== tasimaToMode[tasima]) return false;
    return true;
  });

  const yazimCount   = items.filter((i) => i.status === 'yazim-bekliyor').length;
  const kontrolCount = items.filter((i) => i.status === 'kontrol-bekliyor').length;
  const uyariCount   = items.filter((i) => i.status === 'kontrol-uyarisi').length;
  const hazirCount   = items.filter((i) => i.status === 'onaya-hazir').length;

  const hasFilters = search !== '' || islem !== 'Tümü' || durum !== 'Tümü' || tasima !== 'Tümü';

  return (
    <div className="flex flex-col gap-4">
      {/* Stat row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="relative overflow-hidden">
          <StatCard value={items.length} label="Toplam Beyanname" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={yazimCount} label="Yazım Bekliyor" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={kontrolCount} label="Kontrol Bekliyor" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={uyariCount} label="Kontrol Uyarısı" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: uyariCount > 0 ? 'var(--hat-red)' : 'var(--ok)' }} />
        </div>
      </div>

      {/* Table card */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
        {/* Card header + filter bar */}
        <div className="border-b border-line bg-surface-2">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <span className="text-[13.5px] font-bold text-text-strong">Beyanname Listesi</span>
              <span className="ml-2 text-[11.5px] text-muted">
                {filtered.length !== items.length
                  ? `${filtered.length} / ${items.length} kayıt`
                  : `${items.length} kayıt`}
                {' · '}Yazım ve kontrol bekleyen dosyalar
              </span>
            </div>
            {hazirCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ok/10 border border-ok/20 text-[11.5px] font-semibold text-ok">
                {hazirCount} beyanname onaya hazır
              </span>
            )}
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2.5 px-5 pb-3 flex-wrap">
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

            {[
              { label: 'İşlem Tipi', value: islem,  options: ISLEM_TIPI_OPTIONS, onChange: setIslem  },
              { label: 'Durum',      value: durum,  options: DURUM_OPTIONS,      onChange: setDurum  },
              { label: 'Taşıma',     value: tasima, options: TASIMA_OPTIONS,     onChange: setTasima },
            ].map(({ label, value, options, onChange }) => (
              <select
                key={label}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 px-3 pr-7 text-[12.5px] border border-line-strong bg-surface rounded-lg text-text focus:outline-none focus:border-accent appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239aa39d' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                }}
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'Tümü' ? `${label}: Tümü` : opt}
                  </option>
                ))}
              </select>
            ))}

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setIslem('Tümü'); setDurum('Tümü'); setTasima('Tümü'); }}
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
              <Th>GTİP Uygunluk</Th>
              <Th>Statü</Th>
              <Th>İşlemler</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[12.5px] text-muted">
                  Filtrelerle eşleşen kayıt bulunamadı.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const cfg        = STATUS_CONFIG[item.status];
                const hasMissing = item.missingDocuments.length > 0;

                return (
                  <Tr
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => onSelectYazim(item)}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/evrak-hazirlik?ref=${item.ref}`);
                        }}
                        className="text-[12.5px] font-medium text-accent hover:underline focus:outline-none"
                      >
                        {item.docCount}/{item.totalDocCount}
                      </button>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/gtip-hazirlik?tab=fatura-kontrol&ref=${item.ref}`);
                        }}
                        className="text-left focus:outline-none"
                      >
                        <Pill variant={GTIP_STATUS_CONFIG[item.gtipStatus].variant}>
                          {GTIP_STATUS_CONFIG[item.gtipStatus].label}
                        </Pill>
                      </button>
                    </Td>
                    <Td>
                      <Pill variant={cfg.variant}>{cfg.label}</Pill>
                      {hasMissing && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle size={11} strokeWidth={2} className="text-warn" />
                          <span className="text-[10.5px] text-warn font-medium">
                            {item.missingDocuments.length} eksik
                          </span>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="mini"
                          variant="default"
                          icon={Upload}
                          onClick={() => onRowUpload(item)}
                          title="Dosya Yükle"
                        >
                          Yükle
                        </Button>
                        <Button
                          size="mini"
                          variant="default"
                          icon={Bell}
                          onClick={() => onRowReminder(item)}
                          disabled={!hasMissing}
                          title="Eksik Evrak Hatırlat"
                        >
                          Hatırlat
                        </Button>
                        {hasMissing && (
                          <Button
                            size="mini"
                            variant="warn"
                            icon={FileWarning}
                            onClick={() => onSelectYazim(item)}
                            title="Eksik evrakla yazım moduna geç"
                          >
                            Eksik Yaz
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
