import { useAppContext } from '../context/AppContext';
import { PERMISSIONS } from './registry';

export function useCan() {
  const { currentUser } = useAppContext();
  const set = new Set(currentUser?.capabilities ?? []);

  const can = (cap: string) => set.has(cap);
  const canAny = (caps: string[]) => caps.some((c) => set.has(c));
  const canAll = (caps: string[]) => caps.every((c) => set.has(c));

  /**
   * Ekranda "İşlem Yapabilme" açık mı?
   * screen id (örn. musteriler) veya route (örn. /musteriler) kabul eder.
   * Sadece görüntüleme varsa false döner.
   */
  const canOperate = (screenOrRoute: string) => {
    const screen = PERMISSIONS.find(
      (p) => p.screen === screenOrRoute || p.route === screenOrRoute
    );
    if (!screen) return false;

    const writeCaps = screen.capabilities.filter((c) => !c.key.endsWith('.view'));
    if (writeCaps.length === 0) return false;
    return writeCaps.some((c) => set.has(c.key));
  };

  return { can, canAny, canAll, canOperate };
}
