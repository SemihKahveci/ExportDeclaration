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

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'addr',       label: 'Adresler'                  },
  { key: 'mail',       label: 'Müşteri Mailleri'          },
  { key: 'rule',       label: 'Evrak Kuralları'           },
  { key: 'notify',     label: 'Bildirim Kuralları'        },
  { key: 'declfields', label: 'Beyanname Alan Kuralları'  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MusterilerPage() {
  const { toast } = useToast();

  // ── Panel state ──────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [selectedId, setSelectedId] = useState('valeo');
  const [activeTab, setActiveTab] = useState('addr');

  // ── MT users ─────────────────────────────────────────────────────────────
  const [mtUsers, setMtUsers] = useState<AppUser[]>([]);
  const [mtManagerUsers, setMtManagerUsers] = useState<AppUser[]>([]);

  // ── Data state ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddrIdx, setSelectedAddrIdx] = useState(0);
  const [domains, setDomains] = useState<MailDomain[]>([]);
  const [mails, setMails] = useState<CustomerMail[]>([]);
  const [docRules, setDocRules] = useState<DocumentRule[]>([]);
  const [notifyRules, setNotifyRules] = useState<NotificationRule[]>([]);
  const [declFieldRules, setDeclFieldRules] = useState<DeclarationFieldRule[]>([]);

  // ── Drawer state ─────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('addr');
  const [editAddrIdx, setEditAddrIdx] = useState<number | null>(null);
  const [editDomainIdx, setEditDomainIdx] = useState<number | null>(null);
  const [editMailIdx, setEditMailIdx] = useState<number | null>(null);
  const [editRuleIdx, setEditRuleIdx] = useState<number | null>(null);
  const [editNotifyIdx, setEditNotifyIdx] = useState<number | null>(null);

  // ── Declaration field rule drawer ─────────────────────────────────────────
  const [dfrDrawerOpen,  setDfrDrawerOpen]  = useState(false);
  const [editDfrId,      setEditDfrId]      = useState<string | null>(null);
  const [dfrInitGroup,   setDfrInitGroup]   = useState<string | undefined>(undefined);
  const [dfrInitField,   setDfrInitField]   = useState<string | undefined>(undefined);

  // ── Load customers + MT users once ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      customersService.getCustomerList(),
      usersService.getMtUsers(),
      usersService.getMtManagerUsers(),
    ]).then(([list, mt, mtMgr]) => {
      setCustomers(list);
      setMtUsers(mt);
      setMtManagerUsers(mtMgr);
    });
  }, []);

  // ── Reload all data on customer change ───────────────────────────────────
  useEffect(() => {
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
    ]).then(([addrs, doms, mls, rules, nrules, dfrules]) => {
      setAddresses(addrs);
      setDomains(doms);
      setMails(mls);
      setDocRules(rules);
      setNotifyRules(nrules);
      setDeclFieldRules(dfrules);
      setLoading(false);
    });
  }, [selectedId]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedCustomer = customers.find((c) => c.id === selectedId);

  // ── Drawer helpers ───────────────────────────────────────────────────────
  function openDrawer(mode: DrawerMode, editIdx: number | null = null) {
    setDrawerMode(mode);
    if (mode === 'addr')   setEditAddrIdx(editIdx);
    if (mode === 'domain') setEditDomainIdx(editIdx);
    if (mode === 'mail')   setEditMailIdx(editIdx);
    if (mode === 'rule')   setEditRuleIdx(editIdx);
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

  // ── Save dispatcher ──────────────────────────────────────────────────────
  function handleSave(payload: DrawerPayload) {
    const newId = () => `${payload.mode}-${Date.now()}`;

    if (payload.mode === 'addr') {
      const item: CustomerAddress = { ...payload.data, id: newId(), customerId: selectedId };
      if (editAddrIdx !== null) {
        setAddresses((prev) => prev.map((a, i) => (i === editAddrIdx ? { ...a, ...item } : a)));
        toast('Adres güncellendi · Sisteme gönderilebilir');
      } else {
        setAddresses((prev) => [item, ...prev]);
        setSelectedAddrIdx(0);
        toast('Adres kaydedildi · Sisteme gönderilebilir');
      }
    } else if (payload.mode === 'domain') {
      const item: MailDomain = { ...payload.data, id: newId(), customerId: selectedId };
      if (editDomainIdx !== null) {
        setDomains((prev) => prev.map((d, i) => (i === editDomainIdx ? item : d)));
      } else {
        setDomains((prev) => [item, ...prev]);
      }
      toast('Domain kaydedildi');
    } else if (payload.mode === 'mail') {
      const item: CustomerMail = { ...payload.data, id: newId(), customerId: selectedId };
      if (editMailIdx !== null) {
        setMails((prev) => prev.map((m, i) => (i === editMailIdx ? item : m)));
      } else {
        setMails((prev) => [item, ...prev]);
      }
      toast('Mail tanımı kaydedildi');
    } else if (payload.mode === 'rule') {
      const item: DocumentRule = { ...payload.data, id: newId(), customerId: selectedId };
      if (editRuleIdx !== null) {
        setDocRules((prev) => prev.map((r, i) => (i === editRuleIdx ? item : r)));
      } else {
        setDocRules((prev) => [item, ...prev]);
      }
      toast('Evrak kuralı kaydedildi');
    } else if (payload.mode === 'notify') {
      const item: NotificationRule = { ...payload.data, id: newId(), customerId: selectedId };
      if (editNotifyIdx !== null) {
        setNotifyRules((prev) => prev.map((r, i) => (i === editNotifyIdx ? item : r)));
      } else {
        setNotifyRules((prev) => [item, ...prev]);
      }
      toast('Bildirim kuralı kaydedildi');
    }

    closeDrawer();
  }

  // ── Address actions ──────────────────────────────────────────────────────
  function handleSendEvrim() {
    setAddresses((prev) =>
      prev.map((a, i) =>
        i === selectedAddrIdx ? { ...a, evrimStatus: 'sent', changed: false } : a
      )
    );
    toast('Adres sisteme gönderildi');
  }

  function handleCopyAddress() {
    const addr = addresses[selectedAddrIdx];
    if (!addr) return;
    const text = `SAYIN\n${addr.company}\n${addr.addressLines}\n${addr.country}\nVKN: ${addr.taxNo}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    toast('Adres kopyalandı');
  }

  // ── MT assignment save ────────────────────────────────────────────────────
  async function handleMtSave(mtUserId: string | undefined, mtManagerUserId: string | undefined) {
    await customersService.updateMtAssignment(selectedId, mtUserId, mtManagerUserId);
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, assignedMtUserId: mtUserId, assignedMtManagerUserId: mtManagerUserId }
          : c
      )
    );
    toast('Müşteri MT bilgileri güncellendi');
  }

  // ── Declaration field rule actions ────────────────────────────────────────
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

  function handleDfrSave(data: Omit<DeclarationFieldRule, 'id' | 'customerId'>) {
    if (editDfrId) {
      setDeclFieldRules((prev) =>
        prev.map((r) => r.id === editDfrId ? { ...r, ...data } : r)
      );
      toast('Alan kuralı güncellendi');
    } else {
      const newRule: DeclarationFieldRule = {
        ...data,
        id: `dfr-${Date.now()}`,
        customerId: selectedId,
      };
      setDeclFieldRules((prev) => [newRule, ...prev]);
      toast('Alan kuralı kaydedildi');
    }
    setDfrDrawerOpen(false);
    setEditDfrId(null);
    setDfrInitGroup(undefined);
    setDfrInitField(undefined);
  }

  function handleDfrDelete(id: string) {
    setDeclFieldRules((prev) => prev.filter((r) => r.id !== id));
    toast('Alan kuralı silindi');
  }

  // ── Derived initial values for drawer ────────────────────────────────────
  const initAddr   = editAddrIdx   !== null ? addresses[editAddrIdx]   : undefined;
  const initDomain = editDomainIdx !== null ? domains[editDomainIdx]   : undefined;
  const initMail   = editMailIdx   !== null ? mails[editMailIdx]       : undefined;
  const initRule   = editRuleIdx   !== null ? docRules[editRuleIdx]    : undefined;
  const initNotify = editNotifyIdx !== null ? notifyRules[editNotifyIdx] : undefined;

  return (
    <div className="flex h-full min-h-0">
      {/* Side panel */}
      <div className="w-[260px] shrink-0 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <CustomerSidePanel
          customers={customers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={custSearch}
          onSearch={setCustSearch}
        />
      </div>

      {/* Detail area */}
      <div className="flex-1 min-w-0 overflow-y-auto px-7 pt-6 pb-12">
        {/* Header */}
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

        {/* MT Assignment card */}
        {selectedCustomer && (
          <MtAssignmentCard
            customer={selectedCustomer}
            mtUsers={mtUsers}
            mtManagerUsers={mtManagerUsers}
            onSave={handleMtSave}
          />
        )}

        {/* Tabs */}
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} className="mb-5" />

        {/* Loading */}
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
      </div>

      {/* Drawer */}
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
      {/* Declaration field rule drawer */}
      <DeclFieldRuleDrawer
        open={dfrDrawerOpen}
        initial={editDfrId ? declFieldRules.find((r) => r.id === editDfrId) : undefined}
        initialGroup={dfrInitGroup}
        initialField={dfrInitField}
        customerName={selectedCustomer?.name ?? '—'}
        onClose={() => { setDfrDrawerOpen(false); setEditDfrId(null); setDfrInitGroup(undefined); setDfrInitField(undefined); }}
        onSave={handleDfrSave}
      />
    </div>
  );
}
