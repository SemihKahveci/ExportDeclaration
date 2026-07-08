import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { CustomerListItem } from '../../types';

interface CustomerSidePanelProps {
  customers: CustomerListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (q: string) => void;
  onCreate?: (name: string) => void;
  creating?: boolean;
}

export default function CustomerSidePanel({
  customers,
  selectedId,
  onSelect,
  search,
  onSearch,
  onCreate,
  creating = false,
}: CustomerSidePanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const visible = customers.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  function submitCreate() {
    const name = newName.trim();
    if (!name || !onCreate) return;
    onCreate(name);
    setNewName('');
    setShowCreate(false);
  }

  return (
    <aside className="border-r border-line bg-surface flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-line shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[.06em] text-muted">Müşteriler</h2>
          {onCreate && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:text-accent-d"
              title="Yeni müşteri"
            >
              <Plus size={14} strokeWidth={2.2} />
              Yeni
            </button>
          )}
        </div>
        {showCreate && (
          <div className="mt-2.5 space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
              placeholder="Müşteri adı…"
              className="w-full border border-line-strong bg-surface-2 rounded-[8px] px-3 py-[7px] text-[13px] text-text placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              autoFocus
            />
            <button
              type="button"
              disabled={!newName.trim() || creating}
              onClick={submitCreate}
              className="w-full h-8 rounded-[7px] bg-accent text-white text-[12.5px] font-semibold disabled:opacity-50"
            >
              {creating ? 'Kaydediliyor…' : 'Ekle'}
            </button>
          </div>
        )}
        <div className="relative mt-2.5">
          <Search size={14} strokeWidth={2} className="absolute left-2.5 top-[9px] text-muted-2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Müşteri ara…"
            className="w-full border border-line-strong bg-surface-2 rounded-[8px] pl-[30px] pr-3 py-[7px] text-[13px] text-text placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-[12.5px] text-muted text-center">Müşteri bulunamadı.</p>
        ) : (
          visible.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-left transition-colors',
                  active ? 'bg-accent-tint' : 'hover:bg-surface-2',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-8 h-8 rounded-[8px] border flex items-center justify-center font-bold text-[11px] shrink-0',
                    active
                      ? 'bg-white border-accent text-accent'
                      : 'bg-surface-2 border-line text-text',
                  ].join(' ')}
                >
                  {c.initials}
                </span>
                <span>
                  <span className="block font-semibold text-[13px] text-text-strong leading-snug">{c.name}</span>
                  <span className="block text-[11.5px] text-muted mt-0.5">{c.meta}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
