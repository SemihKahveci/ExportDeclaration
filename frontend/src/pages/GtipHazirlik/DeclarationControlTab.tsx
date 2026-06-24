import { Send } from 'lucide-react';
import type { GtipDeclaration, GtipComplianceStatus } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

// ─── Pill variant helpers ─────────────────────────────────────────────────────

function compliancePillVariant(v: GtipComplianceStatus) {
  if (v === 'Uyumlu') return 'ok' as const;
  if (v === 'Uyumsuz') return 'red' as const;
  return 'warn' as const; // Eksik
}

function declarationStatusPillVariant(variant: GtipDeclaration['statusVariant']) {
  if (variant === 'ok')     return 'ok' as const;
  if (variant === 'urgent') return 'red' as const;
  return 'warn' as const;
}

// ─── Compliance status label ──────────────────────────────────────────────────

function statusLabelStyle(variant: GtipDeclaration['statusVariant']) {
  if (variant === 'ok')     return 'font-bold text-ok text-[13px]';
  if (variant === 'urgent') return 'font-bold text-hat-red text-[13px]';
  return 'font-bold text-warn text-[13px]';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DeclarationControlTabProps {
  declarations: GtipDeclaration[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function DeclarationControlTab({
  declarations,
  selectedId,
  onSelect,
}: DeclarationControlTabProps) {
  const { toast } = useToast();
  const selected = declarations.find((d) => d.id === selectedId) ?? declarations[0];

  return (
    <div className="space-y-4">
      {/* Two-column: declaration list + summary */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '340px 1fr' }}>
        {/* Declaration list */}
        <Card>
          <CardHead
            title="Beyanname Seçimi"
            sub="GTİP kontrolü yapılmış beyannameler"
          />
          <Table>
            <thead>
              <tr>
                <Th>Referans No</Th>
                <Th>Müşteri</Th>
                <Th>Durum</Th>
              </tr>
            </thead>
            <tbody>
              {declarations.map((d) => (
                <Tr
                  key={d.id}
                  className={d.id === selectedId ? 'bg-accent-tint' : undefined}
                  onClick={() => { onSelect(d.id); toast(d.ref + ' seçildi'); }}
                >
                  <Td><span className="font-mono text-[13px]">{d.ref}</span></Td>
                  <Td><span className="text-[13px]">{d.customer}</span></Td>
                  <Td>
                    <Pill variant={declarationStatusPillVariant(d.statusVariant)}>
                      {d.statusVariant === 'ok' ? 'Uyumlu' : d.statusVariant === 'urgent' ? 'Uyumsuz' : 'Eksik'}
                    </Pill>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Summary */}
        {selected && (
          <Card>
            <CardHead
              title="Seçili Beyanname Özeti"
              sub="Satıra tıklayınca beyanname kalemleri aşağıda güncellenir"
            />
            <CardBody>
              <div className="space-y-2.5">
                {[
                  { label: 'Referans',      value: <span className="font-mono font-semibold text-text-strong">{selected.ref}</span> },
                  { label: 'Müşteri',       value: <span className="font-semibold text-text-strong">{selected.customer}</span> },
                  { label: 'Belge Tipi',    value: <span className="text-text">e-Fatura XML</span> },
                  { label: 'Kalem Sayısı',  value: <span className="font-semibold text-text-strong">{selected.itemCount}</span> },
                  { label: 'Kontrol Durumu', value: <span className={statusLabelStyle(selected.statusVariant)}>{selected.statusLabel}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-[13px]">
                    <span className="text-muted">{label}</span>
                    {value}
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-muted mt-4">
                Fatura GTİP'leri ilk dosya ekranında okunmuştur.
              </p>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Comparison table */}
      {selected && (
        <Card>
          <CardHead
            title="Beyanname Kalemleri GTİP Karşılaştırması"
            sub="Malzeme tanımı, sistemdeki GTİP ve müşterinin faturada yazdığı GTİP karşılaştırılır"
            actions={
              <Button
                icon={Send}
                onClick={() => toast('GTİP kontrol sonucu müşteriye bildirilecek')}
              >
                Müşteriye Bilgilendirme Gönder
              </Button>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Kalem No</Th>
                <Th>Malzeme No</Th>
                <Th>Malzeme Tanımı</Th>
                <Th>Sistemdeki GTİP</Th>
                <Th>Müşterinin GTİP'i</Th>
                <Th>Uyum</Th>
                <Th>Açıklama</Th>
              </tr>
            </thead>
            <tbody>
              {selected.items.map((item) => (
                <Tr key={item.lineNo}>
                  <Td><span className="font-mono text-[13px]">{item.lineNo}</span></Td>
                  <Td><span className="font-mono text-[13px]">{item.materialNo}</span></Td>
                  <Td><span className="text-[13px]">{item.materialDesc}</span></Td>
                  <Td><span className="font-mono text-[13px]">{item.systemGtip}</span></Td>
                  <Td>
                    <span className={`font-mono text-[13px] ${item.customerGtip === 'Boş' ? 'text-muted' : ''}`}>
                      {item.customerGtip}
                    </span>
                  </Td>
                  <Td><Pill variant={compliancePillVariant(item.compliance)}>{item.compliance}</Pill></Td>
                  <Td><span className="text-[12.5px] text-muted">{item.note}</span></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
