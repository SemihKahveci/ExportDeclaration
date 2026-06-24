import { AlertTriangle, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

export default function ImpersonationBanner() {
  const { impersonatingOrgId, setImpersonatingOrgId } = useAppContext();

  if (!impersonatingOrgId) return null;

  return (
    <div
      className="flex items-center gap-3 px-6 py-2.5 text-[13px] font-medium"
      style={{ background: 'var(--warn-tint)', borderBottom: '1px solid var(--warn)', color: 'var(--warn)' }}
    >
      <AlertTriangle size={15} strokeWidth={2} />
      <span className="flex-1">
        Organizasyon görünümündesiniz:{' '}
        <strong className="font-semibold">{impersonatingOrgId}</strong>
      </span>
      <button
        onClick={() => setImpersonatingOrgId(null)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium transition-colors hover:opacity-80"
        style={{ background: 'var(--warn)', color: 'white' }}
      >
        <X size={12} />
        Çıkış
      </button>
    </div>
  );
}
