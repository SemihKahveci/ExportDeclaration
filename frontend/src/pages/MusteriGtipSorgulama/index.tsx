import { useEffect, useState } from 'react';
import { Search, Send, Plus, Loader2 } from 'lucide-react';
import type { GtipQueryResult, MaterialCustomer, QueryResultStatus, QueryApprovalStatus } from '../../types';
import { gtipService } from '../../services/gtip';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { Field, Select, Textarea } from '../../components/ui/Fields';
import UploadBox from '../../components/ui/UploadBox';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import GtipRecordDrawer from '../GtipHazirlik/GtipRecordDrawer';
import { ApiError } from '../../api/apiClient';

function queryStatusVariant(v: QueryResultStatus): 'ok' | 'warn' {
  return v === 'Bulundu' ? 'ok' : 'warn';
}

function approvalVariant(v: QueryApprovalStatus): 'ok' | 'blue' | 'warn' {
  if (v === 'Onaylı')        return 'ok';
  if (v === 'Onay Bekliyor') return 'blue';
  return 'warn';
}

export default function MusteriGtipSorgulamaPage() {
  const { toast } = useToast();

  const [loading, setLoading]             = useState(true);
  const [parsing, setParsing]             = useState(false);
  const [results, setResults]             = useState<GtipQueryResult[]>([]);
  const [customers, setCustomers]         = useState<MaterialCustomer[]>([]);
  const [customer, setCustomer]           = useState('');
  const [requestSource, setRequestSource] = useState('Mail');
  const [requestStatus, setRequestStatus] = useState('Yeni Talep');
  const [manualList, setManualList]       = useState('');
  const [lastParseMeta, setLastParseMeta] = useState<{
    fileName: string;
    pdfType: string;
    itemCount: number;
  } | null>(null);
  const [uploadedFile, setUploadedFile]   = useState<File | null>(null);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [drawerTarget, setDrawerTarget]   = useState<GtipQueryResult | null>(null);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [sending, setSending]             = useState(false);

  useEffect(() => {
    let cancelled = false;

    gtipService.getCustomers()
      .then((c) => {
        if (cancelled) return;
        setCustomers(c);
        setCustomer((prev) => prev || c[0]?.name || '');
      })
      .catch(() => {
        if (!cancelled) toast('Müşteri listesi yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    gtipService.getStoredCustomerQuery()
      .then((stored) => {
        if (cancelled) return;
        setResults(stored.results ?? []);
        if (stored.customerName) setCustomer(stored.customerName);
        if ((stored.results?.length ?? 0) > 0 && stored.fileName) {
          setLastParseMeta({
            fileName: stored.fileName,
            pdfType: stored.pdfType,
            itemCount: stored.itemCount || stored.results.length,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof ApiError ? err.message : 'Sorgu sonuçları yüklenemedi';
          toast(msg);
        }
      });

    return () => { cancelled = true; };
  }, [toast]);

  function openDrawer() {
    const target = results.find((r) => r.approvalStatus === 'Giriş Bekliyor')
      ?? results.find((r) => r.status === 'Operasyon Girişi Gerekli')
      ?? null;
    setDrawerTarget(target);
    setDrawerOpen(true);
  }

  function selectedCustomerId() {
    return customers.find((c) => c.name === customer)?.id ?? '';
  }

  async function persistResults(
    rows: GtipQueryResult[],
    meta?: { fileName: string; pdfType: string } | null
  ) {
    if (rows.length === 0) return;
    const customerId = selectedCustomerId();
    if (!customerId) {
      throw new Error('Müşteri seçilmeden sorgu sonuçları kaydedilemez');
    }
    await gtipService.saveCustomerQueryResults({
      customerId,
      customerName: customer,
      fileName: meta?.fileName ?? lastParseMeta?.fileName,
      pdfType: meta?.pdfType ?? lastParseMeta?.pdfType,
      results: rows,
    });
  }

  async function handleGtipQuery() {
    if (!uploadedFile) {
      toast('Önce PDF fatura yükleyin');
      return;
    }
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf') && uploadedFile.type !== 'application/pdf') {
      toast('GTİP sorgusu için PDF dosyası gerekli');
      return;
    }

    setParsing(true);
    try {
      const { results: parsed, meta } = await gtipService.parseInvoicePdf(uploadedFile);
      if (parsed.length === 0) {
        toast('PDF içinde GTİP kalemi bulunamadı');
        return;
      }
      setResults(parsed);
      setLastParseMeta(meta);
      toast(`${meta.fileName}: ${meta.itemCount} kalem (${meta.pdfType})`);
      try {
        await persistResults(parsed, meta);
      } catch (persistErr) {
        toast(
          persistErr instanceof Error
            ? `PDF okundu ama sonuçlar kaydedilemedi: ${persistErr.message}`
            : 'PDF okundu ama sonuçlar kaydedilemedi'
        );
      }
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'GTİP sorgusu başarısız';
      toast(msg);
    } finally {
      setParsing(false);
    }
  }

  function handleGtipQueryClick() {
    if (results.length > 0) {
      setReplaceConfirmOpen(true);
      return;
    }
    void handleGtipQuery();
  }

  function handleReplaceCancel() {
    setReplaceConfirmOpen(false);
  }

  function handleReplaceConfirm() {
    setReplaceConfirmOpen(false);
    void handleGtipQuery();
  }

  async function handleSendToApproval() {
    const customerId = selectedCustomerId();
    if (!customerId) {
      toast('Önce müşteri seçin');
      return;
    }
    if (results.length === 0) {
      toast('Onaya gönderilecek sorgu sonucu yok');
      return;
    }
    setSending(true);
    try {
      const outcome = await gtipService.sendCustomerQueryToApproval(customerId, results);
      setResults([]);
      setLastParseMeta(null);
      const duplicates = outcome.skippedDuplicates ?? 0;
      const existing = outcome.skippedExisting ?? 0;
      const parts = [`${outcome.sent} kayıt GTİP Onay’a gönderildi`];
      if (duplicates > 0) {
        parts.push(`${duplicates} satır aynı malzeme no ile tekrar ettiği için atlandı`);
      }
      if (existing > 0) {
        parts.push(`${existing} kayıt bu müşteri için zaten kayıtlı olduğu için atlandı`);
      }
      toast(parts.join('. ') + '.');
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Onaya gönderme başarısız';
      toast(msg);
    } finally {
      setSending(false);
    }
  }

  function handleSaveRecord(materialNo: string, description: string, gtipNo: string) {
    const next: GtipQueryResult[] = [
      {
        id: `qr-${Date.now()}`,
        materialNo,
        description,
        foundGtip: gtipNo || '—',
        status: 'Bulundu',
        approvalStatus: 'Onay Bekliyor',
      },
      ...results,
    ];
    setResults(next);
    setDrawerOpen(false);
    toast('GTİP kaydı onay sürecine gönderildi');
    void persistResults(next).catch(() => toast('Kayıt kaydedilemedi'));
  }

  const foundCount   = results.filter((r) => r.status === 'Bulundu').length;
  const pendingCount = results.filter((r) => r.approvalStatus === 'Onay Bekliyor').length;
  const entryNeeded  = results.filter((r) => r.approvalStatus === 'Giriş Bekliyor').length;

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
          Müşteri GTİP Sorgulama
        </h1>
        <p className="text-[12.5px] text-muted mt-1 max-w-[580px]">
          Müşterilerin fatura kesmeden önce GTİP kodu öğrenmek istediği malzeme talepleri. Sorgu sonuçları onay sürecine gönderilir.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="relative overflow-hidden">
          <StatCard value={results.length} label="Toplam Sorgu Kalemi" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={foundCount} label="GTİP Bulundu" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={pendingCount} label="Onay Bekliyor" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={entryNeeded} label="Operasyon Girişi Gerekli" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[13px]">Yükleniyor…</span>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: '340px 1fr' }}>
          {/* Form panel */}
          <Card>
            <CardHead
              title="GTİP Sorgulama Talebi"
              sub="Müşteri fatura kesmeden GTİP öğrenmek istediğinde kullanılır"
            />
            <CardBody>
              <div className="mb-4">
                <UploadBox
                  title="Liste / Doküman Yükle"
                  hint="Fatura PDF — maks. 25 MB"
                  accept="application/pdf,.pdf"
                  onFiles={(files) => {
                    const file = files[0] ?? null;
                    setUploadedFile(file);
                    if (file) toast(`${file.name} seçildi`);
                  }}
                />
              </div>

              <div className="space-y-3">
                <Field label="Müşteri" htmlFor="gq-customer">
                  <Select
                    id="gq-customer"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </Select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Talep Kaynağı" htmlFor="gq-source">
                    <Select
                      id="gq-source"
                      value={requestSource}
                      onChange={(e) => setRequestSource(e.target.value)}
                    >
                      <option>Mail</option>
                      <option>WhatsApp</option>
                      <option>Sistem</option>
                    </Select>
                  </Field>
                  <Field label="Talep Statüsü" htmlFor="gq-status">
                    <Select
                      id="gq-status"
                      value={requestStatus}
                      onChange={(e) => setRequestStatus(e.target.value)}
                    >
                      <option>Yeni Talep</option>
                      <option>Operasyon Bekliyor</option>
                      <option>Tamamlandı</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Manuel Ürün / Malzeme Listesi" htmlFor="gq-manual">
                  <Textarea
                    id="gq-manual"
                    value={manualList}
                    onChange={(e) => setManualList(e.target.value)}
                    rows={4}
                    placeholder="Her satıra bir malzeme no ve tanım girin…"
                  />
                </Field>

                <div className="flex gap-2.5 pt-1">
                  <Button
                    variant="blue"
                    icon={parsing ? Loader2 : Search}
                    disabled={parsing || sending || !uploadedFile}
                    className={parsing ? '[&_svg]:animate-spin' : ''}
                    onClick={handleGtipQueryClick}
                  >
                    {parsing ? 'Sorgulanıyor…' : 'GTİP Sorgulat'}
                  </Button>
                  <Button
                    variant="primary"
                    icon={Send}
                    disabled={results.length === 0}
                    onClick={() => toast('Sorgu sonucu müşteriye gönderildi')}
                  >
                    Sonucu Müşteriye Gönder
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Results panel */}
          <Card>
            <CardHead
              title="Sorgu Sonuçları"
              sub={
                lastParseMeta
                  ? `${lastParseMeta.fileName} · ${lastParseMeta.itemCount} kalem · ${lastParseMeta.pdfType}`
                  : 'Yüklenen faturadan çıkarılan malzeme ve GTİP kayıtları'
              }
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    icon={sending ? Loader2 : Send}
                    size="sm"
                    disabled={sending || parsing || results.length === 0}
                    className={sending ? '[&_svg]:animate-spin' : ''}
                    onClick={() => void handleSendToApproval()}
                  >
                    {sending ? 'Gönderiliyor…' : 'Onaya Gönder'}
                  </Button>
                  <Button variant="default" icon={Plus} size="sm" onClick={openDrawer}>
                    GTİP Kaydı Ekle
                  </Button>
                </div>
              }
            />
            {results.length === 0 ? (
              <div className="px-6 py-16 text-center text-[13px] text-muted">
                Henüz sorgu sonucu yok. PDF yükleyip &quot;GTİP Sorgulat&quot; butonuna basın.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Malzeme No</Th>
                    <Th>Tanım</Th>
                    <Th>Bulunan GTİP</Th>
                    <Th>Durum</Th>
                    <Th>Onay Durumu</Th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <Tr
                      key={r.id}
                      className={r.approvalStatus === 'Giriş Bekliyor' ? '!bg-warn-tint' : undefined}
                    >
                      <Td><span className="font-mono text-[13px]">{r.materialNo}</span></Td>
                      <Td><span className="text-[13px]">{r.description}</span></Td>
                      <Td>
                        <span className={`font-mono text-[13px] ${r.foundGtip === '—' ? 'text-muted' : ''}`}>
                          {r.foundGtip}
                        </span>
                      </Td>
                      <Td><Pill variant={queryStatusVariant(r.status)}>{r.status}</Pill></Td>
                      <Td><Pill variant={approvalVariant(r.approvalStatus)}>{r.approvalStatus}</Pill></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      <GtipRecordDrawer
        open={drawerOpen}
        target={drawerTarget}
        initialCustomer={customer}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveRecord}
      />

      <Modal
        open={replaceConfirmOpen}
        onClose={handleReplaceCancel}
        title="Mevcut sorgu sonuçları silinsin mi?"
        footer={
          <>
            <Button onClick={handleReplaceCancel}>Hayır, kalsın</Button>
            <Button variant="danger" onClick={handleReplaceConfirm}>
              Evet, sil ve sorgula
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-text leading-relaxed">
          Tabloda kayıtlı sorgu sonuçları var. Yeni PDF ile GTİP sorgulatırsanız bu sonuçlar
          silinecek ve veritabanından da kaldırılacak. Hayır derseniz mevcut sonuçlar olduğu gibi
          kalır, yeni sorgu çalışmaz.
        </p>
      </Modal>
    </div>
  );
}
