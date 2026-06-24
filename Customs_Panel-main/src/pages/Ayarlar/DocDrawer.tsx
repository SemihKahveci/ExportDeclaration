import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import UploadBox from '../../components/ui/UploadBox';
import type { DocProcess, DocParseStatus, DocTestResult } from '../../types';

const ALL_FORMATS = ['XML', 'PDF', 'JPG', 'PNG', 'XLSX'] as const;

// ─── Format checkbox grid ─────────────────────────────────────────────────────

function FormatGrid({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(f: string) {
    onChange(selected.includes(f) ? selected.filter((x) => x !== f) : [...selected, f]);
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {ALL_FORMATS.map((f) => {
        const on = selected.includes(f);
        return (
          <label
            key={f}
            className={[
              'flex items-center gap-2 text-[13px] font-medium px-2.5 py-2 border rounded-[7px] cursor-pointer transition-colors',
              on ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong bg-surface text-text hover:border-muted-2',
            ].join(' ')}
          >
            <span
              onClick={() => toggle(f)}
              className={[
                'w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors',
                on ? 'bg-accent border-accent' : 'border-line-strong',
              ].join(' ')}
            >
              {on && <Check size={10} strokeWidth={3} className="text-white" />}
            </span>
            <span onClick={() => toggle(f)}>{f}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocDrawerProps {
  open: boolean;
  initial?: DocProcess;
  onClose: () => void;
  onSave: (data: Omit<DocProcess, 'id'>) => void;
}

// Parse formats string like "XML / PDF / JPG" into array
function parseFormats(fmt: string): string[] {
  return fmt.split(/[\s/]+/).map((s) => s.trim()).filter(Boolean);
}

export default function DocDrawer({ open, initial, onClose, onSave }: DocDrawerProps) {
  const [name, setName]           = useState('');
  const [process, setProcess]     = useState('Evrak Hazırlık');
  const [formats, setFormats]     = useState<string[]>([]);
  const [parseable, setParseable] = useState<DocParseStatus>('Evet');
  const [testResult, setTestResult] = useState<DocTestResult>('Test Bekliyor');
  const [successRate, setSuccessRate] = useState('');
  const [supportNote, setSupportNote] = useState('');
  const [docStatus, setDocStatus] = useState<'Aktif' | 'Pasif'>('Aktif');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setProcess(initial.process);
      setFormats(parseFormats(initial.format));
      setParseable(initial.parseable);
      setTestResult(initial.testResult);
      setSuccessRate(initial.successRate === '—' ? '' : initial.successRate);
      setSupportNote(initial.supportNote);
      setDocStatus(initial.status);
    } else {
      setName(''); setProcess('Evrak Hazırlık'); setFormats([]);
      setParseable('Evet'); setTestResult('Test Bekliyor');
      setSuccessRate(''); setSupportNote(''); setDocStatus('Aktif');
    }
  }, [open, initial]);

  function handleSave() {
    onSave({
      name,
      process,
      format: formats.join(' / ') || '—',
      parseable,
      testResult,
      successRate: successRate || '—',
      supportNote,
      status: docStatus,
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? 'Evrak Tipi Düzenle' : 'Yeni Evrak Tipi'}
      subtitle={initial?.name}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={handleSave}>Kaydet</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Evrak Tipi" htmlFor="d-name">
            <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fatura, CMR…" />
          </Field>
          <Field label="Kullanıldığı Süreç" htmlFor="d-process">
            <Select id="d-process" value={process} onChange={(e) => setProcess(e.target.value)}>
              <option>GTİP Hazırlık</option>
              <option>Evrak Hazırlık</option>
              <option>Beyanname Yazım</option>
              <option>Tescil</option>
              <option>Kapanış</option>
            </Select>
          </Field>
        </div>

        <Field label="Desteklenen Formatlar">
          <div className="mt-1">
            <FormatGrid selected={formats} onChange={setFormats} />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Parse Edilir mi?" htmlFor="d-parse">
            <Select id="d-parse" value={parseable} onChange={(e) => setParseable(e.target.value as DocParseStatus)}>
              <option>Evet</option>
              <option>Hayır</option>
            </Select>
          </Field>
          <Field label="Son Test Sonucu" htmlFor="d-test">
            <Select id="d-test" value={testResult} onChange={(e) => setTestResult(e.target.value as DocTestResult)}>
              <option>Test Bekliyor</option>
              <option>Başarılı</option>
              <option>Kısmi Başarılı</option>
              <option>Başarısız</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Başarı Oranı" htmlFor="d-rate">
            <Input id="d-rate" value={successRate} onChange={(e) => setSuccessRate(e.target.value)} placeholder="%85" />
          </Field>
          <Field label="Durum" htmlFor="d-status">
            <Select id="d-status" value={docStatus} onChange={(e) => setDocStatus(e.target.value as 'Aktif' | 'Pasif')}>
              <option>Aktif</option>
              <option>Pasif</option>
            </Select>
          </Field>
        </div>

        <Field label="Örnek Evrak Yükle">
          <UploadBox
            title="Örnek evrak yükle"
            hint="PDF, JPG, PNG, XML, XLSX"
            onFiles={() => {}}
          />
        </Field>

        <Field label="Destek / Not" htmlFor="d-note">
          <Textarea id="d-note" value={supportNote} onChange={(e) => setSupportNote(e.target.value)} rows={3} />
        </Field>
      </div>
    </Drawer>
  );
}
