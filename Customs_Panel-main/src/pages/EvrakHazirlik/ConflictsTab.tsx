import { useState } from 'react';
import { Send, Pencil } from 'lucide-react';
import type { EvrakConflictRow, ConflictType } from '../../types';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import Note from '../../components/ui/Note';
import { useToast } from '../../components/ui/Toast';

function conflictTypePill(type: ConflictType) {
  if (type === 'Eksik Evrak') return <Pill variant="warn">Eksik</Pill>;
  return <Pill variant="red">Uyumsuz</Pill>;
}

interface ConflictsTabProps {
  conflicts: EvrakConflictRow[];
}

export default function ConflictsTab({ conflicts }: ConflictsTabProps) {
  const { toast } = useToast();
  const [note, setNote] = useState(
    'Fatura ve taşıma evrakındaki kap / kilo bilgileri birbirinden farklıdır. Lütfen doğru evrakları paylaşınız.'
  );

  return (
    <div>
      <Note variant="warn">
        Eksik evraklar ve farklı dokümanlarda çelişen alanlar burada birlikte gösterilir. Müşteriye bildirim
        gönderilebilir veya yetkiye göre eksik evrakla yazım başlatılabilir. Sonradan gelen evrakların
        beyannameye dahil edilmesi Beyanname Yazım &amp; Kontrol'de yönetilir.
      </Note>

      {conflicts.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-muted">
          Bu dosyada eksik evrak veya veri uyumsuzluğu yok.
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Kontrol Tipi</Th>
              <Th>Evrak / Alan</Th>
              <Th>Kaynak 1</Th>
              <Th>Değer 1</Th>
              <Th>Kaynak 2</Th>
              <Th>Değer 2</Th>
              <Th>Önerilen Aksiyon</Th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((row) => {
              const isMissing = row.type === 'Eksik Evrak';
              return (
                <Tr
                  key={row.id}
                  className={isMissing ? '!bg-[#fffbf2]' : '!bg-[#fef8f8]'}
                >
                  <Td>{conflictTypePill(row.type)}</Td>
                  <Td><span className="font-semibold text-[13px]">{row.docOrField}</span></Td>
                  <Td><span className="text-muted text-[12.5px]">{row.source1}</span></Td>
                  <Td><span className="font-mono text-[13px]">{row.value1}</span></Td>
                  <Td><span className="text-muted text-[12.5px]">{row.source2}</span></Td>
                  <Td><span className="font-mono text-[13px]">{row.value2}</span></Td>
                  <Td><span className="text-muted text-[12.5px]">{row.suggestedAction}</span></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {/* Notification textarea + actions */}
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-[11.5px] font-bold uppercase tracking-wide text-muted mb-1.5">
            Müşteriye Gönderilecek Uyumsuzluk Notu
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full border border-line-strong rounded-[8px] px-3 py-2.5 text-[13px] text-text font-[inherit] resize-y min-h-[72px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
          />
        </div>
        <div className="flex gap-2.5 justify-end">
          <Button icon={Pencil} onClick={() => toast('Manuel karar modu aktif')}>
            Manuel Karar Ver
          </Button>
          <Button
            variant="primary"
            icon={Send}
            onClick={() => toast('Uyumsuzluk bildirimi müşteriye gönderildi')}
          >
            Müşteriye Uyumsuzluk Bildir
          </Button>
        </div>
      </div>
    </div>
  );
}
