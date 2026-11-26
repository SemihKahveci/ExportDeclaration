import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Send } from 'lucide-react';
import type { BeyannameLineItem, BeyannameRecord } from '../../types';
import { apiGetJson, apiPostJson } from '../../api/apiClient';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import { applyWeightQuantity } from './writingDraft';

type GonderenHit = { gonderenNo: number; unvan: string; vergiNo: string; label: string };
type AliciHit = {
  aliciNo: number;
  aliciUnvan: string;
  adres: string;
  label: string;
  ulke?: string;
};
type CodeOptions = {
  miktar: Array<{ ediKodu: string; label: string }>;
  kap: Array<{ kod: string; label: string }>;
  mense: Array<{ ulkeNo: string; label: string }>;
};

const EVRIM_GONDEREN_KEY = 'Gönderici Evrim No';
const EVRIM_ALICI_KEY = 'Alıcı Evrim No';

function fv(fields: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = (fields[key] ?? '').trim();
    if (value && value !== '—' && value !== '-') return value;
  }
  return '';
}

function parseStoredId(raw: string): number | null {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function resolveMiktarValue(raw: string, options: Array<{ ediKodu: string; label: string }>): string {
  const text = fv({ v: raw }, 'v');
  if (!text) return '';
  if (options.some((opt) => opt.ediKodu === text)) return text;
  const lower = text.toLocaleLowerCase('tr-TR');
  const hit = options.find((opt) => {
    const label = opt.label.toLocaleLowerCase('tr-TR');
    return label === lower || label.endsWith(`· ${lower}`) || label.includes(lower) || opt.ediKodu.toLowerCase() === lower;
  });
  return hit?.ediKodu ?? '';
}

function resolveMenseValue(raw: string, options: Array<{ ulkeNo: string; label: string }>): string {
  const text = fv({ v: raw }, 'v');
  if (!text) return '';
  if (options.some((opt) => opt.ulkeNo === text)) return text;
  const lower = text.toLocaleLowerCase('tr-TR');
  const hit = options.find((opt) => {
    const label = opt.label.toLocaleLowerCase('tr-TR');
    return label === lower || label.startsWith(`${lower} ·`) || label.includes(lower) || opt.ulkeNo === text.padStart(3, '0');
  });
  return hit?.ulkeNo ?? '';
}

function resolveKapValue(raw: string, options: Array<{ kod: string; label: string }>): string {
  const text = fv({ v: raw }, 'v');
  if (!text) return '';
  if (options.some((opt) => opt.kod === text)) return text;
  const lower = text.toLocaleLowerCase('tr-TR');
  const hit = options.find((opt) => opt.label.toLocaleLowerCase('tr-TR').includes(lower) || opt.kod.toLowerCase() === lower);
  return hit?.kod ?? '';
}

interface ExportWritingPanelProps {
  record: BeyannameRecord;
  fieldValues: Record<string, string>;
  lineItems: BeyannameLineItem[];
  hasViewedPreview: boolean;
  locked?: boolean;
  onFieldChange: (name: string, value: string) => void;
  onLineChange: (index: number, patch: Partial<BeyannameLineItem>) => void;
  onLineBlur: () => void;
  onViewDeclaration: () => void;
  onSendToControl: () => void;
  onRewrite: () => void;
}

export default function ExportWritingPanel({
  record,
  fieldValues,
  lineItems,
  hasViewedPreview,
  locked = false,
  onFieldChange,
  onLineChange,
  onLineBlur,
  onViewDeclaration,
  onSendToControl,
  onRewrite,
}: ExportWritingPanelProps) {
  const [filtre, setFiltre] = useState<'tumu' | 'sorun'>('tumu');
  const [doviz, setDoviz] = useState(fv(fieldValues, 'Döviz Cinsi') || 'EUR');
  const [gonderenQ, setGonderenQ] = useState(fv(fieldValues, 'Gönderici / İhracatçı Ünvanı'));
  const [gonderenNo, setGonderenNo] = useState<number | null>(() => parseStoredId(fv(fieldValues, EVRIM_GONDEREN_KEY)));
  const [gonderenHits, setGonderenHits] = useState<GonderenHit[]>([]);
  const [aliciQ, setAliciQ] = useState(fv(fieldValues, 'Alıcı / İthalatçı Ünvanı'));
  const [aliciNo, setAliciNo] = useState<number | null>(() => parseStoredId(fv(fieldValues, EVRIM_ALICI_KEY)));
  const [aliciHits, setAliciHits] = useState<AliciHit[]>([]);
  const [aliciWarn, setAliciWarn] = useState('');
  const [codes, setCodes] = useState<CodeOptions>({ miktar: [], kap: [], mense: [] });

  useEffect(() => {
    void apiGetJson<CodeOptions>('/api/evrim-lookup/code-options')
      .then(setCodes)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setDoviz(fv(fieldValues, 'Döviz Cinsi') || 'EUR');
    setGonderenQ(fv(fieldValues, 'Gönderici / İhracatçı Ünvanı'));
    setAliciQ(fv(fieldValues, 'Alıcı / İthalatçı Ünvanı'));
    setGonderenNo(parseStoredId(fv(fieldValues, EVRIM_GONDEREN_KEY)));
    setAliciNo(parseStoredId(fv(fieldValues, EVRIM_ALICI_KEY)));
    setGonderenHits([]);
    setAliciHits([]);
    setAliciWarn('');
  }, [record.id]);

  // VKN / ünvan ile göndericiyi otomatik öner; alıcıyı eşlemeyi dene.
  useEffect(() => {
    if (gonderenNo != null) return;
    const name = fv(fieldValues, 'Gönderici / İhracatçı Ünvanı');
    if (!name) return;
    let cancelled = false;
    void apiGetJson<{ items: GonderenHit[] }>(`/api/evrim-lookup/gonderen?q=${encodeURIComponent(name)}&limit=5`)
      .then((result) => {
        if (cancelled || result.items.length !== 1) return;
        const hit = result.items[0];
        setGonderenNo(hit.gonderenNo);
        setGonderenQ(hit.label);
        onFieldChange(EVRIM_GONDEREN_KEY, String(hit.gonderenNo));
        onFieldChange('Gönderici / İhracatçı Ünvanı', hit.unvan);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [record.id]);

  useEffect(() => {
    if (gonderenNo == null || aliciNo != null) return;
    const name = fv(fieldValues, 'Alıcı / İthalatçı Ünvanı');
    const adres = fv(fieldValues, 'Alıcı / İthalatçı Adresi');
    if (!name) return;
    let cancelled = false;
    void apiPostJson<
      | { status: 'matched'; row: AliciHit }
      | { status: 'ambiguous'; rows: AliciHit[] }
      | { status: 'not_found' }
    >('/api/evrim-lookup/alici/match', {
      musteriNo: gonderenNo,
      aliciUnvan: name,
      adres,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'matched') {
          const row = result.row;
          setAliciNo(row.aliciNo);
          setAliciQ(`${row.aliciNo} – ${row.aliciUnvan}`);
          setAliciWarn('');
          onFieldChange(EVRIM_ALICI_KEY, String(row.aliciNo));
          onFieldChange('Alıcı / İthalatçı Ünvanı', row.aliciUnvan);
          if (row.adres) onFieldChange('Alıcı / İthalatçı Adresi', row.adres);
          return;
        }
        if (result.status === 'ambiguous') {
          setAliciHits(result.rows.map((row) => ({
            ...row,
            label: `${row.aliciNo} – ${row.aliciUnvan}`,
          })));
          setAliciWarn(`${result.rows.length} kart bulundu · doğru adresi seçin`);
          return;
        }
        setAliciWarn('ID yok · adres bulunamadı');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [record.id, gonderenNo]);

  const faturaToplam = Number(String(fv(fieldValues, 'Toplam Fatura Bedeli')).replace(/\./g, '').replace(',', '.')) || 0;
  const kalemToplam = lineItems.reduce((sum, item) => {
    const raw = String(item.kiymet ?? '').replace(/\./g, '').replace(',', '.');
    const n = Number(raw);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const sorunluIndexes = useMemo(() => {
    const set = new Set<number>();
    lineItems.forEach((item, index) => {
      const unitOk = codes.miktar.length === 0
        ? Boolean(fv({ v: item.miktarBirimi ?? '' }, 'v'))
        : Boolean(resolveMiktarValue(item.miktarBirimi ?? '', codes.miktar));
      const menseOk = codes.mense.length === 0
        ? Boolean(fv({ v: item.mense ?? '' }, 'v'))
        : Boolean(resolveMenseValue(item.mense ?? '', codes.mense));
      if (!unitOk || !menseOk) set.add(index);
    });
    return set;
  }, [lineItems, codes]);

  const visible = lineItems
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => filtre === 'tumu' || sorunluIndexes.has(index));

  async function searchGonderen(q: string) {
    setGonderenQ(q);
    onFieldChange('Gönderici / İhracatçı Ünvanı', q);
    setGonderenNo(null);
    onFieldChange(EVRIM_GONDEREN_KEY, '');
    if (!q.trim()) {
      setGonderenHits([]);
      return;
    }
    try {
      const result = await apiGetJson<{ items: GonderenHit[] }>(`/api/evrim-lookup/gonderen?q=${encodeURIComponent(q)}&limit=12`);
      setGonderenHits(result.items);
    } catch {
      setGonderenHits([]);
    }
  }

  async function searchAlici(q: string) {
    setAliciQ(q);
    onFieldChange('Alıcı / İthalatçı Ünvanı', q);
    setAliciNo(null);
    onFieldChange(EVRIM_ALICI_KEY, '');
    setAliciWarn('');
    if (!gonderenNo || !q.trim()) {
      setAliciHits([]);
      return;
    }
    try {
      const result = await apiGetJson<{ items: AliciHit[] }>(
        `/api/evrim-lookup/alici?musteriNo=${gonderenNo}&q=${encodeURIComponent(q)}&limit=20`
      );
      setAliciHits(result.items);
      if (result.items.length === 0) setAliciWarn('ID yok · adres bulunamadı');
      else if (result.items.length > 1) setAliciWarn(`${result.items.length} kart bulundu · doğru adresi seçin`);
    } catch {
      setAliciHits([]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            icon={RefreshCw}
            onClick={onRewrite}
            disabled={locked}
            writeCap="beyanname.write"
            title="Faturayı yeniden parse eder"
          >
            Tekrar Yaz
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" icon={Eye} onClick={onViewDeclaration} disabled={locked}>
            Ön kontrol
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Send}
            disabled={locked || !hasViewedPreview || sorunluIndexes.size > 0}
            title={
              sorunluIndexes.size > 0
                ? 'Önce kalemlerdeki seçimleri tamamlayın'
                : !hasViewedPreview
                  ? 'Önce ön kontrolü açın'
                  : undefined
            }
            onClick={onSendToControl}
            writeCap="beyanname.write"
          >
            Kontrole Gönder
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHead title="1 · Başlık bilgileri" sub="İsteğe bağlı · girilmek zorunda değil" />
          <CardBody className="space-y-3">
            <label className="block text-[12px] text-muted space-y-1">
              <span>Fatura döviz birimi</span>
              <input
                disabled={locked}
                className={`h-8 w-28 rounded-lg border px-2 font-mono text-[12.5px] uppercase ${doviz && fv(fieldValues, 'Döviz Cinsi') && doviz !== fv(fieldValues, 'Döviz Cinsi') ? 'border-warn bg-warn-tint' : 'border-line bg-surface'}`}
                maxLength={3}
                value={doviz}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setDoviz(next);
                  onFieldChange('Döviz Cinsi', next);
                }}
              />
            </label>
            <label className="block text-[12px] text-muted space-y-1">
              <span>Gönderici (ihracatçı)</span>
              <input
                disabled={locked}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px]"
                value={gonderenQ}
                placeholder="Ad veya Evrim ID"
                onChange={(e) => void searchGonderen(e.target.value)}
              />
              {gonderenHits.length > 0 && (
                <div className="max-h-36 overflow-auto rounded-lg border border-line bg-surface">
                  {gonderenHits.map((hit) => (
                    <button
                      key={hit.gonderenNo}
                      type="button"
                      className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-surface-2 border-b border-line last:border-0"
                      onClick={() => {
                        setGonderenNo(hit.gonderenNo);
                        setGonderenQ(hit.label);
                        setGonderenHits([]);
                        onFieldChange(EVRIM_GONDEREN_KEY, String(hit.gonderenNo));
                        onFieldChange('Gönderici / İhracatçı Ünvanı', hit.unvan);
                      }}
                    >
                      {hit.label}
                    </button>
                  ))}
                </div>
              )}
              {gonderenNo != null && <p className="text-[12px] text-ok">Evrim ID: {gonderenNo}</p>}
            </label>
            <label className="block text-[12px] text-muted space-y-1">
              <span>Alıcı (yurt dışı)</span>
              <input
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px]"
                value={aliciQ}
                placeholder={gonderenNo ? 'Ad veya Evrim ID' : 'Önce gönderici seçin'}
                disabled={locked || !gonderenNo}
                onChange={(e) => void searchAlici(e.target.value)}
              />
              {aliciHits.length > 0 && (
                <div className="max-h-36 overflow-auto rounded-lg border border-line bg-surface">
                  {aliciHits.map((hit) => (
                    <button
                      key={`${hit.aliciNo}-${hit.adres}`}
                      type="button"
                      className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-surface-2 border-b border-line last:border-0"
                      onClick={() => {
                        setAliciNo(hit.aliciNo);
                        setAliciQ(hit.label);
                        setAliciHits([]);
                        setAliciWarn('');
                        onFieldChange(EVRIM_ALICI_KEY, String(hit.aliciNo));
                        onFieldChange('Alıcı / İthalatçı Ünvanı', hit.aliciUnvan);
                        if (hit.adres) onFieldChange('Alıcı / İthalatçı Adresi', hit.adres);
                      }}
                    >
                      <div>{hit.label}</div>
                      {hit.adres && <div className="text-[11px] text-muted mt-0.5">{hit.adres}</div>}
                    </button>
                  ))}
                </div>
              )}
              {aliciNo != null && <p className="text-[12px] text-ok">Evrim ID: {aliciNo}</p>}
              {aliciWarn && (
                <p className="text-[12px] text-warn">
                  {aliciWarn}
                  <span className="text-muted"> · indirmeyi engellemez</span>
                </p>
              )}
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="2 · Fatura bilgileri" sub="Faturada ne yazıyorsa · düzenlenebilir" />
          <CardBody className="grid grid-cols-2 gap-3">
            {([
              ['Fatura No', 'Fatura No'],
              ['Fatura Tarihi', 'Fatura Tarihi'],
              ['Toplam Fatura Bedeli', 'Fatura toplamı'],
              ['Teslim Şekli', 'Teslim şekli'],
              ['Kap Adedi', 'Kap adedi'],
              ['Kap Cinsi', 'Kap cinsi'],
              ['Brüt Kilo', 'Brüt kilo'],
              ['Net Kilo', 'Net kilo'],
            ] as const).map(([key, label]) => (
              <label key={key} className="block text-[12px] text-muted space-y-1">
                <span>{label}</span>
                <input
                  disabled={locked}
                  className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-text"
                  value={fieldValues[key] ?? ''}
                  onChange={(e) => onFieldChange(key, e.target.value)}
                />
              </label>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title="3 · Fatura açıklaması" sub="Menşe, imalatçı, kap ve kilo bu yazıdan da okunur" />
        <CardBody>
          <textarea
            disabled={locked}
            className="w-full min-h-[88px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-text"
            value={fieldValues['Açıklama / Not Alanı'] ?? ''}
            onChange={(e) => onFieldChange('Açıklama / Not Alanı', e.target.value)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="4 · Kalemler"
          sub={`${lineItems.length} kalem · seçim gereken: ${sorunluIndexes.size}`}
          actions={
            <div className="flex gap-1">
              {(['tumu', 'sorun'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`h-7 px-2.5 rounded-lg text-[12px] border ${filtre === key ? 'border-accent bg-accent-tint text-accent font-semibold' : 'border-line text-muted'}`}
                  onClick={() => setFiltre(key)}
                >
                  {key === 'tumu' ? 'Tümü' : 'Seçim gerekiyor'}
                </button>
              ))}
            </div>
          }
        />
        <CardBody className="p-0 overflow-auto">
          <table className="w-full text-left min-w-[1100px]">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {['No', 'Ticari tanım', 'Mal kodu', 'GTİP', 'Miktar', 'Birim', 'Birim fiyat', 'Toplam', 'Menşe', 'Kap', 'Net KG', 'İmalatçı'].map((h) => (
                  <th key={h} className="px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ item, index }) => {
                const unitValue = resolveMiktarValue(item.miktarBirimi ?? '', codes.miktar);
                const menseValue = resolveMenseValue(item.mense ?? '', codes.mense);
                const kapValue = resolveKapValue(item.kapCinsi ?? '', codes.kap);
                const needUnit = !unitValue;
                const needMense = !menseValue;
                return (
                  <tr key={`${item.lineNo}-${index}`} className="border-b border-line align-top">
                    <td className="px-2 py-2 text-[12px] text-muted">{item.lineNo || index + 1}</td>
                    <td className="px-2 py-2">
                      <input disabled={locked} className="w-44 h-7 rounded border border-line bg-surface px-1.5 text-[12px]" value={item.ticariTanim ?? ''} onChange={(e) => onLineChange(index, { ticariTanim: e.target.value })} onBlur={onLineBlur} />
                    </td>
                    <td className="px-2 py-2">
                      <input disabled={locked} className="w-28 h-7 rounded border border-line bg-surface px-1.5 text-[12px] font-mono" value={item.malzemeNo ?? ''} onChange={(e) => onLineChange(index, { malzemeNo: e.target.value })} onBlur={onLineBlur} />
                    </td>
                    <td className="px-2 py-2">
                      <input disabled={locked} className="w-32 h-7 rounded border border-line bg-surface px-1.5 text-[12px] font-mono" value={item.gtip ?? ''} onChange={(e) => onLineChange(index, { gtip: e.target.value })} onBlur={onLineBlur} />
                    </td>
                    <td className="px-2 py-2">
                      <input disabled={locked} className="w-20 h-7 rounded border border-line bg-surface px-1.5 text-[12px] text-right" value={item.quantity ?? ''} onChange={(e) => onLineChange(index, applyWeightQuantity({ ...item, quantity: e.target.value }))} onBlur={onLineBlur} />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        disabled={locked}
                        className={`w-28 h-7 rounded border px-1 text-[12px] ${needUnit ? 'border-warn bg-warn-tint' : 'border-line bg-surface'}`}
                        value={unitValue}
                        onChange={(e) => onLineChange(index, applyWeightQuantity({ ...item, miktarBirimi: e.target.value }))}
                        onBlur={onLineBlur}
                      >
                        <option value="">Seçin</option>
                        {codes.miktar.map((opt) => <option key={opt.ediKodu} value={opt.ediKodu}>{opt.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input disabled={locked} className="w-24 h-7 rounded border border-line bg-surface px-1.5 text-[12px] text-right" value={item.birimFiyat ?? ''} onChange={(e) => onLineChange(index, { birimFiyat: e.target.value })} onBlur={onLineBlur} />
                    </td>
                    <td className="px-2 py-2 text-[12px] text-right whitespace-nowrap">{item.kiymet || '—'}</td>
                    <td className="px-2 py-2">
                      <select
                        disabled={locked}
                        className={`w-28 h-7 rounded border px-1 text-[12px] ${needMense ? 'border-warn bg-warn-tint' : 'border-line bg-surface'}`}
                        value={menseValue}
                        onChange={(e) => onLineChange(index, { mense: e.target.value })}
                        onBlur={onLineBlur}
                      >
                        <option value="">Seçin</option>
                        {codes.mense.map((opt) => <option key={opt.ulkeNo} value={opt.ulkeNo}>{opt.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        disabled={locked}
                        className="w-24 h-7 rounded border border-line bg-surface px-1 text-[12px]"
                        value={kapValue}
                        onChange={(e) => onLineChange(index, { kapCinsi: e.target.value })}
                        onBlur={onLineBlur}
                      >
                        <option value="">—</option>
                        {codes.kap.map((opt) => <option key={opt.kod} value={opt.kod}>{opt.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-[12px] text-right whitespace-nowrap">{item.netKg || '—'}</td>
                    <td className="px-2 py-2 text-[12px] whitespace-nowrap">{item.imalatci || '—'}{item.imalatciTipi ? ` · ${item.imalatciTipi}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 text-[12.5px] border-t border-line flex justify-between gap-3">
            <span className="text-muted">Kalem toplamı: <strong className="text-text-strong">{kalemToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span className={faturaToplam > 0 && Math.abs(kalemToplam - faturaToplam) > 0.05 ? 'text-warn' : 'text-ok'}>
              {faturaToplam > 0 && Math.abs(kalemToplam - faturaToplam) > 0.05
                ? `Fatura toplamından ${(kalemToplam - faturaToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} farklı`
                : 'Fatura toplamıyla aynı / kontrol yok'}
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
