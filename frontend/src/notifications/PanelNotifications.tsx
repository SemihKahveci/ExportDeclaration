import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchParseSnapshot } from '../services/liveApi';

export interface PanelNotice {
  id: number;
  title: string;
  body: string;
  at: number;
}

interface PanelNotificationValue {
  notices: PanelNotice[];
  unread: number;
  markRead: () => void;
}

const PanelNotificationContext = createContext<PanelNotificationValue | null>(null);

let nextNoticeId = 0;

export function PanelNotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<PanelNotice[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Map<string, string> | null>(null);

  const push = useCallback((title: string, body: string) => {
    const id = ++nextNoticeId;
    setNotices((prev) => [{ id, title, body, at: Date.now() }, ...prev].slice(0, 20));
    setUnread((count) => count + 1);
  }, []);

  const markRead = useCallback(() => setUnread(0), []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const snapshot = await fetchParseSnapshot();
      if (cancelled || !snapshot) return;
      if (!seen.current) {
        seen.current = new Map(snapshot.map((doc) => [doc.id, doc.status]));
        return;
      }
      for (const doc of snapshot) {
        const previous = seen.current.get(doc.id);
        const finished = doc.status === 'SUCCESS' && previous !== 'SUCCESS';
        const appearedFinished = previous === undefined && doc.status === 'SUCCESS';
        if ((previous && finished) || appearedFinished) {
          push('Evrak parse edildi', `${doc.ref} · ${doc.name}`);
        }
        seen.current.set(doc.id, doc.status);
      }
    }

    void tick();
    const timer = window.setInterval(() => { void tick(); }, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [push]);

  const value = useMemo(() => ({ notices, unread, markRead }), [notices, unread, markRead]);

  return (
    <PanelNotificationContext.Provider value={value}>
      {children}
    </PanelNotificationContext.Provider>
  );
}

export function usePanelNotifications(): PanelNotificationValue {
  const value = useContext(PanelNotificationContext);
  if (!value) throw new Error('usePanelNotifications must be used within PanelNotificationProvider');
  return value;
}
