import { useState } from 'react';
import { Plus, Pencil, Search } from 'lucide-react';
import type { AppUser, AppUserRole, AppUserStatus, OperationType, ApproverLevel, ScreenPermission } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';

// ─── Constants ────────────────────────────────────────────────────────────────

const OPERATION_TYPE_OPTIONS: { value: OperationType; label: string }[] = [
  { value: 'ithalat', label: 'İthalat' },
  { value: 'ihracat', label: 'İhracat' },
  { value: 'transit', label: 'Transit' },
  { value: 'antrepo', label: 'Antrepo' },
];

interface ScreenItem  { key: string; label: string }
interface ScreenGroup { label: string; items: ScreenItem[] }

const SCREEN_GROUPS: ScreenGroup[] = [
  {
    label: 'Operasyon',
    items: [
      { key: 'dosya-takip',             label: 'Dosya Takip'                           },
      { key: 'beyanname',               label: 'Beyanname Yazım & MT Kontrol'           },
      { key: 'beyanname-onay',          label: 'Beyanname Onay'                         },
      { key: 'beyanname-tescil',        label: 'Beyanname Tescil'                       },
      { key: 'kapanis-evraklar',        label: 'Kapanış · Evraklar & Beyanname Maliyetleri' },
      { key: 'kapanis-evrak-yukleme',   label: 'Kapanış · Operasyon Evrak Yükleme'      },
      { key: 'kapanis-onay',            label: 'Kapanış · Kapanış Onay'                 },
    ],
  },
  {
    label: 'GTİP / Malzeme',
    items: [
      { key: 'musteri-gtip-sorgulama', label: 'Müşteri GTİP Sorgulama' },
      { key: 'gtip-malzeme',           label: 'GTİP Veri Tabanı'       },
      { key: 'gtip-onay',              label: 'GTİP Onay'              },
    ],
  },
  {
    label: 'Arşiv',
    items: [
      { key: 'arsiv/ithalat', label: 'İthalat Arşivi' },
      { key: 'arsiv/ihracat', label: 'İhracat Arşivi' },
      { key: 'arsiv/transit', label: 'Transit Arşivi' },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { key: 'musteriler', label: 'Müşteriler' },
      { key: 'evraklar',   label: 'Evraklar'   },
      { key: 'mailler',    label: 'Mailler'     },
      { key: 'ayarlar',    label: 'Ayarlar'     },
    ],
  },
];

const ROLE_OPTIONS: { value: AppUserRole; label: string; desc: string }[] = [
  { value: 'Admin',       label: 'Admin',            desc: 'Tüm ekranlara tam erişim'         },
  { value: 'Yönetici',    label: 'Yönetici',          desc: 'Geniş operasyon yetkileri'        },
  { value: 'MT Yönetici', label: 'MT Yöneticisi',     desc: 'MT ekibi ve kontrol yönetimi'     },
  { value: 'MT',          label: 'MT',                desc: 'MT kontrol işlemleri'             },
  { value: 'Operasyon',   label: 'Operasyon',         desc: 'Operasyon ekranları'              },
  { value: 'Saha',        label: 'Saha Kullanıcısı',  desc: 'Saha evrak yükleme'               },
];

const APPROVER_OPTIONS: { value: ApproverLevel; label: string; desc: string }[] = [
  { value: 'none',   label: 'Onaycı Değil',      desc: 'Onay adımı gerçekleştiremez'            },
  { value: 'first',  label: '1. Seviye Onaycı',  desc: '1-seviyeli süreçte final; 2-seviyeli süreçte 2. onaycıya gönderir' },
  { value: 'second', label: '2. Seviye Onaycı',  desc: '2-seviyeli süreçlerde nihai onaycı'      },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rolePillVariant(role: AppUserRole) {
  if (role === 'Admin')       return 'blue'   as const;
  if (role === 'Yönetici')    return 'blue'   as const;
  if (role === 'MT Yönetici') return 'green'  as const;
  if (role === 'Operasyon')   return 'accent' as const;
  if (role === 'MT')          return 'yellow' as const;
  return 'gray' as const;
}

function statusPillVariant(status: AppUserStatus) {
  return status === 'Aktif' ? 'ok' as const : 'gray' as const;
}

function roleLabel(role: AppUserRole): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Chip({
  label, checked, onChange,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'px-3 py-1.5 rounded-full border text-[12.5px] font-semibold transition-colors',
        checked
          ? 'bg-accent-tint border-accent text-accent'
          : 'bg-surface border-line-strong text-muted hover:border-muted-2 hover:text-text',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function PermToggle({
  label, checked, disabled, onChange,
}: {
  label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'px-2.5 py-1 rounded-md border text-[11.5px] font-semibold transition-colors whitespace-nowrap',
        disabled
          ? 'opacity-30 cursor-not-allowed border-line text-muted bg-surface'
          : checked
          ? 'bg-accent-tint border-accent text-accent'
          : 'border-line-strong text-muted hover:border-muted-2 hover:text-text bg-surface',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h3 className="text-[13px] font-bold text-text-strong">{title}</h3>
      {sub && <span className="text-[12px] text-muted">{sub}</span>}
    </div>
  );
}

// ─── Screen permission row ────────────────────────────────────────────────────

function PermissionRow({
  label, perm, onChange,
}: {
  label: string;
  perm: ScreenPermission;
  onChange: (p: ScreenPermission) => void;
}) {
  function toggleView(v: boolean) {
    onChange({ view: v, operate: v ? perm.operate : false });
  }
  function toggleOperate(v: boolean) {
    onChange({ view: v ? true : perm.view, operate: v });
  }
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-line bg-surface-2">
      <span className="flex-1 text-[12.5px] font-medium text-text leading-snug">{label}</span>
      <PermToggle label="Görüntüleme"     checked={perm.view}    onChange={toggleView} />
      <PermToggle label="İşlem Yapabilme" checked={perm.operate} disabled={!perm.view} onChange={toggleOperate} />
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface UsersTabLocalPerms {
  role: AppUserRole;
  operationTypes: OperationType[];
  screenPermissions: Record<string, ScreenPermission>;
  approverLevel: ApproverLevel;
}

interface UsersTabProps {
  users: AppUser[];
  selectedIdx: number;
  localPerms: UsersTabLocalPerms;
  onSelectUser: (idx: number) => void;
  onPermsChange: (patch: Partial<UsersTabLocalPerms>) => void;
  onSavePerms: () => void;
  onResetPerms: () => void;
  onNew: () => void;
  onEdit: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsersTab({
  users,
  selectedIdx,
  localPerms,
  onSelectUser,
  onPermsChange,
  onSavePerms,
  onResetPerms,
  onNew,
  onEdit,
}: UsersTabProps) {
  const sel = users[selectedIdx];
  const [search, setSearch] = useState('');

  const adminCount   = users.filter((u) => u.role === 'Admin' || u.role === 'Yönetici').length;
  const opsCount     = users.filter((u) => u.role === 'Operasyon' || u.role === 'MT Yönetici' || u.role === 'MT').length;
  const passiveCount = users.filter((u) => u.status === 'Pasif').length;

  const visible = search
    ? users.filter((u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  // ── Screen permission helpers ────────────────────────────────────────────────

  function getScreenPerm(key: string): ScreenPermission {
    return localPerms.screenPermissions[key] ?? { view: false, operate: false };
  }

  function setScreenPerm(key: string, perm: ScreenPermission) {
    onPermsChange({
      screenPermissions: { ...localPerms.screenPermissions, [key]: perm },
    });
  }

  function toggleOpType(val: OperationType, checked: boolean) {
    const next = checked
      ? [...localPerms.operationTypes, val]
      : localPerms.operationTypes.filter((v) => v !== val);
    onPermsChange({ operationTypes: next });
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={users.length} label="Toplam kullanıcı" />
        <StatCard value={adminCount}   label="Admin / Yönetici" />
        <StatCard value={opsCount}     label="Operasyon / MT"   />
        <StatCard value={passiveCount} label="Pasif kullanıcı"  />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '300px 1fr' }}>

        {/* ── Left: User list ─────────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Kullanıcılar"
            sub="Yetki ataması yapılacak kullanıcılar"
            actions={
              <Button variant="primary" size="sm" icon={Plus} onClick={onNew}>
                Yeni
              </Button>
            }
          />

          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="İsim veya e-posta ara…"
                className="w-full pl-7 pr-3 h-8 border border-line-strong rounded-[7px] text-[12.5px] text-text bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              />
            </div>
          </div>

          <div>
            {visible.length === 0 && (
              <div className="px-4 py-8 text-center text-muted text-[13px]">Kullanıcı bulunamadı.</div>
            )}
            {visible.map((u) => {
              const realIdx     = users.indexOf(u);
              const active      = realIdx === selectedIdx;
              const screenCount = Object.values(u.screenPermissions ?? {}).filter((p) => p.view).length;
              const permSummary = `${u.operationTypes.length} işlem tipi · ${screenCount} ekran`;
              return (
                <button
                  key={u.id}
                  onClick={() => onSelectUser(realIdx)}
                  className={[
                    'w-full text-left px-4 py-3 border-b border-line last:border-b-0 transition-colors',
                    active ? 'bg-accent-tint' : 'hover:bg-surface-2',
                  ].join(' ')}
                >
                  <div className="font-semibold text-text-strong text-[13.5px]">{u.name}</div>
                  <div className="font-mono text-[11.5px] text-muted mt-0.5">{u.email}</div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <Pill variant={rolePillVariant(u.role)}>{roleLabel(u.role)}</Pill>
                    <Pill variant={statusPillVariant(u.status)}>{u.status}</Pill>
                  </div>
                  <div className="text-[11px] text-muted-2 mt-1">{permSummary}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* ── Right: Permission detail ────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Kullanıcı Yetki Tanımı"
            sub={sel ? sel.name : 'Sol listeden kullanıcı seçin'}
            actions={
              sel && (
                <Button size="sm" icon={Pencil} onClick={onEdit}>
                  Düzenle
                </Button>
              )
            }
          />

          {sel ? (
            <CardBody className="space-y-7">

              {/* ── Kullanıcı Bilgileri (read-only) ──────────────────────── */}
              <section>
                <SectionHeader title="Kullanıcı Bilgileri" />
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'Ad Soyad', value: <span className="font-semibold text-text-strong">{sel.name}</span> },
                    { label: 'E-posta',  value: <span className="font-mono text-[12px]">{sel.email}</span> },
                    { label: 'Durum',    value: <Pill variant={statusPillVariant(sel.status)}>{sel.status}</Pill> },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-1 p-3 rounded-lg bg-surface-2 border border-line">
                      <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</span>
                      <span className="text-[13px]">{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 1. Kullanıcı Rolü ────────────────────────────────────── */}
              <section>
                <SectionHeader
                  title="1. Kullanıcı Rolü"
                  sub="Kullanıcının sistemdeki rolünü belirler"
                />
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map(({ value, label, desc }) => {
                    const active = localPerms.role === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onPermsChange({ role: value })}
                        className={[
                          'text-left px-3.5 py-3 rounded-[10px] border transition-colors',
                          active
                            ? 'border-accent bg-accent-tint'
                            : 'border-line-strong bg-surface hover:border-muted-2',
                        ].join(' ')}
                      >
                        <div className={['text-[13px] font-bold leading-snug', active ? 'text-accent' : 'text-text-strong'].join(' ')}>
                          {label}
                        </div>
                        <div className="text-[11.5px] text-muted mt-0.5 leading-snug">{desc}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── 2. Sorumlu Olduğu Beyanname Türleri ─────────────────── */}
              <section>
                <SectionHeader
                  title="2. Sorumlu Olduğu Beyanname Türleri"
                  sub="Kullanıcının görebileceği ve işleyebileceği dosya türleri"
                />
                <div className="flex flex-wrap gap-2">
                  {OPERATION_TYPE_OPTIONS.map(({ value, label }) => (
                    <Chip
                      key={value}
                      label={label}
                      checked={localPerms.operationTypes.includes(value)}
                      onChange={(v) => toggleOpType(value, v)}
                    />
                  ))}
                </div>
              </section>

              {/* ── 3. Ekran Yetkileri ───────────────────────────────────── */}
              <section>
                <SectionHeader
                  title="3. Ekran Yetkileri"
                  sub="Kullanıcının erişebileceği ekranlar ve yapabileceği işlemler"
                />

                {/* Column header */}
                <div className="flex items-center gap-3 px-3 mb-1.5">
                  <span className="flex-1 text-[11px] font-semibold text-muted uppercase tracking-wide">Ekran</span>
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wide w-[108px] text-right">Görüntüleme</span>
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wide w-[132px] text-right">İşlem Yapabilme</span>
                </div>

                <div className="space-y-4">
                  {SCREEN_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">
                        {group.label}
                      </p>
                      <div className="space-y-1">
                        {group.items.map(({ key, label }) => (
                          <PermissionRow
                            key={key}
                            label={label}
                            perm={getScreenPerm(key)}
                            onChange={(p) => setScreenPerm(key, p)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 4. Onay Seviyesi ─────────────────────────────────────── */}
              <section>
                <SectionHeader
                  title="4. Onay Seviyesi"
                  sub="Bu kullanıcının beyanname onay zincirindeki kapasitesi"
                />
                <div className="grid grid-cols-3 gap-2.5">
                  {APPROVER_OPTIONS.map(({ value, label, desc }) => {
                    const active = localPerms.approverLevel === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onPermsChange({ approverLevel: value })}
                        className={[
                          'text-left px-3.5 py-3 rounded-[10px] border transition-colors',
                          active
                            ? 'border-accent bg-accent-tint'
                            : 'border-line-strong bg-surface hover:border-muted-2',
                        ].join(' ')}
                      >
                        <div className={['text-[13px] font-bold leading-snug', active ? 'text-accent' : 'text-text-strong'].join(' ')}>
                          {label}
                        </div>
                        <div className="text-[11.5px] text-muted mt-0.5 leading-snug">{desc}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── Save / Reset ─────────────────────────────────────────── */}
              <div className="flex gap-2.5 pt-1 border-t border-line">
                <Button size="sm" onClick={onResetPerms}>Vazgeç</Button>
                <Button variant="primary" size="sm" onClick={onSavePerms}>
                  Yetkileri Kaydet
                </Button>
              </div>
            </CardBody>
          ) : (
            <CardBody>
              <p className="text-muted text-[13px]">Bir kullanıcı seçin.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
