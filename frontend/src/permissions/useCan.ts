import { useAppContext } from '../context/AppContext';

export function useCan() {
  const { currentUser } = useAppContext();
  const set = new Set(currentUser?.capabilities ?? []);
  const can = (cap: string) => set.has(cap);
  const canAny = (caps: string[]) => caps.some((c) => set.has(c));
  return { can, canAny };
}
