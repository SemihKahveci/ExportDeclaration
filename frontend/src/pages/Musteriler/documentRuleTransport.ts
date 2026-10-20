export const ALL_TRANSPORT = 'Tümü';
export const SPECIFIC_TRANSPORTS = ['Karayolu', 'Denizyolu', 'Havayolu'] as const;

export function parseTransportModes(value: string | undefined): string[] {
  const parts = (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const specific = SPECIFIC_TRANSPORTS.filter((mode) => parts.includes(mode));
  if (parts.length === 0 || parts.includes(ALL_TRANSPORT) || specific.length === SPECIFIC_TRANSPORTS.length) {
    return [ALL_TRANSPORT];
  }
  return specific.length ? [...specific] : [ALL_TRANSPORT];
}

export function serializeTransportModes(selected: string[]): string {
  if (selected.includes(ALL_TRANSPORT)) return ALL_TRANSPORT;
  const specific = SPECIFIC_TRANSPORTS.filter((mode) => selected.includes(mode));
  if (specific.length === 0 || specific.length === SPECIFIC_TRANSPORTS.length) return ALL_TRANSPORT;
  return specific.join(', ');
}

export function transportMatchesFilter(value: string | undefined, filter: string): boolean {
  if (filter === ALL_TRANSPORT) return true;
  const modes = parseTransportModes(value);
  return modes.includes(ALL_TRANSPORT) || modes.includes(filter);
}
