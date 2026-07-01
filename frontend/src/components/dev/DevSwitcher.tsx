import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { usersService } from '../../services/users';
import type { DeploymentMode, FirmUser } from '../../types';

export default function DevSwitcher() {
  const { currentUser, deploymentMode, setCurrentUser, setDeploymentMode } = useAppContext();
  const [open, setOpen] = useState(false);
  const [firmUsers, setFirmUsers] = useState<FirmUser[]>([]);

  useEffect(() => {
    if (!open) return;
    usersService.getFirmUsers()
      .then(setFirmUsers)
      .catch(() => setFirmUsers([]));
  }, [open]);

  return (
    <div className="fixed bottom-4 left-4 z-50 select-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono font-medium bg-ink text-muted-2 border border-ink-line hover:text-surface transition-colors shadow-lg"
        title="Dev Switcher"
      >
        <Settings2 size={12} />
        DEV
        {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 w-56 bg-ink border border-ink-line rounded shadow-xl p-3 space-y-3">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest">
            Dev Tools
          </p>

          <div className="space-y-1">
            <p className="text-[11px] text-muted font-medium">Kullanıcı</p>
            <div className="flex flex-col gap-0.5">
              {firmUsers.length === 0 ? (
                <p className="text-[11px] text-muted-2 px-2 py-1">Kayıtlı kullanıcı yok</p>
              ) : firmUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setCurrentUser(u)}
                  className={[
                    'text-left px-2 py-1.5 rounded transition-colors',
                    currentUser.id === u.id
                      ? 'bg-accent text-surface font-medium'
                      : 'text-muted-2 hover:bg-ink-soft hover:text-surface',
                  ].join(' ')}
                >
                  <span className="text-[12px] block leading-tight">{u.name}</span>
                  <span className="text-[10px] opacity-60">{u.role} · {u.capabilities.length} yetki</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] text-muted font-medium">Mod</p>
            <div className="flex gap-1">
              {(['cloud', 'self_hosted'] as DeploymentMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setDeploymentMode(m)}
                  className={[
                    'flex-1 text-[11px] px-2 py-1 rounded transition-colors',
                    deploymentMode === m
                      ? 'bg-accent text-surface font-medium'
                      : 'text-muted-2 hover:bg-ink-soft hover:text-surface',
                  ].join(' ')}
                >
                  {m === 'cloud' ? 'Cloud' : 'Self-hosted'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
