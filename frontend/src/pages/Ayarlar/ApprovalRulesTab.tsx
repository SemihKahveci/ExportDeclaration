import { useState } from 'react';
import { Save } from 'lucide-react';
import type { DeclarationApprovalRules } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

const DECLARATION_TYPES: { key: keyof DeclarationApprovalRules; label: string }[] = [
  { key: 'ithalat', label: 'İthalat Beyannamesi' },
  { key: 'ihracat', label: 'İhracat Beyannamesi' },
  { key: 'transit', label: 'Transit Beyannamesi' },
  { key: 'antrepo', label: 'Antrepo Beyannamesi' },
];

interface ApprovalRulesTabProps {
  rules: DeclarationApprovalRules;
  onChange: (rules: DeclarationApprovalRules) => void;
}

export default function ApprovalRulesTab({ rules, onChange }: ApprovalRulesTabProps) {
  const { toast } = useToast();
  const [local, setLocal] = useState<DeclarationApprovalRules>({ ...rules });

  function setLevel(key: keyof DeclarationApprovalRules, level: 1 | 2) {
    setLocal((prev) => ({ ...prev, [key]: level }));
  }

  function handleSave() {
    onChange(local);
    toast('Beyanname onay kuralları güncellendi');
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-[15px] font-bold text-text-strong">Beyanname Onay Kuralları</h2>
        <p className="text-[12.5px] text-muted mt-1">
          Her beyanname türü için kaç seviye onay gerektiğini tanımlayın.
          1. Seviye Onaycı, tek seviyeli süreçlerde nihai onayı verir.
          2. Seviye Onaycı, iki seviyeli süreçlerde nihai onayı tamamlar.
        </p>
      </div>

      <Card>
        <CardHead
          title="Onay Seviyesi Tanımları"
          sub="Beyanname türü başına onay seviyesi sayısı"
        />
        <CardBody className="space-y-3">
          {DECLARATION_TYPES.map(({ key, label }) => {
            const level = local[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-xl border border-line bg-surface-2"
              >
                <span className="text-[13px] font-semibold text-text-strong">{label}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLevel(key, 1)}
                    className={[
                      'px-4 py-2 rounded-lg border text-[12.5px] font-semibold transition-colors',
                      level === 1
                        ? 'bg-accent-tint border-accent text-accent'
                        : 'bg-surface border-line-strong text-muted hover:border-muted-2 hover:text-text',
                    ].join(' ')}
                  >
                    1 Seviye
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevel(key, 2)}
                    className={[
                      'px-4 py-2 rounded-lg border text-[12.5px] font-semibold transition-colors',
                      level === 2
                        ? 'bg-accent-tint border-accent text-accent'
                        : 'bg-surface border-line-strong text-muted hover:border-muted-2 hover:text-text',
                    ].join(' ')}
                  >
                    2 Seviye
                  </button>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="flex">
        <Button variant="primary" icon={Save} onClick={handleSave}>
          Onay Kurallarını Kaydet
        </Button>
      </div>
    </div>
  );
}
