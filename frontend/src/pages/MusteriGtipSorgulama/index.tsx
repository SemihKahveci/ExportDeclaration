import { useEffect, useState } from 'react';
import { Search, Send, Plus, Loader2 } from 'lucide-react';
import type { GtipQueryResult, QueryResultStatus, QueryApprovalStatus } from '../../types';
import { gtipService } from '../../services/gtip';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { Field, Select, Textarea } from '../../components/ui/Fields';
import UploadBox from '../../components/ui/UploadBox';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import GtipRecordDrawer from '../GtipHazirlik/GtipRecordDrawer';

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
  const [results, setResults]             = useState<GtipQueryResult[]>([]);
  const [customer, setCustomer]           = useState('Arçelik A.Ş.');
  const [requestSource, setRequestSource] = useState('Mail');
  const [requestStatus, setRequestStatus] = useState('Yeni Talep');
  const [manualList, setManualList]       = useState(
    'MLZ-100701 Elektronik kontrol kartı\nMLZ-100990 Paslanmaz çelik iç tank'
  );
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [drawerTarget, setDrawerTarget]   = useState<GtipQueryResult | null>(null);

  useEffect(() => {
    gtipService.getCustomerQueryResults().then((r) => {
      setResults(r);
      setLoading(false);
    });
  }, []);

  function openDrawer() {
    const target = results.find((r) => r.approvalStatus === 'Giriş Bekliyor')
      ?? results.find((r) => r.status === 'Operasyon Girişi Gerekli')
      ?? null;
    setDrawerTarget(target);
    setDrawerOpen(true);
  }

  function handleSaveRecord(materialNo: string, description: string, gtipNo: string) {
    setResults((prev) => [
      {
        id: `qr-${Date.now()}`,
        materialNo,
        description,
        foundGtip: gtipNo || '—',
        status: 'Bulundu' as const,
        approvalStatus: 'Onay Bekliyor' as const,
      },
      ...prev,
    ]);
    setDrawerOpen(false);
    toast('GTİP kaydı onay sürecine gönderildi');
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
                  hint="Malzeme listesi, Excel, PDF veya görsel"
                  onFiles={(files) => {
                    if (files.length) toast(files[0].name + ' yüklendi');
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
                    <option>Arçelik A.Ş.</option>
                    <option>Ford Otosan</option>
                    <option>Vestel Ticaret</option>
                    <option>BSH Ev Aletleri</option>
                    <option>Eczacıbaşı</option>
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
                    icon={Search}
                    onClick={() => toast('GTİP sorgulama tamamlandı')}
                  >
                    GTİP Sorgulat
                  </Button>
                  <Button
                    variant="primary"
                    icon={Send}
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
              sub="Müşteri bazlı GTİP / Malzeme kayıtlarından karşılanır"
              actions={
                <Button variant="primary" icon={Plus} size="sm" onClick={openDrawer}>
                  GTİP Kaydı Ekle
                </Button>
              }
            />
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
          </Card>
        </div>
      )}

      <GtipRecordDrawer
        open={drawerOpen}
        target={drawerTarget}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveRecord}
      />
    </div>
  );
}
