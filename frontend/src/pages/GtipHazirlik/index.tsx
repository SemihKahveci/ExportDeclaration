import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Info } from 'lucide-react';
import type { GtipDeclaration, GtipPageStats } from '../../types';
import { gtipService } from '../../services/gtip';
import StatCard from '../../components/ui/StatCard';
import DeclarationControlTab from './DeclarationControlTab';

// ─── Tab tooltip ──────────────────────────────────────────────────────────────

const INVOICE_TOOLTIP =
  'Bu sekme fatura üzerinden GTİP girişi yaptırmaz. Fatura yükleme ve GTİP okuma ilk dosya ekranında yapılır. Burada seçili beyannamenin kalemleri görüntülenir ve faturadan gelen GTİP ile sistemdeki GTİP karşılaştırılır.';

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [tipVisible, setTipVisible] = useState(false);

  return (
    <div className="relative flex items-center">
      <button
        onClick={onClick}
        className={[
          'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors select-none',
          active
            ? 'border-accent text-accent'
            : 'border-transparent text-muted hover:text-text hover:border-line-strong',
        ].join(' ')}
      >
        {label}
      </button>

      <div
        className="relative flex items-center mr-2"
        onMouseEnter={() => setTipVisible(true)}
        onMouseLeave={() => setTipVisible(false)}
      >
        <Info
          size={14}
          strokeWidth={1.75}
          className={`cursor-default transition-colors ${active ? 'text-accent opacity-70 hover:opacity-100' : 'text-muted-2 hover:text-muted'}`}
        />
        {tipVisible && (
          <div
            className="absolute left-1/2 top-full mt-2 z-50 pointer-events-none"
            style={{ transform: 'translateX(-50%)' }}
          >
            <div
              className="mx-auto mb-[-1px] w-0 h-0"
              style={{
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '6px solid var(--line-strong)',
                width: 0,
                marginLeft: '50%',
                transform: 'translateX(-50%)',
              }}
            />
            <div
              className="bg-surface border border-line-strong rounded-[8px] shadow-card px-3.5 py-3 text-[12.5px] text-text leading-relaxed"
              style={{ maxWidth: 380, minWidth: 260 }}
            >
              {INVOICE_TOOLTIP}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GtipHazirlikPage() {
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get('ref');

  const [loading, setLoading]               = useState(true);
  const [declarations, setDeclarations]     = useState<GtipDeclaration[]>([]);
  const [selectedDeclId, setSelectedDeclId] = useState('');
  const [stats, setStats]                   = useState<GtipPageStats | null>(null);

  useEffect(() => {
    Promise.all([
      gtipService.getGtipDeclarations(),
      gtipService.getPageStats(),
    ]).then(([decls, pageStats]) => {
      setDeclarations(decls);
      const matched = refParam ? decls.find((d) => d.ref === refParam) : null;
      setSelectedDeclId(matched?.id ?? decls[0]?.id ?? '');
      setStats(pageStats);
      setLoading(false);
    });
  }, []);

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
          GTİP Hazırlık
        </h1>
        <p className="text-[12.5px] text-muted mt-1 max-w-[560px]">
          Fatura üzerinden GTİP doğrulama. Beyanname kalemlerinin GTİP uyumu burada kontrol edilir.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.declarationControl} label="Beyanname GTİP Kontrolü" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.pendingRequests} label="Kontrol Bekleyen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.missingGtip} label="Eksik GTİP" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.mismatchedRecords} label="Uyumsuz Kayıt" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-red)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Single tab header */}
      <div className="flex border-b border-line mb-5">
        <TabButton label="Fatura GTİP Kontrolü" active={true} onClick={() => {}} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[13px]">Yükleniyor…</span>
        </div>
      ) : (
        <DeclarationControlTab
          declarations={declarations}
          selectedId={selectedDeclId}
          onSelect={setSelectedDeclId}
        />
      )}
    </div>
  );
}
