import { useState, useRef } from 'react';
import { Zap, CheckCircle, AlertCircle, Phone, Upload } from 'lucide-react';
import type { DocProcess } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Field, Select, Textarea, Input } from '../../components/ui/Fields';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

// ─── Parsed field card ────────────────────────────────────────────────────────

function ParsedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#bcdcca] rounded-[7px] px-2.5 py-2">
      <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-muted">{label}</div>
      <div className="font-semibold text-text-strong text-[12.5px] mt-0.5">{value}</div>
      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-ok">
        <CheckCircle size={10} strokeWidth={2.5} />
        Okundu
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepNum({ n, active }: { n: number; active: boolean }) {
  return (
    <div
      className={[
        'w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[11px] font-bold mb-2 shrink-0',
        active
          ? 'bg-accent border-accent text-white'
          : 'bg-surface-2 border-line-strong text-muted',
      ].join(' ')}
    >
      {n}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ParseTestCardProps {
  docs: DocProcess[];
  onDocUpdated: (id: string, patch: Partial<DocProcess>) => void;
}

export default function ParseTestCard({ docs, onDocUpdated }: ParseTestCardProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedDocName, setSelectedDocName] = useState('');
  const [fileName, setFileName]               = useState('');
  const [parsing, setParsing]                 = useState(false);
  const [result, setResult]                   = useState<'success' | 'fail' | null>(null);
  const [talepNote, setTalepNote]             = useState('');
  const [talepMail, setTalepMail]             = useState('');
  const [talepSent, setTalepSent]             = useState(false);

  const parseableDocs = docs.filter((d) => d.parseable === 'Evet');
  const hasDoc  = !!selectedDocName;
  const hasFile = !!fileName;
  const canParse = hasDoc && hasFile && !parsing;

  function handleDocChange(name: string) {
    setSelectedDocName(name);
    setFileName('');
    setResult(null);
    setTalepSent(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setTalepSent(false);
    e.target.value = '';
  }

  function handleDropZoneClick() {
    if (!hasDoc) return;
    fileInputRef.current?.click();
  }

  function handleParse() {
    if (!canParse) return;
    setParsing(true);

    setTimeout(() => {
      setParsing(false);
      const doc = docs.find((d) => d.name === selectedDocName);
      const forceOk = doc?.testResult === 'Başarılı';
      const ok = forceOk || Math.random() > 0.45;

      setResult(ok ? 'success' : 'fail');
      setTalepSent(false);

      if (ok) {
        const rate = '%' + (88 + Math.floor(Math.random() * 10));
        if (doc) onDocUpdated(doc.id, { testResult: 'Başarılı', successRate: rate });
        toast('Parse başarılı · ' + selectedDocName + ' alanları okundu');
      } else {
        if (doc) onDocUpdated(doc.id, { testResult: 'Kısmi Başarılı' });
      }
    }, 1800);
  }

  function handleTalep() {
    if (!talepNote.trim()) { toast('Lütfen sorun açıklaması girin'); return; }
    setTalepSent(true);
    toast('Destek talebi iletildi · ' + selectedDocName);
  }

  return (
    <Card className="mb-4">
      <CardHead
        title="Parse Testi"
        sub="Evrak yükleyerek sistemin parse başarısını anlık test edin."
      />

      {/* Steps */}
      <div className="grid grid-cols-3 border-b border-line">
        {/* Step 1 */}
        <div className="px-5 py-4 border-r border-line">
          <StepNum n={1} active />
          <div className="font-bold text-[12px] text-text-strong mb-1.5">Evrak Tipi Seç</div>
          <Select
            value={selectedDocName}
            onChange={(e) => handleDocChange(e.target.value)}
            className="!text-[13px] mt-1"
          >
            <option value="">— Seç —</option>
            {parseableDocs.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
                {d.testResult === 'Başarılı' ? ' · ' + d.successRate : d.testResult === 'Test Bekliyor' ? ' · Test yok' : ''}
              </option>
            ))}
          </Select>
        </div>

        {/* Step 2 */}
        <div className="px-5 py-4 border-r border-line">
          <StepNum n={2} active={hasDoc} />
          <div className="font-bold text-[12px] text-text-strong mb-1.5">Dosya Yükle</div>
          <button
            onClick={handleDropZoneClick}
            className={[
              'w-full mt-2 border-[1.5px] border-dashed rounded-[9px] p-4 text-center transition-colors',
              !hasDoc ? 'opacity-50 cursor-not-allowed border-line-strong bg-surface-2' :
              hasFile ? 'border-accent bg-accent-tint cursor-pointer' :
              'border-line-strong bg-surface-2 hover:border-accent hover:bg-accent-tint cursor-pointer',
            ].join(' ')}
          >
            <Upload size={20} strokeWidth={1.6} className={`mx-auto mb-1.5 ${hasFile ? 'text-accent-d' : 'text-muted-2'}`} />
            <div className={`text-[12.5px] ${hasFile ? 'text-accent-d font-semibold' : 'text-muted'}`}>
              {hasFile ? fileName : 'Dosya seç veya sürükle'}
            </div>
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
        </div>

        {/* Step 3 */}
        <div className="px-5 py-4">
          <StepNum n={3} active={hasDoc && hasFile} />
          <div className="font-bold text-[12px] text-text-strong mb-1">Parse Et</div>
          <div className="text-[12px] text-muted mb-3">Evrak yüklendikten sonra parse testi başlatılır.</div>
          <Button
            variant="primary"
            icon={Zap}
            disabled={!canParse}
            onClick={handleParse}
            className="w-full justify-center"
          >
            {parsing ? 'Analiz ediliyor…' : 'Parse Et'}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result === 'success' && (
        <CardBody>
          <div className="bg-ok-tint border border-[#bcdcca] rounded-[9px] p-4 mb-1">
            <div className="flex items-center gap-2 font-bold text-[14px] text-ok mb-3">
              <CheckCircle size={18} strokeWidth={2.4} />
              Parse başarılı — {selectedDocName}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ParsedField label="Gönderici"  value="VALEO EAUTO…" />
              <ParsedField label="Alıcı"      value="ARÇELİK A.Ş." />
              <ParsedField label="Fatura No"  value="INV-2026-4821" />
              <ParsedField label="Tarih"      value="22.05.2026" />
              <ParsedField label="Tutar"      value="€ 14.820,00" />
              <ParsedField label="GTİP Satırı" value="3 kalem" />
            </div>
          </div>
        </CardBody>
      )}

      {result === 'fail' && !talepSent && (
        <CardBody>
          <div className="bg-[#fbecec] border border-[#f0cccc] rounded-[9px] p-4 mb-3">
            <div className="flex items-center gap-2 font-bold text-[14px] text-hat-red mb-1.5">
              <AlertCircle size={18} strokeWidth={2} />
              Parse kısmen başarısız — {selectedDocName}
            </div>
            <div className="text-[13px] text-[#7a2e2e]">
              Bazı alanlar okunamadı veya beklenen formatta değil. Destek talebi oluşturarak ekibimize iletebilirsiniz.
            </div>
          </div>

          <div className="bg-warn-tint border border-[#e8d0a2] rounded-[9px] p-4">
            <div className="flex items-center gap-2 font-bold text-[13.5px] text-[#7a5a16] mb-3">
              <Phone size={16} strokeWidth={2} />
              Talepte Bulun
            </div>
            <div className="space-y-3">
              <Field label="Evrak Tipi">
                <input
                  readOnly
                  value={selectedDocName}
                  className="w-full text-[13px] border border-line-strong rounded-[8px] px-3 py-2 bg-surface-2 text-text"
                />
              </Field>
              <Field label="Yüklenen Dosya">
                <input
                  readOnly
                  value={fileName}
                  className="w-full text-[13px] border border-line-strong rounded-[8px] px-3 py-2 bg-surface-2 text-text"
                />
              </Field>
              <Field label="Sorun Açıklaması" htmlFor="talep-note">
                <Textarea
                  id="talep-note"
                  value={talepNote}
                  onChange={(e) => setTalepNote(e.target.value)}
                  rows={3}
                  placeholder="Hangi alanın okunmadığını veya hatalı okunduğunu açıklayın…"
                />
              </Field>
              <Field label="İletişim Maili" htmlFor="talep-mail">
                <Input
                  id="talep-mail"
                  value={talepMail}
                  onChange={(e) => setTalepMail(e.target.value)}
                  placeholder="mail@firma.com"
                />
              </Field>
              <Button variant="primary" icon={Zap} onClick={handleTalep}>
                Talebi Gönder
              </Button>
            </div>
          </div>
        </CardBody>
      )}

      {result === 'fail' && talepSent && (
        <CardBody>
          <div className="flex items-center gap-2.5 font-bold text-ok py-2">
            <CheckCircle size={18} strokeWidth={2.4} />
            Talep gönderildi · En kısa sürede geri döneceğiz.
          </div>
        </CardBody>
      )}
    </Card>
  );
}
