import { useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  deleteIhracatExcelMusteri,
  saveIhracatExcelGenel,
  saveIhracatExcelMusteri,
  type IhracatExcelAyar,
  type IhracatExcelKural,
  type IhracatExcelMusteriKural,
  type KapKaynak,
  type TasimaSekli,
} from '../../api/ihracatExcelAyarApi';
import { apiGetJson } from '../../api/apiClient';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../api/apiClient';

const TASIMA: TasimaSekli[] = ['Karayolu', 'Havayolu', 'Denizyolu'];

type GenelDraft = Omit<IhracatExcelKural, 'id'> & { id?: string; key: string };
type MusteriDraft = Omit<IhracatExcelMusteriKural, 'id'> & { id?: string };

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function emptyGenel(): GenelDraft {
  return {
    key: `g-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tasimaSekilleri: ['Karayolu'],
    kapKaynak: 'fatura',
    kapSabit: '',
    ambalaj: '',
  };
}

interface ExcelAyarTabProps {
  ayar: IhracatExcelAyar;
  onChange: (next: IhracatExcelAyar) => void;
}

export default function ExcelAyarTab({ ayar, onChange }: ExcelAyarTabProps) {
  const { toast } = useToast();
  const [genel, setGenel] = useState<GenelDraft[]>(
    () => ayar.genel.map((row) => ({ ...row, key: row.id }))
  );
  const [musteri, setMusteri] = useState<IhracatExcelMusteriKural[]>(ayar.musteri);
  const [savingGenel, setSavingGenel] = useState(false);
  const [draft, setDraft] = useState<MusteriDraft | null>(null);
  const [gonderenQ, setGonderenQ] = useState('');
  const [gonderenHits, setGonderenHits] = useState<Array<{ gonderenNo: number; unvan: string; label: string }>>([]);

  const uncovered = useMemo(() => {
    const used = new Set(genel.flatMap((row) => row.tasimaSekilleri));
    return TASIMA.filter((mode) => !used.has(mode));
  }, [genel]);

  function toggleMode(rowKey: string, mode: TasimaSekli) {
    setGenel((prev) => prev.map((row) => {
      if (row.key !== rowKey) return row;
      const has = row.tasimaSekilleri.includes(mode);
      const next = has
        ? row.tasimaSekilleri.filter((item) => item !== mode)
        : [...row.tasimaSekilleri, mode];
      return { ...row, tasimaSekilleri: next.length ? next : row.tasimaSekilleri };
    }));
  }

  async function handleSaveGenel() {
    setSavingGenel(true);
    try {
      const next = await saveIhracatExcelGenel(genel.map(({ id, tasimaSekilleri, kapKaynak, kapSabit, ambalaj }) => ({
        id,
        tasimaSekilleri,
        kapKaynak,
        kapSabit,
        ambalaj,
      })));
      onChange(next);
      setGenel(next.genel.map((row) => ({ ...row, key: row.id })));
      setMusteri(next.musteri);
      toast('Genel değerler kaydedildi');
    } catch (err) {
      toast(errorMessage(err, 'Genel değerler kaydedilemedi'));
    } finally {
      setSavingGenel(false);
    }
  }

  async function searchGonderen(q: string) {
    setGonderenQ(q);
    if (!q.trim()) {
      setGonderenHits([]);
      return;
    }
    try {
      const result = await apiGetJson<{ items: Array<{ gonderenNo: number; unvan: string; label: string }> }>(
        `/api/evrim-lookup/gonderen?q=${encodeURIComponent(q)}&limit=12`
      );
      setGonderenHits(result.items);
    } catch {
      setGonderenHits([]);
    }
  }

  async function saveMusteriDraft() {
    if (!draft) return;
    try {
      const next = await saveIhracatExcelMusteri(draft);
      onChange(next);
      setMusteri(next.musteri);
      setDraft(null);
      setGonderenHits([]);
      setGonderenQ('');
      toast('Müşteri kuralı kaydedildi');
    } catch (err) {
      toast(errorMessage(err, 'Müşteri kuralı kaydedilemedi'));
    }
  }

  async function removeMusteri(id: string) {
    try {
      const next = await deleteIhracatExcelMusteri(id);
      onChange(next);
      setMusteri(next.musteri);
      toast('Müşteri kuralı kaldırıldı');
    } catch (err) {
      toast(errorMessage(err, 'Kural silinemedi'));
    }
  }

  const fieldLbl = 'block text-[11px] font-bold uppercase tracking-[.05em] text-muted mb-1.5';
  const fieldCtrl = 'w-full h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-text focus:outline-none focus:border-accent';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-bold text-text-strong">İhracat Excel Aktarımı</h2>
        <p className="text-[12.5px] text-muted mt-1 max-w-[620px] leading-relaxed">
          Evrim Excel K (kap cinsi) ve W (ambalaj) kolonları. İmalatçı (P/T) burada ayarlanmaz —
          menşeye göre tip (TR→I, diğer→T), ID yoksa gönderici yazılır. Öncelik: müşteriye özel → genel.
        </p>
      </div>

      <Card>
        <CardHead
          title="Genel değerler"
          sub="Taşıma şekline göre bütün müşterilere uygulanır"
          actions={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                icon={Plus}
                disabled={uncovered.length === 0}
                onClick={() => setGenel((prev) => [...prev, { ...emptyGenel(), tasimaSekilleri: [uncovered[0]!] }])}
              >
                Kural Ekle
              </Button>
              <Button size="sm" variant="primary" icon={Save} disabled={savingGenel} onClick={() => void handleSaveGenel()}>
                Kaydet
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-3">
          {genel.length === 0 && (
            <p className="text-[13px] text-muted">Henüz genel kural yok.</p>
          )}
          {genel.map((row) => (
            <div key={row.key} className="rounded-[10px] border border-line bg-surface p-3.5 space-y-3 shadow-card">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Taşıma şekli">
                {TASIMA.map((mode) => {
                  const on = row.tasimaSekilleri.includes(mode);
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={on}
                      className={`h-8 px-3 rounded-lg text-[12.5px] font-semibold border ${on ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong text-muted bg-surface'}`}
                      onClick={() => toggleMode(row.key, mode)}
                    >
                      {on ? '✓ ' : ''}{mode}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <label>
                  <span className={fieldLbl}>Kap cinsi · K</span>
                  <select
                    className={fieldCtrl}
                    value={row.kapKaynak === 'fatura' ? 'fatura' : row.kapSabit || 'BI'}
                    onChange={(e) => {
                      const value = e.target.value;
                      setGenel((prev) => prev.map((item) => item.key === row.key
                        ? value === 'fatura'
                          ? { ...item, kapKaynak: 'fatura' as KapKaynak, kapSabit: '' }
                          : { ...item, kapKaynak: 'sabit' as KapKaynak, kapSabit: value }
                        : item));
                    }}
                  >
                    <option value="fatura">Faturadaki</option>
                    {['BI', 'BX', 'PO', 'PX'].map((kod) => (
                      <option key={kod} value={kod}>Sabit · {kod}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={fieldLbl}>Ambalaj · W</span>
                  <input
                    className={`${fieldCtrl} font-mono`}
                    value={row.ambalaj}
                    onChange={(e) => setGenel((prev) => prev.map((item) => item.key === row.key ? { ...item, ambalaj: e.target.value } : item))}
                  />
                </label>
                <div className="flex justify-end pb-0.5">
                  <Button
                    size="sm"
                    variant="default"
                    icon={Trash2}
                    onClick={() => setGenel((prev) => prev.filter((item) => item.key !== row.key))}
                  >
                    Kaldır
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {uncovered.length > 0 && (
            <p className="text-[12.5px] font-semibold text-warn">
              {uncovered.join(', ')} için genel kural yok; kap faturadan alınır, ambalaj boş kalır.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="Müşteriye özel değerler"
          sub="Seçili taşıma şekillerinde genel değerin yerine geçer"
          actions={
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              disabled={!!draft}
              onClick={() => setDraft({
                gonderenNo: 0,
                gonderenUnvan: '',
                tasimaSekilleri: ['Karayolu'],
                kapKaynak: 'fatura',
                kapSabit: '',
                ambalaj: '',
              })}
            >
              Müşteri Ekle
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {draft && (
            <div className="rounded-[10px] border border-accent/40 bg-accent-tint/30 p-3.5 space-y-3">
              <label>
                <span className={fieldLbl}>Müşteri (Evrim gönderici)</span>
                <input
                  className={fieldCtrl}
                  placeholder="Ad veya Evrim ID"
                  value={gonderenQ}
                  onChange={(e) => void searchGonderen(e.target.value)}
                />
              </label>
              {gonderenHits.length > 0 && (
                <div className="max-h-36 overflow-auto rounded-lg border border-line bg-surface">
                  {gonderenHits.map((hit) => (
                    <button
                      key={hit.gonderenNo}
                      type="button"
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-2 border-b border-line last:border-0"
                      onClick={() => {
                        setDraft((prev) => prev ? { ...prev, gonderenNo: hit.gonderenNo, gonderenUnvan: hit.unvan } : prev);
                        setGonderenQ(hit.label);
                        setGonderenHits([]);
                      }}
                    >
                      {hit.label}
                    </button>
                  ))}
                </div>
              )}
              {draft.gonderenNo > 0 && (
                <p className="text-[12.5px] font-semibold text-ok">{draft.gonderenNo} – {draft.gonderenUnvan}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {TASIMA.map((mode) => {
                  const on = draft.tasimaSekilleri.includes(mode);
                  return (
                    <button
                      key={mode}
                      type="button"
                      className={`h-8 px-3 rounded-lg text-[12.5px] font-semibold border ${on ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong text-muted bg-surface'}`}
                      onClick={() => setDraft((prev) => {
                        if (!prev) return prev;
                        const has = prev.tasimaSekilleri.includes(mode);
                        const next = has ? prev.tasimaSekilleri.filter((m) => m !== mode) : [...prev.tasimaSekilleri, mode];
                        return { ...prev, tasimaSekilleri: next.length ? next : prev.tasimaSekilleri };
                      })}
                    >
                      {on ? '✓ ' : ''}{mode}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label>
                  <span className={fieldLbl}>Kap cinsi · K</span>
                  <select
                    className={fieldCtrl}
                    value={draft.kapKaynak === 'fatura' ? 'fatura' : draft.kapSabit || 'BI'}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDraft((prev) => prev ? (
                        value === 'fatura'
                          ? { ...prev, kapKaynak: 'fatura', kapSabit: '' }
                          : { ...prev, kapKaynak: 'sabit', kapSabit: value }
                      ) : prev);
                    }}
                  >
                    <option value="fatura">Faturadaki</option>
                    {['BI', 'BX', 'PO', 'PX'].map((kod) => (
                      <option key={kod} value={kod}>Sabit · {kod}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={fieldLbl}>Ambalaj · W</span>
                  <input
                    className={`${fieldCtrl} font-mono`}
                    placeholder="Ambalaj (W)"
                    value={draft.ambalaj}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, ambalaj: e.target.value } : prev)}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="default" onClick={() => { setDraft(null); setGonderenHits([]); setGonderenQ(''); }}>Vazgeç</Button>
                <Button size="sm" variant="primary" disabled={!draft.gonderenNo} onClick={() => void saveMusteriDraft()}>Ekle</Button>
              </div>
            </div>
          )}

          {musteri.length === 0 && !draft && (
            <p className="text-[13px] text-muted">Müşteriye özel kural yok.</p>
          )}
          {musteri.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-3 shadow-card">
              <div>
                <p className="text-[14px] font-bold text-text-strong">{row.gonderenNo} – {row.gonderenUnvan || 'Müşteri'}</p>
                <p className="text-[12.5px] text-muted mt-0.5">
                  {row.tasimaSekilleri.join(', ')} · Kap: {row.kapKaynak === 'fatura' ? 'Faturadaki' : row.kapSabit} · W: {row.ambalaj || '—'}
                </p>
              </div>
              <Button size="sm" variant="default" icon={Trash2} onClick={() => void removeMusteri(row.id)}>Kaldır</Button>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
