import { Eye } from 'lucide-react';
import type { EvrakDocRow, DocReadinessStatus, DocRequiredFlag } from '../../types';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';

// ─── Pill variants ─────────────────────────────────────────────────────────────

function statusVariant(s: DocReadinessStatus) {
  if (s === 'Geldi')   return 'ok'   as const;
  if (s === 'Eksik')   return 'warn' as const;
  return 'blue' as const; // Koşullu
}

function requiredVariant(r: DocRequiredFlag) {
  if (r === 'Evet')     return 'red'  as const;
  if (r === 'Koşullu')  return 'blue' as const;
  return 'gray' as const;
}

interface DocStatusTabProps {
  docs: EvrakDocRow[];
  onPreview: (docName: string) => void;
}

export default function DocStatusTab({ docs, onPreview }: DocStatusTabProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Evrak</Th>
          <Th>Gerekli</Th>
          <Th>Durum</Th>
          <Th>Geliş Kaynağı</Th>
          <Th>Son İşlem</Th>
          <Th>Açıklama</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => {
          const isMissing = doc.status === 'Eksik';
          const canPreview = doc.status === 'Geldi';
          return (
            <Tr
              key={doc.id}
              className={isMissing ? '!bg-[#fffbf2]' : undefined}
            >
              <Td><span className="font-semibold text-[13px]">{doc.name}</span></Td>
              <Td><Pill variant={requiredVariant(doc.required)}>{doc.required}</Pill></Td>
              <Td><Pill variant={statusVariant(doc.status)}>{doc.status}</Pill></Td>
              <Td><span className="text-muted text-[12.5px]">{doc.source}</span></Td>
              <Td><span className="text-muted text-[12.5px]">{doc.lastAction}</span></Td>
              <Td><span className="text-muted text-[12.5px]">{doc.note}</span></Td>
              <Td>
                {canPreview ? (
                  <Button size="sm" icon={Eye} onClick={() => onPreview(doc.name)}>
                    Görüntüle
                  </Button>
                ) : (
                  <span className="text-muted-2 text-[12px]">—</span>
                )}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
