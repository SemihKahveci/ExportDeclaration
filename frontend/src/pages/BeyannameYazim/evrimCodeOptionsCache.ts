import { apiGetJson } from '../../api/apiClient';
import type { MiktarOption } from './resolveEvrimMiktar';
import type { MenseOption } from './resolveEvrimMense';

export type EvrimCodeOptions = {
  miktar: MiktarOption[];
  kap: Array<{ kod: string; label: string }>;
  mense: MenseOption[];
};

const EMPTY: EvrimCodeOptions = { miktar: [], kap: [], mense: [] };

let cached: EvrimCodeOptions | null = null;
let inflight: Promise<EvrimCodeOptions> | null = null;

function normalize(payload: Partial<EvrimCodeOptions> | null | undefined): EvrimCodeOptions {
  return {
    miktar: Array.isArray(payload?.miktar) ? payload!.miktar! : [],
    kap: Array.isArray(payload?.kap) ? payload!.kap! : [],
    mense: Array.isArray(payload?.mense) ? payload!.mense! : [],
  };
}

/** Senkron: varsa anında, yoksa boş. Flash’ı kesmek için initial state. */
export function peekEvrimCodeOptions(): EvrimCodeOptions {
  return cached ?? EMPTY;
}

export function isEvrimCodeOptionsReady(codes: EvrimCodeOptions): boolean {
  return codes.miktar.length > 0 || codes.mense.length > 0 || codes.kap.length > 0;
}

/** Tek seferlik ağ çağrısı; sonraki açılışlarda cache. */
export function loadEvrimCodeOptions(): Promise<EvrimCodeOptions> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = apiGetJson<EvrimCodeOptions>('/api/evrim-lookup/code-options')
      .then((payload) => {
        cached = normalize(payload);
        return cached;
      })
      .catch(() => EMPTY)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Liste/detay girerken ısıt. */
export function prefetchEvrimCodeOptions(): void {
  void loadEvrimCodeOptions();
}
