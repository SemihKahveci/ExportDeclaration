import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  CustomerListItem,
  CustomerAddress,
  MailDomain,
  CustomerMail,
  DocumentRule,
  NotificationRule,
  DeclarationFieldRule,
  AppUser,
} from '../../types';
import { customersService } from '../../services/customers';
import { usersService } from '../../services/users';
import { declarationFieldRulesService } from '../../services/declarationFieldRules';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../api/apiClient';
import Tabs from '../../components/ui/Tabs';
import CustomerSidePanel from './CustomerSidePanel';
import AddressTab from './AddressTab';
import MailTab from './MailTab';
import DocRulesTab from './DocRulesTab';
import NotifyRulesTab from './NotifyRulesTab';
import DeclFieldRulesTab from './DeclFieldRulesTab';
import DeclFieldRuleDrawer from './DeclFieldRuleDrawer';
import CustomerDrawer, { type DrawerMode, type DrawerPayload } from './CustomerDrawer';
import MtAssignmentCard from './MtAssignmentCard';

const TABS = [
  { key: 'addr',       label: 'Adresler'                  },
  { key: 'mail',       label: 'Müşteri Mailleri'          },
  { key: 'rule',       label: 'Evrak Kuralları'           },
  { key: 'notify',     label: 'Bildirim Kuralları'        },
  { key: 'declfields', label: 'Beyanname Alan Kuralları'  },
];

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function MusterilerPage() {
  const { toast } = useToast();

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [activeTab, setActiveTab] = useState('addr');

  const [mtUsers, setMtUsers] = useState<AppUser[]>([]);
  const [mtManagerUsers, setMtManagerUsers] = useState<AppUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddrIdx, setSelectedAddrIdx] = useState(0);
  const [domains, setDomains] = useState<MailDomain[]>([]);
  const [mails, setMails] = useState<CustomerMail[]>([]);
  const [docRules, setDocRules] = useState<DocumentRule[]>([]);
  const [notifyRules, setNotifyRules] = useState<NotificationRule[]>([]);
  const [declFieldRules, setDeclFieldRules] = useState<DeclarationFieldRule[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('addr');
  const [editAddrIdx, setEditAddrIdx] = useState<number | null>(null);
  const [editDomainIdx, setEditDomainIdx] = useState<number | null>(null);
  const [editMailIdx, setEditMailIdx] = useState<number | null>(null);
  const [editRuleIdx, setEditRuleIdx] = useState<number | null>(null);
  const [editNotifyIdx, setEditNotifyIdx] = useState<number | null>(null);

  const [dfrDrawerOpen, setDfrDrawerOpen] = useState(false);
  const [editDfrId, setEditDfrId] = useState<string | null>(null);
  const [dfrInitGroup, setDfrInitGroup] = useState<string | undefined>(undefined);
  const [dfrInitField, setDfrInitField] = useState<string | undefined>(undefined);

  async function refreshCustomers(preferId?: string) {
    const list = await customersService.getCustomerList();
    setCustomers(list);
    setSelectedId((prev) => preferId || prev || list[0]?.id || '');
    return list;
  }

  useEffect(() => {
    Promise.all([
      customersService.getCustomerList(),
      usersService.getMtUsers(),
      usersService.getMtManagerUsers(),
    ])
      .then(([list, mt, mtMgr]) => {
        setCustomers(list);
        setMtUsers(mt);
        setMtManagerUsers(mtMgr);
        setSelectedId((prev) => prev || list[0]?.id || '');
        if (!list.length) setLoading(false);
      })
      .catch((err) => {
        toast(errorMessage(err, 'Müşteriler yüklenemedi'));
        setLoading(false);
      });
  }, [toast]);

  useEffect(() => {
    if (!selectedId) {
      setAddresses([]);
      setDomains([]);
      setMails([]);
      setDocRules([]);
      setNotifyRules([]);
      setDeclFieldRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSelectedAddrIdx(0);
    setActiveTab('addr');
    Promise.all([
      customersService.getAddresses(selectedId),
      customersService.getDomains(selectedId),
      customersService.getMails(selectedId),
      customersService.getDocRules(selectedId),
      customersService.getNotifyRules(selectedId),
      declarationFieldRulesService.getRules(selectedId),
    ])
      .then(([addrs, doms, mls, rules, nrules, dfrules]) => {
        setAddresses(addrs);
        setDomains(doms);
        setMails(mls);
        setDocRules(rules);
        setNotifyRules(nrules);
        setDeclFieldRules(dfrules);
        setLoading(false);
      })
      .catch((err) => {
        toast(errorMessage(err, 'Müşteri verileri yüklenemedi'));
        setLoading(false);
      });
  }, [selectedId, toast]);

  const selectedCustomer = customers.find((c) => c.id === selectedId);

  function openDrawer(mode: DrawerMode, editIdx: number | null = null) {
    setDrawerMode(mode);
    if (mode === 'addr') setEditAddrIdx(editIdx);
    if (mode === 'domain') setEditDomainIdx(editIdx);
    if (mode === 'mail') setEditMailIdx(editIdx);
    if (mode === 'rule') setEditRuleIdx(editIdx);
    if (mode === 'notify') setEditNotifyIdx(editIdx);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditAddrIdx(null);
    setEditDomainIdx(null);
    setEditMailIdx(null);
    setEditRuleIdx(null);
    setEditNotifyIdx(null);
  }

  async function handleCreateCustomer(name: string) {
    setSaving(true);
    try {
      const created = await customersService.createCustomer({ name });
      await refreshCustomers(created.id);
      toast('Müşteri eklendi');
    } catch (err) {
      toast(errorMessage(err, 'Müşteri eklenemedi'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(payload: DrawerPayload) {
    if (!selectedId) return;
    setSaving(true);
    try {
      if (payload.mode === 'addr') {
        const existingId = editAddrIdx !== null ? addresses[editAddrIdx]?.id : undefined;
        const saved = await customersService.saveAddress(selectedId, existingId, payload.data);
        if (editAddrIdx !== null) {
          setAddresses((prev) => prev.map((a, i) => (i === editAddrIdx ? saved : a)));
          toast('Adres güncellendi · Sisteme gönderilebilir');
        } else {
          setAddresses((prev) => [saved, ...prev]);
          setSelectedAddrIdx(0);
          toast('Adres kaydedildi · Sisteme gönderilebilir');
        }
        await refreshCustomers(selectedId);
      } else if (payload.mode === 'domain') {
        const existingId = editDomainIdx !== null ? domains[editDomainIdx]?.id : undefined;
        const saved = await customersService.saveDomain(selectedId, existingId, payload.data);
        if (editDomainIdx !== null) {
          setDomains((prev) => prev.map((d, i) => (i === editDomainIdx ? saved : d)));
        } else {
          setDomains((prev) => [saved, ...prev]);
        }
        toast('Domain kaydedildi');
      } else if (payload.mode === 'mail') {
        const existingId = editMailIdx !== null ? mails[editMailIdx]?.id : undefined;
        const saved = await customersService.saveMail(selectedId, existingId, payload.data);
        if (editMailIdx !== null) {
          setMails((prev) => prev.map((m, i) => (i === editMailIdx ? saved : m)));
        } else {
          setMails((prev) => [saved, ...prev]);
        }
        toast('Mail tanımı kaydedildi');
      } else if (payload.mode === 'rule') {
        const existingId = editRuleIdx !== null ? docRules[editRuleIdx]?.id : undefined;
        const saved = await customersService.saveDocRule(selectedId, existingId, payload.data);
        if (editRuleIdx !== null) {
          setDocRules((prev) => prev.map((r, i) => (i === editRuleIdx ? saved : r)));
        } else {
          setDocRules((prev) => [saved, ...prev]);
        }
        toast('Evrak kuralı kaydedildi');
      } else if (payload.mode === 'notify') {
        const existingId = editNotifyIdx !== null ? notifyRules[editNotifyIdx]?.id : undefined;
        const saved = await customersService.saveNotifyRule(selectedId, existingId, payload.data);
        if (editNotifyIdx !== null) {
          setNotifyRules((prev) => prev.map((r, i) => (i === editNotifyIdx ? saved : r)));
        } else {
          setNotifyRules((prev) => [saved, ...prev]);
        }
        toast('Bildirim kuralı kaydedildi');
      }
      closeDrawer();
    } catch (err) {
      toast(errorMessage(err, 'Kayıt başarısız'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEvrim() {
    const addr = addresses[selectedAddrIdx];
    if (!addr) return;
    try {
      const saved = await customersService.saveAddress(selectedId, addr.id, {
        company: addr.company,
        addressLines: addr.addressLines,
        city: addr.city,
        country: addr.country,
        taxNo: addr.taxNo,
        evrimStatus: 'sent',
        changed: false,
      });
      setAddresses((prev) => prev.map((a, i) => (i === selectedAddrIdx ? saved : a)));
      toast('Adres sisteme gönderildi');
    } catch (err) {
      toast(errorMessage(err, 'Gönderim başarısız'));
    }
  }

  function handleCopyAddress() {
    const addr = addresses[selectedAddrIdx];
    if (!addr) return;
    const text = `SAYIN\n${addr.company}\n${addr.addressLines}\n${addr.country}\nVKN: ${addr.taxNo}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    toast('Adres kopyalandı');
  }

  async function handleMtSave(mtUserId: string | undefined, mtManagerUserId: string | undefined) {
    try {
      const updated = await customersService.updateMtAssignment(
        selectedId,
        mtUserId,
        mtManagerUserId
      );
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast('Müşteri MT bilgileri güncellendi');
    } catch (err) {
      toast(errorMessage(err, 'MT bilgileri kaydedilemedi'));
    }
  }

  function openDfrDrawer(id?: string) {
    setEditDfrId(id ?? null);
    setDfrInitGroup(undefined);
    setDfrInitField(undefined);
    setDfrDrawerOpen(true);
  }

  function openDfrDrawerForField(groupLabel: string, fieldName: string) {
    setEditDfrId(null);
    setDfrInitGroup(groupLabel);
    setDfrInitField(fieldName);
    setDfrDrawerOpen(true);
  }

  async function handleDfrSave(data: Omit<DeclarationFieldRule, 'id' | 'customerId'>) {
    if (!selectedId) return;
    try {
      const saved = await declarationFieldRulesService.save(
        selectedId,
        editDfrId ?? undefined,
        data
      );
      if (editDfrId) {
        setDeclFieldRules((prev) => prev.map((r) => (r.id === editDfrId ? saved : r)));
        toast('Alan kuralı güncellendi');
      } else {
        setDeclFieldRules((prev) => [saved, ...prev]);
        toast('Alan kuralı kaydedildi');
      }
      setDfrDrawerOpen(false);
      setEditDfrId(null);
      setDfrInitGroup(undefined);
      setDfrInitField(undefined);
    } catch (err) {
      toast(errorMessage(err, 'Alan kuralı kaydedilemedi'));
    }
  }

  async function handleDfrDelete(id: string) {
    try {
      await declarationFieldRulesService.delete(id);
      setDeclFieldRules((prev) => prev.filter((r) => r.id !== id));
      toast('Alan kuralı silindi');
    } catch (err) {
      toast(errorMessage(err, 'Alan kuralı silinemedi'));
    }
  }

  const initAddr = editAddrIdx !== null ? addresses[editAddrIdx] : undefined;
  const initDomain = editDomainIdx !== null ? domains[editDomainIdx] : undefined;
  const initMail = editMailIdx !== null ? mails[editMailIdx] : undefined;
  const initRule = editRuleIdx !== null ? docRules[editRuleIdx] : undefined;
  const initNotify = editNotifyIdx !== null ? notifyRules[editNotifyIdx] : undefined;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[260px] shrink-0 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <CustomerSidePanel
          customers={customers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={custSearch}
          onSearch={setCustSearch}
          onCreate={handleCreateCustomer}
          creating={saving}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto px-7 pt-6 pb-12" data-toast-anchor>
        {!selectedId ? (
          <div className="py-20 text-center text-[13px] text-muted">
            Henüz müşteri yok. Soldan yeni müşteri ekleyin.
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="text-[22px] font-extrabold text-text-strong tracking-tight leading-snug">
                  {selectedCustomer?.name ?? '—'}
                </h1>
                <p className="text-[12.5px] text-muted mt-1">
                  Müşteri adres defteri, mail tanımları, evrak ve bildirim kuralları
                </p>
              </div>
              {activeTab === 'addr' && (
                <button
                  onClick={() => openDrawer('addr')}
                  className="inline-flex items-center gap-2 bg-accent text-white font-semibold text-[13px] px-4 h-9 rounded border border-transparent hover:bg-accent-d transition-colors shrink-0"
                >
                  <span className="text-lg leading-none">+</span>
                  Yeni Adres
                </button>
              )}
            </div>

            {selectedCustomer && (
              <MtAssignmentCard
                customer={selectedCustomer}
                mtUsers={mtUsers}
                mtManagerUsers={mtManagerUsers}
                onSave={handleMtSave}
              />
            )}

            <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} className="mb-5" />

            {loading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-muted">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-[13px]">Yükleniyor…</span>
              </div>
            ) : (
              <>
                {activeTab === 'addr' && (
                  <AddressTab
                    addresses={addresses}
                    selectedIdx={selectedAddrIdx}
                    onSelect={setSelectedAddrIdx}
                    onSendEvrim={handleSendEvrim}
                    onCopy={handleCopyAddress}
                    onNew={() => openDrawer('addr')}
                    onEdit={() => openDrawer('addr', selectedAddrIdx)}
                  />
                )}
                {activeTab === 'mail' && (
                  <MailTab
                    domains={domains}
                    mails={mails}
                    onNewDomain={() => openDrawer('domain')}
                    onEditDomain={(i) => openDrawer('domain', i)}
                    onNewMail={() => openDrawer('mail')}
                    onEditMail={(i) => openDrawer('mail', i)}
                  />
                )}
                {activeTab === 'rule' && (
                  <DocRulesTab
                    rules={docRules}
                    onNew={() => openDrawer('rule')}
                    onEdit={(i) => openDrawer('rule', i)}
                  />
                )}
                {activeTab === 'notify' && (
                  <NotifyRulesTab
                    rules={notifyRules}
                    onNew={() => openDrawer('notify')}
                    onEdit={(i) => openDrawer('notify', i)}
                  />
                )}
                {activeTab === 'declfields' && (
                  <DeclFieldRulesTab
                    rules={declFieldRules}
                    onNew={(groupLabel, fieldName) =>
                      groupLabel && fieldName
                        ? openDfrDrawerForField(groupLabel, fieldName)
                        : openDfrDrawer()
                    }
                    onEdit={(id) => openDfrDrawer(id)}
                    onDelete={handleDfrDelete}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      <CustomerDrawer
        open={drawerOpen}
        mode={drawerMode}
        customerName={selectedCustomer?.name ?? '—'}
        initialAddress={initAddr}
        initialDomain={initDomain}
        initialMail={initMail}
        initialRule={initRule}
        initialNotify={initNotify}
        onClose={closeDrawer}
        onSave={handleSave}
      />
      <DeclFieldRuleDrawer
        open={dfrDrawerOpen}
        initial={editDfrId ? declFieldRules.find((r) => r.id === editDfrId) : undefined}
        initialGroup={dfrInitGroup}
        initialField={dfrInitField}
        customerName={selectedCustomer?.name ?? '—'}
        onClose={() => {
          setDfrDrawerOpen(false);
          setEditDfrId(null);
          setDfrInitGroup(undefined);
          setDfrInitField(undefined);
        }}
        onSave={handleDfrSave}
      />
    </div>
  );
}
