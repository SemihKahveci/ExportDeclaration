import type { DocPreviewData } from '../../types';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';

interface PreviewDrawerProps {
  open: boolean;
  data: DocPreviewData | null;
  onClose: () => void;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line last:border-0 text-[13px]">
      <span className="text-muted text-[12.5px]">{label}</span>
      <span className={`font-semibold text-text-strong ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function PreviewDrawer({ open, data, onClose }: PreviewDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={data ? `${data.docName} Önizleme` : 'Doküman Önizleme'}
      subtitle="Parse edilen alanlar ve kaynak bilgisi"
      footer={<Button onClick={onClose}>Kapat</Button>}
    >
      {data && (
        <div className="grid grid-cols-2 gap-4">
          {/* Parsed fields card */}
          <div className="bg-surface-2 border border-line rounded-[9px] p-4">
            <h4 className="text-[13.5px] font-bold text-text-strong mb-3">{data.docName}</h4>
            <Row label="Kap"  value={data.kap}  mono />
            <Row label="Kilo" value={data.kilo} mono />
            <Row label="GTİP" value={data.gtip} mono />
            <p className="text-[11.5px] text-muted-2 italic mt-3">{data.parseSource}</p>
          </div>

          {/* Status card */}
          <div className="bg-surface-2 border border-line rounded-[9px] p-4">
            <h4 className="text-[13.5px] font-bold text-text-strong mb-3">Okunan Alanlar</h4>
            <Row label="Belge Durumu"  value={data.status} />
            <Row label="Geliş Kaynağı" value={data.origin} />
            <Row label="Son İşlem"     value={data.lastAction} />
            <p className="text-[11.5px] text-muted-2 italic mt-3">
              Bu alan sadece evrak önizleme içindir. Uyumsuzluk kararı üst sekmede yönetilir.
            </p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
