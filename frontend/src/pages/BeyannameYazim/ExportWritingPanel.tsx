import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { BeyannameLineItem, BeyannameRecord } from '../../types';
import { apiGetJson, apiPostJson } from '../../api/apiClient';
import { applyWeightQuantity } from './writingDraft';
import { resolveMiktarEdi } from './resolveEvrimMiktar';
import { resolveMenseUlkeNo } from './resolveEvrimMense';
import {
  isEvrimCodeOptionsReady,
  loadEvrimCodeOptions,
  peekEvrimCodeOptions,
  type EvrimCodeOptions,
} from './evrimCodeOptionsCache';
import { parseTrNumber } from '../../utils/parseTrNumber';
import './exportYazim.css';

type GonderenHit = { gonderenNo: number; unvan: string; vergiNo: string; label: string };
type AliciHit = {
  aliciNo: number;
  aliciUnvan: string;
  adres: string;
  label: string;
  ulke?: string;
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

function partyLabel(no: number | null, unvan: string): string {
  const name = unvan.trim();
  if (no != null && name) return `${no} – ${name}`;
  if (no != null) return String(no);
  return name;
}

function resolveKapValue(raw: string, options: Array<{ kod: string; label: string }>): string {
  const text = fv({ v: raw }, 'v');
  if (!text) return '';
  if (options.some((opt) => opt.kod === text)) return text;
  const lower = text.toLocaleLowerCase('tr-TR');
  const hit = options.find((opt) => opt.label.toLocaleLowerCase('tr-TR').includes(lower) || opt.kod.toLowerCase() === lower);
  return hit?.kod ?? '';
}

/** Menşe TR (052) → I, değilse T. Ayarlar’da tutulmaz; Excel P/T kolonuna böyle yazılır. */
function imalatciTipiFromMense(menseRaw: string | undefined, options: Parameters<typeof resolveMenseUlkeNo>[1]): 'I' | 'T' | '' {
  const ulkeNo = resolveMenseUlkeNo(menseRaw, options);
  if (!ulkeNo) return '';
  return ulkeNo === '052' ? 'I' : 'T';
}

/** Sığmayan hücre metni — hover’da tam hali (WritingTab popup’ı). */
function TipWrap({ text, minLen = 16, children }: { text: string; minLen?: number; children: ReactNode }) {
  const full = text.trim();
  const show = full.length > minLen;
  return (
    <div className="ey-tipwrap">
      {children}
      {show ? <div className="ey-tip">{full}</div> : null}
    </div>
  );
}

interface ExportWritingPanelProps {
  record: BeyannameRecord;
  fieldValues: Record<string, string>;
  lineItems: BeyannameLineItem[];
  locked?: boolean;
  onFieldChange: (name: string, value: string) => void;
  onLineChange: (index: number, patch: Partial<BeyannameLineItem>) => void;
  onLineBlur: () => void;
  onSorunluChange?: (count: number) => void;
}

export default function ExportWritingPanel({
  record,
  fieldValues,
  lineItems,
  locked = false,
  onFieldChange,
  onLineChange,
  onLineBlur,
  onSorunluChange,
}: ExportWritingPanelProps) {
  const [filtre, setFiltre] = useState<'tumu' | 'sorun'>('tumu');
  const [doviz, setDoviz] = useState(fv(fieldValues, 'Döviz Cinsi') || 'EUR');
  const initialGonderenNo = parseStoredId(fv(fieldValues, EVRIM_GONDEREN_KEY));
  const initialAliciNo = parseStoredId(fv(fieldValues, EVRIM_ALICI_KEY));
  const [gonderenNo, setGonderenNo] = useState<number | null>(() => initialGonderenNo);
  const [gonderenQ, setGonderenQ] = useState(() =>
    partyLabel(initialGonderenNo, fv(fieldValues, 'Gönderici / İhracatçı Ünvanı'))
  );
  const [gonderenHits, setGonderenHits] = useState<GonderenHit[]>([]);
  const [aliciNo, setAliciNo] = useState<number | null>(() => initialAliciNo);
  const [aliciQ, setAliciQ] = useState(() =>
    partyLabel(initialAliciNo, fv(fieldValues, 'Alıcı / İthalatçı Ünvanı'))
  );
  const [aliciHits, setAliciHits] = useState<AliciHit[]>([]);
  const [aliciWarn, setAliciWarn] = useState('');
  const [codes, setCodes] = useState<EvrimCodeOptions>(() => peekEvrimCodeOptions());
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [firmaAdByNo, setFirmaAdByNo] = useState<Record<string, string>>({});
  const codesReady = isEvrimCodeOptionsReady(codes);

  useEffect(() => {
    let cancelled = false;
    void loadEvrimCodeOptions().then((next) => {
      if (!cancelled) setCodes(next);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const nextGonderenNo = parseStoredId(fv(fieldValues, EVRIM_GONDEREN_KEY));
    const nextAliciNo = parseStoredId(fv(fieldValues, EVRIM_ALICI_KEY));
    const gonderenName = fv(fieldValues, 'Gönderici / İhracatçı Ünvanı');
    const aliciName = fv(fieldValues, 'Alıcı / İthalatçı Ünvanı');
    setDoviz(fv(fieldValues, 'Döviz Cinsi') || 'EUR');
    setGonderenNo(nextGonderenNo);
    setAliciNo(nextAliciNo);
    // Asla boşaltma: fatura adı veya ID–unvan hemen görünsün
    setGonderenQ((prev) => partyLabel(nextGonderenNo, gonderenName) || prev);
    setAliciQ((prev) => partyLabel(nextAliciNo, aliciName) || prev);
    if (nextGonderenNo != null && gonderenName) {
      setFirmaAdByNo((prev) => ({ ...prev, [String(nextGonderenNo)]: gonderenName }));
    }
    setGonderenHits([]);
    setAliciHits([]);
    setAliciWarn('');
    setTouched({});
  }, [record.id]);

  // Parent hydrate / draftFields ile ID gelince input’u anında güncelle
  useEffect(() => {
    const nextGonderenNo = parseStoredId(fv(fieldValues, EVRIM_GONDEREN_KEY));
    const nextAliciNo = parseStoredId(fv(fieldValues, EVRIM_ALICI_KEY));
    const gonderenName = fv(fieldValues, 'Gönderici / İhracatçı Ünvanı');
    const aliciName = fv(fieldValues, 'Alıcı / İthalatçı Ünvanı');
    if (nextGonderenNo != null) {
      setGonderenNo(nextGonderenNo);
      setGonderenQ(partyLabel(nextGonderenNo, gonderenName));
      if (gonderenName) setFirmaAdByNo((prev) => ({ ...prev, [String(nextGonderenNo)]: gonderenName }));
    } else if (gonderenName) {
      setGonderenQ((prev) => prev || gonderenName);
    }
    if (nextAliciNo != null) {
      setAliciNo(nextAliciNo);
      setAliciQ(partyLabel(nextAliciNo, aliciName));
    } else if (aliciName) {
      setAliciQ((prev) => prev || aliciName);
    }
  }, [
    fieldValues[EVRIM_GONDEREN_KEY],
    fieldValues[EVRIM_ALICI_KEY],
    fieldValues['Gönderici / İhracatçı Ünvanı'],
    fieldValues['Alıcı / İthalatçı Ünvanı'],
  ]);

  // Backend hydrate etmemişse: VKN (Evrim Firma) öncelikli eşle — sonucu gelene kadar mevcut yazıyı tut
  useEffect(() => {
    if (gonderenNo != null) return;
    const name = fv(fieldValues, 'Gönderici / İhracatçı Ünvanı');
    const taxNo = fv(fieldValues, 'Gönderici VKN');
    if (!name && !taxNo) return;
    let cancelled = false;

    void apiPostJson<
      | { status: 'matched'; row: GonderenHit }
      | { status: 'ambiguous'; rows: GonderenHit[] }
      | { status: 'not_found' }
    >('/api/evrim-lookup/gonderen/match', { taxNo, name })
      .then((result) => {
        if (cancelled || !result) return;
        if (result.status === 'matched') {
          const hit = result.row;
          const label = hit.label || partyLabel(hit.gonderenNo, hit.unvan);
          setGonderenNo(hit.gonderenNo);
          setGonderenQ(label);
          setFirmaAdByNo((prev) => ({ ...prev, [String(hit.gonderenNo)]: hit.unvan }));
          onFieldChange(EVRIM_GONDEREN_KEY, String(hit.gonderenNo));
          onFieldChange('Gönderici / İhracatçı Ünvanı', hit.unvan);
          if (hit.vergiNo) onFieldChange('Gönderici VKN', hit.vergiNo);
          return;
        }
        if (result.status === 'ambiguous') {
          setGonderenHits(result.rows.map((row) => ({
            ...row,
            label: row.label || partyLabel(row.gonderenNo, row.unvan),
          })));
        }
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [record.id, gonderenNo]);

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
        if (cancelled || !result) return;
        if (result.status === 'matched') {
          const row = result.row;
          setAliciNo(row.aliciNo);
          setAliciQ(partyLabel(row.aliciNo, row.aliciUnvan));
          setAliciWarn('');
          onFieldChange(EVRIM_ALICI_KEY, String(row.aliciNo));
          onFieldChange('Alıcı / İthalatçı Ünvanı', row.aliciUnvan);
          if (row.adres) onFieldChange('Alıcı / İthalatçı Adresi', row.adres);
          return;
        }
        if (result.status === 'ambiguous') {
          setAliciHits(result.rows.map((row) => ({
            ...row,
            label: partyLabel(row.aliciNo, row.aliciUnvan),
          })));
          setAliciWarn(`${result.rows.length} kart bulundu · doğru adresi seçin`);
          return;
        }
        setAliciWarn('ID yok · adres bulunamadı');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [record.id, gonderenNo, aliciNo]);

  const faturaToplam = parseTrNumber(fv(fieldValues, 'Toplam Fatura Bedeli'));
  const kalemToplam = lineItems.reduce((sum, item) => sum + parseTrNumber(String(item.kiymet ?? '')), 0);
  const faturaCurrency = doviz || fv(fieldValues, 'Döviz Cinsi') || 'EUR';

  // Parse birim/menşe → Evrim kodları (Adet→C62, CHINA→720).
  useEffect(() => {
    if (locked) return;
    if (!codes.miktar.length && !codes.mense.length) return;
    lineItems.forEach((item, index) => {
      const patch: Partial<typeof item> = {};
      if (codes.miktar.length) {
        const resolvedUnit = resolveMiktarEdi(item.miktarBirimi, codes.miktar);
        if (resolvedUnit && resolvedUnit !== item.miktarBirimi) patch.miktarBirimi = resolvedUnit;
      }
      if (codes.mense.length) {
        const resolvedMense = resolveMenseUlkeNo(item.mense, codes.mense);
        if (resolvedMense && resolvedMense !== item.mense) patch.mense = resolvedMense;
      }
      if (Object.keys(patch).length > 0) {
        onLineChange(index, applyWeightQuantity({ ...item, ...patch }));
      }
    });
  }, [codes.miktar, codes.mense, record.id]);

  const sorunluIndexes = useMemo(() => {
    const set = new Set<number>();
    // Kod listesi gelmeden "Seçiniz/sorun" gösterme — parse değeri zaten var.
    if (!codesReady) return set;
    lineItems.forEach((item, index) => {
      const unitOk = Boolean(resolveMiktarEdi(item.miktarBirimi, codes.miktar));
      const menseOk = Boolean(resolveMenseUlkeNo(item.mense, codes.mense));
      if (!unitOk || !menseOk) set.add(index);
    });
    return set;
  }, [lineItems, codes, codesReady]);

  useEffect(() => {
    onSorunluChange?.(sorunluIndexes.size);
  }, [sorunluIndexes.size, onSorunluChange]);

  const visible = lineItems
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => filtre === 'tumu' || sorunluIndexes.has(index));

  const invoiceDocs = record.docs.filter((doc) =>
    /fatura|invoice|xml|pdf/i.test(doc.name) || doc.status === 'geldi'
  ).slice(0, 4);

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
      setGonderenHits(result?.items ?? []);
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
      const items = result?.items ?? [];
      setAliciHits(items);
      if (items.length === 0) setAliciWarn('ID yok · adres bulunamadı');
      else if (items.length > 1) setAliciWarn(`${items.length} kart bulundu · doğru adresi seçin`);
    } catch {
      setAliciHits([]);
    }
  }

  function markTouched(key: string) {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }

  function fieldRow(
    key: string,
    label: string,
    alt: string,
    opts: { mono?: boolean; suffix?: string } = {}
  ) {
    const changed = Boolean(touched[key]);
    return (
      <div className="ey-satir">
        <label className="ey-k">
          {label}
          {alt ? <span style={{ fontWeight: 400, color: 'var(--muted-2)', fontSize: 11 }}> · {alt}</span> : null}
        </label>
        <span className="ey-v">
          <input
            disabled={locked}
            className={`ey-inp ey-num${opts.mono ? ' ey-mono' : ''}${changed ? ' ey-warn' : ''}`}
            style={opts.suffix ? { paddingRight: 40 } : undefined}
            title={changed ? 'Elle değiştirildi' : undefined}
            value={fieldValues[key] ?? ''}
            onChange={(e) => {
              markTouched(key);
              onFieldChange(key, e.target.value);
            }}
          />
          {opts.suffix ? (
            <span style={{ position: 'absolute', right: 10.5, fontSize: 12, color: 'var(--muted)', pointerEvents: 'none' }}>
              {opts.suffix}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  const parsedDoviz = fv(fieldValues, 'Döviz Cinsi');
  const dovizChanged = Boolean(touched['Döviz Cinsi']) && Boolean(doviz) && Boolean(parsedDoviz) && doviz !== parsedDoviz;
  const kalemlerTamam = lineItems.length > 0 && sorunluIndexes.size === 0;

  return (
    <div className="ey-body">
      <div className="ey-esit">
        <section className="ey-card" aria-labelledby="ey-b1">
          <div className="ey-card-h">
            <div>
              <h3 id="ey-b1"><span className="ey-adim tamam">1</span>Başlık bilgileri</h3>
              <p className="ey-sub">İsteğe bağlı · girilmek zorunda değil</p>
            </div>
          </div>
          <div className="ey-card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12.25 }}>
            <div>
              <label className="ey-lbl" htmlFor="ey-doviz">
                Fatura döviz birimi <span className="ey-opt">· isteğe bağlı</span>
              </label>
              <input
                id="ey-doviz"
                disabled={locked}
                className={`ey-inp ey-mono${dovizChanged ? ' ey-warn' : ''}`}
                style={{ width: 120, textTransform: 'uppercase' }}
                maxLength={3}
                value={doviz}
                placeholder="EUR"
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  markTouched('Döviz Cinsi');
                  setDoviz(next);
                  onFieldChange('Döviz Cinsi', next);
                }}
              />
              {dovizChanged
                ? <p className="ey-yard" style={{ color: 'var(--warn)' }}>Elle değiştirildi · Excel&apos;e girdiğiniz yazılır.</p>
                : doviz
                  ? <p className="ey-yard" style={{ color: 'var(--ok)' }}>Faturadan · {doviz}</p>
                  : null}
              <p className="ey-yard">Parse edilen faturadan gelir; isterseniz elle değiştirin.</p>
            </div>

            <div>
              <label className="ey-lbl" htmlFor="ey-gon">
                Gönderici (ihracatçı) <span className="ey-opt">· isteğe bağlı</span>
              </label>
              <input
                id="ey-gon"
                disabled={locked}
                className="ey-inp"
                value={gonderenQ}
                placeholder="Ad veya Evrim ID"
                onChange={(e) => void searchGonderen(e.target.value)}
              />
              {gonderenHits.length > 0 && (
                <div className="ey-hitlist" style={{ marginTop: 4 }}>
                  {gonderenHits.map((hit) => (
                    <button
                      key={hit.gonderenNo}
                      type="button"
                      onClick={() => {
                        setGonderenNo(hit.gonderenNo);
                        setGonderenQ(hit.label || partyLabel(hit.gonderenNo, hit.unvan));
                        setFirmaAdByNo((prev) => ({ ...prev, [String(hit.gonderenNo)]: hit.unvan }));
                        setGonderenHits([]);
                        onFieldChange(EVRIM_GONDEREN_KEY, String(hit.gonderenNo));
                        onFieldChange('Gönderici / İhracatçı Ünvanı', hit.unvan);
                        if (hit.vergiNo) onFieldChange('Gönderici VKN', hit.vergiNo);
                      }}
                    >
                      {hit.label}
                    </button>
                  ))}
                </div>
              )}
              {gonderenNo != null
                ? <p className="ey-yard" style={{ color: 'var(--ok)' }}>Evrim ID: {gonderenNo}</p>
                : <p className="ey-yard">Ad ya da Evrim ID&apos;siyle aranır. ID&apos;si yoksa faturadaki ad yazılır.</p>}
            </div>

            <div>
              <label className="ey-lbl" htmlFor="ey-ali">
                Alıcı (yurt dışı) <span className="ey-opt">· isteğe bağlı</span>
              </label>
              {aliciWarn.includes('ID yok') && !aliciNo ? (
                <div className="ey-inp" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aliciQ || '—'}</span>
                  <span className="ey-bdg ey-b-warn"><i />Evrim ID&apos;si yok</span>
                </div>
              ) : (
                <input
                  id="ey-ali"
                  className="ey-inp"
                  value={aliciQ}
                  placeholder={gonderenNo ? 'Ad veya Evrim ID' : 'Önce gönderici seçin'}
                  disabled={locked || !gonderenNo}
                  onChange={(e) => void searchAlici(e.target.value)}
                />
              )}
              {aliciHits.length > 0 && (
                <div className="ey-hitlist" style={{ marginTop: 4 }}>
                  {aliciHits.map((hit) => (
                    <button
                      key={`${hit.aliciNo}-${hit.adres}`}
                      type="button"
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
                      {hit.adres && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{hit.adres}</div>}
                    </button>
                  ))}
                </div>
              )}
              {aliciNo != null && <p className="ey-yard" style={{ color: 'var(--ok)' }}>Evrim ID: {aliciNo}</p>}
              {aliciWarn && (
                <p className="ey-yard" style={{ color: 'var(--warn)' }}>
                  {aliciWarn}
                  <span style={{ color: 'var(--muted)' }}> · indirmeyi engellemez</span>
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="ey-card" aria-labelledby="ey-b2">
          <div className="ey-card-h">
            <div>
              <h3 id="ey-b2"><span className="ey-adim tamam">2</span>Fatura bilgileri</h3>
              <p className="ey-sub">Faturada ne yazıyorsa o gelir · alanlar elle değiştirilebilir, değişen alan turuncu görünür</p>
            </div>
          </div>
          <div className="ey-card-b">
            {invoiceDocs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 7, marginBottom: 10.5 }}>
                {invoiceDocs.map((doc) => {
                  const isXml = /xml/i.test(doc.name);
                  return (
                    <div key={doc.id} className="ey-dosya">
                      <FileText size={16} style={{ color: 'var(--accent)', marginTop: 1, flex: 'none' }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="ey-mono" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{doc.name}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{doc.note || (isXml ? 'ana kaynak' : 'tamamlayıcı')}</span>
                      </span>
                      <span className="ey-bdg ey-b-acc">{isXml ? 'XML' : 'PDF'}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0 21px' }}>
              <div>
                {fieldRow('Fatura No', 'Fatura no', '', { mono: true })}
                {fieldRow('Taşıma Şekli', 'Taşıma şekli', 'dosyadan')}
                {fieldRow('Fatura Tarihi', 'Fatura tarihi', "Evrim'e yazılmaz")}
                {fieldRow('Toplam Fatura Bedeli', 'Fatura toplamı', '', { suffix: faturaCurrency })}
                {fieldRow('Teslim Şekli', 'Teslim şekli', '', { mono: true })}
              </div>
              <div>
                {fieldRow('Kap Adedi', 'Kap adedi', 'açıklama')}
                {fieldRow('Kap Cinsi', 'Kap cinsi', '', { mono: true })}
                {fieldRow('Brüt Kilo', 'Brüt kilo', 'açıklama')}
                {fieldRow('Net Kilo', 'Net kilo', 'açıklama')}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="ey-card" aria-labelledby="ey-b2a">
        <div className="ey-card-h">
          <div>
            <h3 id="ey-b2a"><span className="ey-adim tamam">3</span>Fatura açıklaması</h3>
            <p className="ey-sub">Menşe, imalatçı, kap ve kilo bilgileri bu yazıdan da okunur</p>
          </div>
        </div>
        <div className="ey-card-b">
          <textarea
            disabled={locked}
            className="ey-mono"
            placeholder="Parse notu / kap-kilo özeti burada görünür…"
            style={{
              width: '100%',
              minHeight: 88,
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--text-strong)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '10.5px 12.25px',
              lineHeight: 1.6,
              resize: 'vertical',
            }}
            value={fieldValues['Açıklama / Not Alanı'] ?? ''}
            onChange={(e) => onFieldChange('Açıklama / Not Alanı', e.target.value)}
          />
        </div>
      </section>

      <section className="ey-card" aria-labelledby="ey-b3">
        <div className="ey-card-h">
          <div>
            <h3 id="ey-b3">
              <span className={`ey-adim${kalemlerTamam ? ' tamam' : ''}`}>4</span>
              Kalemler
            </h3>
            <p className="ey-sub">
              {lineItems.length} kalem · {sorunluIndexes.size
                ? `${sorunluIndexes.size} kalemde seçim gerekiyor`
                : 'hepsi Evrim kodlarıyla eşleşti'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Göster:</span>
            <button type="button" className={`ey-btn${filtre === 'tumu' ? ' secili' : ''}`} onClick={() => setFiltre('tumu')}>
              Tümü {lineItems.length}
            </button>
            <button
              type="button"
              className={`ey-btn${filtre === 'sorun' ? ' secili' : ''}`}
              disabled={sorunluIndexes.size === 0}
              onClick={() => setFiltre('sorun')}
            >
              Seçim gerekiyor {sorunluIndexes.size}
            </button>
          </div>
        </div>

        <div className="ey-tsar">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Ticari tanım</th>
                <th>Mal kodu</th>
                <th>GTİP</th>
                <th className="r">Miktar</th>
                <th>Birim</th>
                <th className="r">Birim fiyat</th>
                <th className="r">Toplam fiyat</th>
                <th>Menşe</th>
                <th>Kap cinsi</th>
                <th className="r">Net KG</th>
                <th>İmalatçı</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ item, index }) => {
                const rawUnit = fv({ v: item.miktarBirimi ?? '' }, 'v');
                const rawMense = fv({ v: item.mense ?? '' }, 'v');
                const unitValue = resolveMiktarEdi(item.miktarBirimi, codes.miktar);
                const menseValue = resolveMenseUlkeNo(item.mense, codes.mense);
                const kapValue = resolveKapValue(item.kapCinsi ?? '', codes.kap);
                // Liste yüklenene kadar ham parse değerini göster; "Seçiniz" flash'ı yok.
                const unitSelect = unitValue || (!codesReady ? rawUnit : '');
                const menseSelect = menseValue || (!codesReady ? rawMense : '');
                const needUnit = codesReady && !unitValue;
                const needMense = codesReady && !menseValue;
                const unitOpt = codes.miktar.find((opt) => opt.ediKodu === unitValue);
                const menseOpt = codes.mense.find((opt) => opt.ulkeNo === menseValue);
                return (
                  <tr key={`${item.lineNo}-${index}`}>
                    <td className="ey-num" style={{ color: 'var(--muted)' }}>{item.lineNo || index + 1}</td>
                    <td>
                      <TipWrap text={item.ticariTanim ?? item.description ?? ''} minLen={18}>
                        <input
                          disabled={locked}
                          className="ey-ed"
                          style={{ width: 230 }}
                          value={item.ticariTanim ?? item.description ?? ''}
                          onChange={(e) => onLineChange(index, { ticariTanim: e.target.value })}
                          onBlur={onLineBlur}
                        />
                      </TipWrap>
                    </td>
                    <td>
                      <TipWrap text={item.malzemeNo ?? ''} minLen={14}>
                        <input
                          disabled={locked}
                          className="ey-ed ey-mono"
                          style={{ width: 130 }}
                          value={item.malzemeNo ?? ''}
                          onChange={(e) => onLineChange(index, { malzemeNo: e.target.value })}
                          onBlur={onLineBlur}
                        />
                      </TipWrap>
                    </td>
                    <td>
                      <TipWrap text={item.gtip === '—' ? '' : (item.gtip ?? '')} minLen={14}>
                        <input
                          disabled={locked}
                          className="ey-ed ey-mono"
                          style={{ width: 125 }}
                          value={item.gtip === '—' ? '' : (item.gtip ?? '')}
                          onChange={(e) => onLineChange(index, { gtip: e.target.value })}
                          onBlur={onLineBlur}
                        />
                      </TipWrap>
                    </td>
                    <td className="r">
                      <input
                        disabled={locked}
                        className="ey-ed r ey-num"
                        style={{ width: 72 }}
                        value={item.quantity === '—' ? '' : (item.quantity ?? '')}
                        onChange={(e) => onLineChange(index, applyWeightQuantity({ ...item, quantity: e.target.value }))}
                        onBlur={onLineBlur}
                      />
                    </td>
                    <td className={needUnit ? 'sorun' : undefined}>
                      <select
                        disabled={locked || !codesReady}
                        className={needUnit ? undefined : 'ey-ed ey-mono'}
                        value={unitSelect}
                        onChange={(e) => onLineChange(index, applyWeightQuantity({ ...item, miktarBirimi: e.target.value }))}
                        onBlur={onLineBlur}
                      >
                        <option value="">Seçin</option>
                        {!unitValue && rawUnit && !codesReady && (
                          <option value={rawUnit}>{rawUnit}</option>
                        )}
                        {codes.miktar.map((opt) => <option key={opt.ediKodu} value={opt.ediKodu}>{opt.label}</option>)}
                      </select>
                      {needUnit
                        ? <span className="ey-kay" style={{ color: '#7a5a16' }}>{item.miktarBirimi ? `"${item.miktarBirimi}" Evrim'de yok` : 'Evrim kodu seçin'}</span>
                        : <span className="ey-kay">{unitOpt?.label?.split(' · ')[1] || (!codesReady ? rawUnit : unitValue)}</span>}
                    </td>
                    <td className="r">
                      <input
                        disabled={locked}
                        className="ey-ed r ey-num"
                        style={{ width: 82 }}
                        value={item.birimFiyat === '—' ? '' : (item.birimFiyat ?? '')}
                        onChange={(e) => onLineChange(index, { birimFiyat: e.target.value })}
                        onBlur={onLineBlur}
                      />
                    </td>
                    <td className="r ey-num">{item.kiymet || '—'}</td>
                    <td className={needMense ? 'sorun' : undefined}>
                      <select
                        disabled={locked || !codesReady}
                        className={needMense ? undefined : 'ey-ed ey-mono'}
                        value={menseSelect}
                        onChange={(e) => onLineChange(index, { mense: e.target.value })}
                        onBlur={onLineBlur}
                      >
                        <option value="">Menşe seçin</option>
                        {!menseValue && rawMense && !codesReady && (
                          <option value={rawMense}>{rawMense}</option>
                        )}
                        {codes.mense.map((opt) => <option key={opt.ulkeNo} value={opt.ulkeNo}>{opt.label}</option>)}
                      </select>
                      {needMense
                        ? <span className="ey-kay" style={{ color: '#7a5a16' }}>{item.mense && item.mense !== '—' ? `"${item.mense}" Evrim'de eşleşmedi` : 'Kalemde ve açıklamada yok'}</span>
                        : <span className="ey-kay">{menseOpt?.yUlke || menseOpt?.ulke || (!codesReady ? rawMense : menseValue)}</span>}
                    </td>
                    <td>
                      <select
                        disabled={locked}
                        className="ey-ed ey-mono"
                        value={kapValue}
                        onChange={(e) => onLineChange(index, { kapCinsi: e.target.value })}
                        onBlur={onLineBlur}
                      >
                        <option value="">—</option>
                        {codes.kap.map((opt) => <option key={opt.kod} value={opt.kod}>{opt.label}</option>)}
                      </select>
                      <span className="ey-kay">{kapValue ? 'XML' : 'faturada yok'}</span>
                    </td>
                    <td className="r ey-num">
                      {item.netKg && item.netKg !== '—' ? item.netKg : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td>
                      {(() => {
                        const tip = (item.imalatciTipi === 'I' || item.imalatciTipi === 'T')
                          ? item.imalatciTipi
                          : imalatciTipiFromMense(item.mense, codes.mense);
                        const id = item.imalatci || (gonderenNo != null ? String(gonderenNo) : '');
                        const fromSender = !item.imalatci && gonderenNo != null;
                        const ad = id
                          ? (firmaAdByNo[id]
                            || (fromSender || (gonderenNo != null && id === String(gonderenNo))
                              ? fv(fieldValues, 'Gönderici / İhracatçı Ünvanı')
                              : ''))
                          : '';
                        if (!tip && !id) {
                          return <span style={{ color: 'var(--muted)' }}>Menşe / gönderici bekleniyor</span>;
                        }
                        const label = ad ? `${id} – ${ad}` : id;
                        return (
                          <TipWrap text={label} minLen={18}>
                            {tip ? (
                              <span className={`ey-bdg ${tip === 'I' ? 'ey-b-ok' : 'ey-b-blue'}`}>{tip}</span>
                            ) : null}
                            {' '}
                            {id
                              ? <span className="ey-mono">{label}</span>
                              : <span style={{ color: 'var(--muted)' }}>—</span>}
                            <span className="ey-kay">
                              {item.imalatci
                                ? 'kalem'
                                : fromSender
                                  ? 'gönderici · menşe tipi'
                                  : tip
                                    ? 'menşe tipi · ID göndericiden'
                                    : 'menşeye göre'}
                            </span>
                          </TipWrap>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>{filtre === 'sorun' ? 'Seçim gereken kalemler' : 'Toplam'}</td>
                <td className="r ey-num">
                  {kalemToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {faturaCurrency}
                </td>
                <td colSpan={4} style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
                  {filtre === 'sorun'
                    ? ''
                    : faturaToplam > 0 && Math.abs(kalemToplam - faturaToplam) > 0.05
                      ? <span style={{ color: 'var(--warn)' }}>Fatura toplamından {(kalemToplam - faturaToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {faturaCurrency} farklı</span>
                      : 'Fatura toplamıyla aynı'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="ey-legend">
          <span>Hücreye tıklayıp değiştirebilirsiniz</span>
          <span>Gri yazı: değerin nereden geldiği</span>
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--warn-tint)', border: '1px solid #e8d0a2', verticalAlign: -1 }} /> Seçim gerekiyor
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--accent-tint)', verticalAlign: -1 }} /> Kullanıcı seçti / değiştirdi
          </span>
          <span>
            <span className="ey-bdg ey-b-ok">I</span> imalatçı · <span className="ey-bdg ey-b-blue">T</span> tedarikçi
          </span>
        </div>
      </section>
    </div>
  );
}
