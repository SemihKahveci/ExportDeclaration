import { useState } from 'react';
import { Search, Send, Plus } from 'lucide-react';
import type { GtipQueryResult, QueryResultStatus, QueryApprovalStatus } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import { Field, Select, Textarea } from '../../components/ui/Fields';
import UploadBox from '../../components/ui/UploadBox';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import GtipRecordDrawer from './GtipRecordDrawer';

// ─── Pill variants ────────────────────────────────────────────────────────────

function statusPillVariant(v: QueryResultStatus) {
  return v === 'Bulundu' ? 'ok' as const : 'warn' as const;
}

function approvalPillVariant(v: QueryApprovalStatus) {
  if (v === 'Onaylı')        return 'ok' as const;
  if (v === 'Onay Bekliyor') return 'blue' as const;
  return 'warn' as const; // Giriş Bekliyor
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface QueryTabProps {
  initialResults: GtipQueryResult[];
}

export default function QueryTab({ initialResults }: QueryTabProps) {
  const { toast } = useToast();
  const [results, setResults]           = useState<GtipQueryResult[]>(initialResults);
  const [customer, setCustomer]         = useState('Arçelik A.Ş.');
  const [requestSource, setRequestSource] = useState('Mail');
  const [requestStatus, setRequestStatus] = useState('Yeni Talep');
  const [manualList, setManualList]     = useState(
    'MLZ-100701 Elektronik kontrol kartı\nMLZ-100990 Paslanmaz çelik iç tank'
  );
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<GtipQueryResult | null>(null);

  function handleRunQuery() {
    setResults((prev) => prev.map((r) => ({ ...r })));
    toast('GTİP sorgulama tamamlandı');
  }

  function handleSendResult() {
    toast('Sorgu sonucu müşteriye gönderildi');
  }

  function openDrawer() {
    const target = results.find((r) => r.approvalStatus === 'Giriş Bekliyor')
      ?? results.find((r) => r.status === 'Operasyon Girişi Gerekli')
      ?? null;
    setDrawerTarget(target);
    setDrawerOpen(true);
  }

  function handleSaveGtipRecord(
    materialNo: string,
    description: string,
    gtipNo: string,
  ) {
    const newRecord: GtipQueryResult = {
      id: `qr-${Date.now()}`,
      materialNo,
      description,
      foundGtip: gtipNo || '—',
      status: 'Bulundu',
      approvalStatus: 'Onay Bekliyor',
    };
    setResults((prev) => [newRecord, ...prev]);
    setDrawerOpen(false);
    toast('GTİP kaydı onay sürecine gönderildi');
  }

  return (
    <div className="space-y-4">
      {/* Two-column: form + results */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '340px 1fr' }}>
        {/* Form */}
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
              <Field label="Müşteri" htmlFor="q-customer">
                <Select id="q-customer" value={customer} onChange={(e) => setCustomer(e.target.value)}>
                  <option>Arçelik A.Ş.</option>
                  <option>Valeo eAutomotive Hungary Kft.</option>
                  <option>Ford Otosan</option>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Talep Kaynağı" htmlFor="q-source">
                  <Select id="q-source" value={requestSource} onChange={(e) => setRequestSource(e.target.value)}>
                    <option>Mail</option>
                    <option>WhatsApp</option>
                    <option>Sistem</option>
                  </Select>
                </Field>
                <Field label="Talep Statüsü" htmlFor="q-status">
                  <Select id="q-status" value={requestStatus} onChange={(e) => setRequestStatus(e.target.value)}>
                    <option>Yeni Talep</option>
                    <option>Operasyon Bekliyor</option>
                    <option>Tamamlandı</option>
                  </Select>
                </Field>
              </div>

              <Field label="Manuel Ürün / Malzeme Listesi" htmlFor="q-manual">
                <Textarea
                  id="q-manual"
                  value={manualList}
                  onChange={(e) => setManualList(e.target.value)}
                  rows={4}
                />
              </Field>

              <div className="flex gap-2.5 pt-1">
                <Button variant="blue" icon={Search} onClick={handleRunQuery}>
                  GTİP Sorgulat
                </Button>
                <Button variant="primary" icon={Send} onClick={handleSendResult}>
                  Sonucu Müşteriye Gönder
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Results */}
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
              {results.map((r) => {
                const isWaiting = r.approvalStatus === 'Giriş Bekliyor';
                return (
                  <Tr
                    key={r.id}
                    className={isWaiting ? '!bg-warn-tint' : undefined}
                  >
                    <Td><span className="font-mono text-[13px]">{r.materialNo}</span></Td>
                    <Td><span className="text-[13px]">{r.description}</span></Td>
                    <Td>
                      <span
                        className={`font-mono text-[13px] ${r.foundGtip === '—' ? 'text-muted' : ''}`}
                      >
                        {r.foundGtip}
                      </span>
                    </Td>
                    <Td><Pill variant={statusPillVariant(r.status)}>{r.status}</Pill></Td>
                    <Td><Pill variant={approvalPillVariant(r.approvalStatus)}>{r.approvalStatus}</Pill></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* Drawer */}
      <GtipRecordDrawer
        open={drawerOpen}
        target={drawerTarget}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveGtipRecord}
      />
    </div>
  );
}
