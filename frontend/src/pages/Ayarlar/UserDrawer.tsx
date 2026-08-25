import { useState, useEffect } from 'react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Fields';
import type { AppUser, AppUserRole, AppUserStatus, OperationType, ApproverLevel, SpecialAction, MenuAction } from '../../types';
import type { CreateAppUserPayload, UpdateAppUserPayload } from '../../api/userApi';

interface UserDrawerProps {
  open: boolean;
  initial?: AppUser;
  onClose: () => void;
  onSave: (data: CreateAppUserPayload | UpdateAppUserPayload) => void;
  saving?: boolean;
}

export default function UserDrawer({ open, initial, onClose, onSave, saving = false }: UserDrawerProps) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppUserRole>('Operasyon');
  const [status, setStatus] = useState<AppUserStatus>('Aktif');

  useEffect(() => {
    if (!open) return;
    if (initial) { setName(initial.name); setEmail(initial.email); setRole(initial.role); setStatus(initial.status); }
    else { setName(''); setEmail(''); setRole('Operasyon'); setStatus('Aktif'); }
    setPassword('');
  }, [open, initial]);

  function handleSave() {
    const base = {
      name, email, role, status,
      capabilities: initial?.capabilities ?? [],
      operationTypes: initial?.operationTypes ?? ([] as OperationType[]),
      menuAccess: initial?.menuAccess ?? [],
      menuActions: initial?.menuActions ?? ({} as Record<string, MenuAction[]>),
      approverLevel: initial?.approverLevel ?? ('none' as ApproverLevel),
      specialActions: initial?.specialActions ?? ([] as SpecialAction[]),
      screenPermissions: initial?.screenPermissions ?? {},
    };
    onSave(initial ? { ...base, ...(password ? { password } : {}) } : base);
  }

  const passwordInvalid = Boolean(initial) && password.length > 0 && password.length < 6;
  return (
    <Drawer open={open} onClose={onClose} title={initial ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'} subtitle={initial?.name ?? 'Temel bilgileri doldurun'} footer={<><Button onClick={onClose} disabled={saving}>Vazgeç</Button><Button variant="primary" onClick={handleSave} disabled={saving || !name.trim() || !email.trim() || passwordInvalid}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Button></>}>
      <div className="space-y-4">
        <p className="text-[12.5px] text-muted leading-relaxed">
          {initial
            ? 'Kullanıcının temel bilgilerini güncelleyin. Şifreyi değiştirmek istemezseniz boş bırakın.'
            : 'Kullanıcının temel bilgilerini tanımlayın. 6 haneli giriş şifresi otomatik üretilir ve mail ile gönderilir. Ekran yetkileri ana ekrandan yönetilir.'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ad Soyad" htmlFor="u-name"><Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" /></Field>
          <Field label="E-posta" htmlFor="u-email"><Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kullanici@firma.com" /></Field>
        </div>
        {initial && (
          <Field label="Yeni Şifre (isteğe bağlı)" htmlFor="u-password">
            <Input id="u-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Değiştirmeyecekseniz boş bırakın" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rol" htmlFor="u-role"><Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as AppUserRole)}><option value="Admin">Admin</option><option value="Yönetici">Yönetici</option><option value="MT Yönetici">MT Yönetici</option><option value="Operasyon">Operasyon</option><option value="MT">MT</option><option value="Saha">Saha</option></Select></Field>
          <Field label="Durum" htmlFor="u-status"><Select id="u-status" value={status} onChange={(e) => setStatus(e.target.value as AppUserStatus)}><option value="Aktif">Aktif</option><option value="Pasif">Pasif</option></Select></Field>
        </div>
      </div>
    </Drawer>
  );
}
