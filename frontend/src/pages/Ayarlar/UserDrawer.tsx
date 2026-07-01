import { useState, useEffect } from 'react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Fields';
import type { AppUser, AppUserRole, AppUserStatus, OperationType, ApproverLevel, SpecialAction, MenuAction } from '../../types';

interface UserDrawerProps {
  open: boolean;
  initial?: AppUser;
  onClose: () => void;
  onSave: (data: Omit<AppUser, 'id'>) => void;
  saving?: boolean;
}

export default function UserDrawer({ open, initial, onClose, onSave, saving = false }: UserDrawerProps) {
  const [name,   setName]   = useState('');
  const [email,  setEmail]  = useState('');
  const [role,   setRole]   = useState<AppUserRole>('Operasyon');
  const [status, setStatus] = useState<AppUserStatus>('Aktif');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setEmail(initial.email);
      setRole(initial.role);
      setStatus(initial.status);
    } else {
      setName('');
      setEmail('');
      setRole('Operasyon');
      setStatus('Aktif');
    }
  }, [open, initial]);

  function handleSave() {
    onSave({
      name,
      email,
      role,
      status,
      capabilities: initial?.capabilities ?? [],
      operationTypes: initial?.operationTypes ?? ([] as OperationType[]),
      menuAccess: initial?.menuAccess ?? [],
      menuActions: initial?.menuActions ?? ({} as Record<string, MenuAction[]>),
      approverLevel: initial?.approverLevel ?? ('none' as ApproverLevel),
      specialActions: initial?.specialActions ?? ([] as SpecialAction[]),
      screenPermissions: initial?.screenPermissions ?? {},
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
      subtitle={initial?.name ?? 'Temel bilgileri doldurun'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !name.trim() || !email.trim()}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] text-muted leading-relaxed">
          Kullanıcının temel bilgilerini girin. Yetki tanımları ana ekrandan yapılır.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ad Soyad" htmlFor="u-name">
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ad Soyad"
            />
          </Field>
          <Field label="E-posta" htmlFor="u-email">
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kullanici@firma.com"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rol" htmlFor="u-role">
            <Select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppUserRole)}
            >
              <option value="Admin">Admin</option>
              <option value="Yönetici">Yönetici</option>
              <option value="MT Yönetici">MT Yönetici</option>
              <option value="Operasyon">Operasyon</option>
              <option value="MT">MT</option>
              <option value="Saha">Saha</option>
            </Select>
          </Field>
          <Field label="Durum" htmlFor="u-status">
            <Select
              id="u-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AppUserStatus)}
            >
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
            </Select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}
