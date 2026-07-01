import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import UploadBox from '../../components/ui/UploadBox';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onTemplateDownload: () => void;
  onImport: (file: File) => Promise<void>;
}

export default function ImportModal({
  open,
  onClose,
  onTemplateDownload,
  onImport,
}: ImportModalProps) {
  const [importing, setImporting] = useState(false);

  async function handleFiles(files: File[]) {
    if (!files.length || importing) return;
    setImporting(true);
    try {
      await onImport(files[0]);
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Excel ile İçe Aktar">
      <div className="space-y-6">
        {/* Step 1 */}
        <div className="flex gap-4">
          <span className="w-[26px] h-[26px] rounded-full bg-accent-tint text-accent font-bold text-[13px] flex items-center justify-center shrink-0">
            1
          </span>
          <div>
            <p className="font-bold text-text-strong text-[14px]">Şablonu indir</p>
            <p className="text-muted text-[12.5px] mt-0.5">
              Sütunlar: Malzeme No, Malzeme Tanımı, GTIP
            </p>
            <div className="mt-3">
              <Button icon={Download} onClick={onTemplateDownload} disabled={importing}>
                Excel Şablonu İndir
              </Button>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-4">
          <span className="w-[26px] h-[26px] rounded-full bg-accent-tint text-accent font-bold text-[13px] flex items-center justify-center shrink-0">
            2
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-text-strong text-[14px]">Doldurulmuş dosyayı yükle</p>
            <p className="text-muted text-[12.5px] mt-0.5">Şablonu doldurduktan sonra buraya yükle.</p>
            <div className="mt-3">
              {importing ? (
                <div className="flex items-center gap-2 text-muted text-[13px] py-6 justify-center border border-dashed border-line-strong rounded-[10px]">
                  <Loader2 size={18} className="animate-spin" />
                  Excel okunuyor ve kayıtlar ekleniyor…
                </div>
              ) : (
                <UploadBox
                  title="Dosya seç veya buraya sürükle"
                  hint=".xlsx, .xls"
                  onFiles={handleFiles}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
