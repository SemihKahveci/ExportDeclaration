import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AppUser, DocProcess, OperationType, ApproverLevel, ScreenPermission, DeclarationApprovalRules } from '../../types';
import { usersService } from '../../services/users';
import { documentsService } from '../../services/documents';
import { declarationApprovalRulesService, DEFAULT_DECLARATION_APPROVAL_RULES } from '../../services/declarationApprovalRules';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../api/apiClient';
import { deriveAuthFromScreenPermissions } from '../../permissions/deriveUserAuth';
import Tabs from '../../components/ui/Tabs';
import UsersTab from './UsersTab';
import type { UsersTabLocalPerms } from './UsersTab';
import UserDrawer from './UserDrawer';
import DocProcessesTab from './DocProcessesTab';
import DocDrawer from './DocDrawer';
import ApprovalRulesTab from './ApprovalRulesTab';

const TABS = [
  { key: 'users',           label: 'Kullanıcılar ve Yetkileri'  },
  { key: 'docs',            label: 'Doküman Süreçleri'           },
  { key: 'approval-rules',  label: 'Beyanname Onay Kuralları'    },
];

type LocalPerms = UsersTabLocalPerms;

function isMongoId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function deriveScreenPerms(user: AppUser): Record<string, ScreenPermission> {
  if (user.screenPermissions) return user.screenPermissions;
  const result: Record<string, ScreenPermission> = {};
  for (const key of user.menuAccess) {
    result[key] = { view: true, operate: true };
  }
  return result;
}

function defaultPerms(user: AppUser): LocalPerms {
  return {
    role:               user.role,
    operationTypes:     user.operationTypes,
    screenPermissions:  deriveScreenPerms(user),
    approverLevel:      user.approverLevel,
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function AyarlarPage() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('users');

  const [users,           setUsers]           = useState<AppUser[]>([]);
  const [selectedUserIdx, setSelectedUserIdx] = useState(0);
  const [localPerms,      setLocalPerms]      = useState<LocalPerms>({
    role:              'Operasyon' as AppUser['role'],
    operationTypes:    [] as OperationType[],
    screenPermissions: {},
    approverLevel:     'none' as ApproverLevel,
  });

  const [approvalRules, setApprovalRules] = useState<DeclarationApprovalRules>(DEFAULT_DECLARATION_APPROVAL_RULES);
  const [docs, setDocs] = useState<DocProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [editUserIdx,    setEditUserIdx]    = useState<number | null>(null);
  const [docDrawerOpen,  setDocDrawerOpen]  = useState(false);
  const [editDocIdx,     setEditDocIdx]     = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      usersService.getAppUsers(),
      documentsService.getDocProcesses(),
      declarationApprovalRulesService.get(),
    ]).then(([appUsers, docProcs, rules]) => {
      setUsers(appUsers);
      setDocs(docProcs);
      setApprovalRules(rules);
      if (appUsers.length > 0) setLocalPerms(defaultPerms(appUsers[0]));
      setLoading(false);
    }).catch((err) => {
      toast(errorMessage(err, 'Ayarlar yüklenemedi'));
      setLoading(false);
    });
  }, [toast]);

  function selectUser(idx: number) {
    setSelectedUserIdx(idx);
    setLocalPerms(defaultPerms(users[idx]));
  }

  function handlePermsChange(patch: Partial<LocalPerms>) {
    setLocalPerms((prev) => ({ ...prev, ...patch }));
  }

  async function handleSavePerms() {
    const current = users[selectedUserIdx];
    if (!current) return;

    setSaving(true);
    try {
      const derived = deriveAuthFromScreenPermissions(localPerms.screenPermissions);
      const updated = await usersService.updateUserPermissions(current.id, {
        role: localPerms.role,
        operationTypes: localPerms.operationTypes,
        screenPermissions: localPerms.screenPermissions,
        approverLevel: localPerms.approverLevel,
        capabilities: derived.capabilities,
        menuAccess: derived.menuAccess,
        menuActions: derived.menuActions,
        specialActions: derived.specialActions,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast('Kullanıcı yetkileri kaydedildi');
    } catch (err) {
      toast(errorMessage(err, 'Yetkiler kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  }

  function handleResetPerms() {
    setLocalPerms(defaultPerms(users[selectedUserIdx]));
  }

  function openUserDrawer(editIdx: number | null) {
    setEditUserIdx(editIdx);
    setUserDrawerOpen(true);
  }

  async function handleSaveUser(data: Omit<AppUser, 'id'>) {
    setSaving(true);
    try {
      if (editUserIdx !== null) {
        const existing = users[editUserIdx];
        const updated = await usersService.updateUserPermissions(existing.id, data);
        const nextUsers = users.map((u) => (u.id === updated.id ? updated : u));
        setUsers(nextUsers);
        const idx = nextUsers.findIndex((u) => u.id === updated.id);
        if (idx === selectedUserIdx) setLocalPerms(defaultPerms(updated));
      } else {
        const created = await usersService.createAppUser(data);
        const nextUsers = [created, ...users];
        setUsers(nextUsers);
        setSelectedUserIdx(0);
        setLocalPerms(defaultPerms(created));
      }
      setUserDrawerOpen(false);
      toast('Kullanıcı kaydedildi');
    } catch (err) {
      toast(errorMessage(err, 'Kullanıcı kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  }

  function openDocDrawer(editIdx: number | null) {
    setEditDocIdx(editIdx);
    setDocDrawerOpen(true);
  }

  async function handleSaveDoc(data: Omit<DocProcess, 'id'>) {
    setSaving(true);
    try {
      const existingId = editDocIdx !== null ? docs[editDocIdx]?.id : undefined;
      const saved = await documentsService.saveDocProcess(
        existingId && isMongoId(existingId) ? existingId : undefined,
        data
      );
      if (editDocIdx !== null) {
        setDocs((prev) => prev.map((d, i) => (i === editDocIdx ? saved : d)));
      } else {
        setDocs((prev) => [saved, ...prev]);
      }
      setDocDrawerOpen(false);
      toast('Evrak tipi kaydedildi');
    } catch (err) {
      toast(errorMessage(err, 'Evrak tipi kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDocUpdated(id: string, patch: Partial<DocProcess>) {
    if (!isMongoId(id)) return;
    try {
      const saved = await documentsService.updateDocProcess(id, patch);
      setDocs((prev) => prev.map((d) => (d.id === id ? saved : d)));
    } catch (err) {
      toast(errorMessage(err, 'Test sonucu kaydedilemedi'));
    }
  }

  async function handleSaveApprovalRules(rules: DeclarationApprovalRules) {
    setSaving(true);
    try {
      const saved = await declarationApprovalRulesService.save(rules);
      setApprovalRules(saved);
      toast('Beyanname onay kuralları güncellendi');
    } catch (err) {
      toast(errorMessage(err, 'Onay kuralları kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  }

  const editUser = editUserIdx !== null ? users[editUserIdx] : undefined;
  const editDoc  = editDocIdx  !== null ? docs[editDocIdx]   : undefined;

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">Ayarlar</h1>
          <p className="text-[12.5px] text-muted mt-1">
            Kullanıcı yetkileri, doküman süreç tanımları ve onay kuralları.
          </p>
        </div>
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} className="mb-6" />

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[13px]">Yükleniyor…</span>
        </div>
      ) : (
        <>
          {activeTab === 'users' && (
            <UsersTab
              users={users}
              selectedIdx={selectedUserIdx}
              localPerms={localPerms}
              onSelectUser={selectUser}
              onPermsChange={handlePermsChange}
              onSavePerms={handleSavePerms}
              onResetPerms={handleResetPerms}
              onNew={() => openUserDrawer(null)}
              onEdit={() => openUserDrawer(selectedUserIdx)}
              saving={saving}
            />
          )}

          {activeTab === 'docs' && (
            <DocProcessesTab
              docs={docs}
              onNew={() => openDocDrawer(null)}
              onEdit={(i) => openDocDrawer(i)}
              onDocUpdated={handleDocUpdated}
            />
          )}

          {activeTab === 'approval-rules' && (
            <ApprovalRulesTab
              rules={approvalRules}
              saving={saving}
              onSave={handleSaveApprovalRules}
            />
          )}
        </>
      )}

      <UserDrawer
        open={userDrawerOpen}
        initial={editUser}
        onClose={() => setUserDrawerOpen(false)}
        onSave={handleSaveUser}
        saving={saving}
      />

      <DocDrawer
        open={docDrawerOpen}
        initial={editDoc}
        onClose={() => setDocDrawerOpen(false)}
        onSave={handleSaveDoc}
      />
    </div>
  );
}
