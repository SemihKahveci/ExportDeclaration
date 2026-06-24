import { useState, useEffect } from 'react';
import { UserCheck, Pencil, Check, X } from 'lucide-react';
import type { AppUser, CustomerListItem } from '../../types';

interface MtAssignmentCardProps {
  customer: CustomerListItem;
  mtUsers: AppUser[];
  mtManagerUsers: AppUser[];
  onSave: (mtUserId: string | undefined, mtManagerUserId: string | undefined) => void;
}

export default function MtAssignmentCard({
  customer,
  mtUsers,
  mtManagerUsers,
  onSave,
}: MtAssignmentCardProps) {
  const [editing, setEditing] = useState(false);
  const [mtId, setMtId] = useState(customer.assignedMtUserId ?? '');
  const [mtMgrId, setMtMgrId] = useState(customer.assignedMtManagerUserId ?? '');

  // Reset local state when customer changes
  useEffect(() => {
    setMtId(customer.assignedMtUserId ?? '');
    setMtMgrId(customer.assignedMtManagerUserId ?? '');
    setEditing(false);
  }, [customer.id]);

  const mtName    = mtUsers.find((u) => u.id === (editing ? mtId : customer.assignedMtUserId))?.name;
  const mtMgrName = mtManagerUsers.find((u) => u.id === (editing ? mtMgrId : customer.assignedMtManagerUserId))?.name;

  function handleSave() {
    onSave(mtId || undefined, mtMgrId || undefined);
    setEditing(false);
  }

  function handleCancel() {
    setMtId(customer.assignedMtUserId ?? '');
    setMtMgrId(customer.assignedMtManagerUserId ?? '');
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line bg-surface-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
        <UserCheck size={15} strokeWidth={1.75} className="text-accent" />
      </div>

      {editing ? (
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11.5px] font-semibold text-muted whitespace-nowrap">MT:</span>
            <select
              value={mtId}
              onChange={(e) => setMtId(e.target.value)}
              className="border border-line-strong bg-surface rounded-lg px-2.5 py-1 text-[12.5px] text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
            >
              <option value="">— Atanmamış —</option>
              {mtUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11.5px] font-semibold text-muted whitespace-nowrap">MT Yöneticisi:</span>
            <select
              value={mtMgrId}
              onChange={(e) => setMtMgrId(e.target.value)}
              className="border border-line-strong bg-surface rounded-lg px-2.5 py-1 text-[12.5px] text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
            >
              <option value="">— Atanmamış —</option>
              {mtManagerUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-[12px] font-semibold hover:bg-accent-d transition-colors"
            >
              <Check size={12} strokeWidth={2.5} />
              Kaydet
            </button>
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line text-[12px] font-semibold text-muted hover:bg-line transition-colors"
            >
              <X size={12} strokeWidth={2.5} />
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 flex-1 min-w-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] font-semibold text-muted">MT:</span>
            {mtName ? (
              <span className="text-[12.5px] font-semibold text-text-strong">{mtName}</span>
            ) : (
              <span className="text-[12px] text-muted-2 italic">Atanmamış</span>
            )}
          </div>

          <div className="w-px h-4 bg-line shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] font-semibold text-muted">MT Yöneticisi:</span>
            {mtMgrName ? (
              <span className="text-[12.5px] font-semibold text-text-strong">{mtMgrName}</span>
            ) : (
              <span className="text-[12px] text-muted-2 italic">Atanmamış</span>
            )}
          </div>

          <button
            onClick={() => setEditing(true)}
            className="ml-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line text-[12px] font-semibold text-muted hover:border-accent hover:text-accent transition-colors"
          >
            <Pencil size={11} strokeWidth={2} />
            Düzenle
          </button>
        </div>
      )}
    </div>
  );
}
