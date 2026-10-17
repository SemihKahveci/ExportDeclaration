type MutableObject = Record<string, unknown>;

export type DeclarationSourceTrace = Record<string, {
  value: unknown;
  source: string | null;
  [key: string]: unknown;
}>;

const F6_PROVENANCE = "DECLARATION_FIELD_RESOLUTION";
const ARRAY_INDEX = /^\d+$/;

function cloneValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    const result: MutableObject = {};
    for (const [key, entry] of Object.entries(value as MutableObject)) result[key] = cloneValue(entry);
    return result;
  }
  return value;
}

function asObject(value: unknown): MutableObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as MutableObject
    : {};
}

function readPath(root: unknown, path: string): { found: boolean; value?: unknown } {
  let cursor: unknown = root;
  for (const part of path.split(".").filter(Boolean)) {
    if (Array.isArray(cursor) && ARRAY_INDEX.test(part)) {
      const index = Number(part);
      if (index >= cursor.length) return { found: false };
      cursor = cursor[index];
    } else if (cursor && typeof cursor === "object" && part in (cursor as MutableObject)) {
      cursor = (cursor as MutableObject)[part];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: cursor };
}

function writePath(root: MutableObject, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor: MutableObject | unknown[] = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const nextIsArray = ARRAY_INDEX.test(parts[i + 1]!);
    if (Array.isArray(cursor)) {
      const index = Number(key);
      if (!cursor[index] || typeof cursor[index] !== "object") cursor[index] = nextIsArray ? [] : {};
      cursor = cursor[index] as MutableObject | unknown[];
    } else {
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = nextIsArray ? [] : {};
      cursor = cursor[key] as MutableObject | unknown[];
    }
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(cursor)) cursor[Number(last)] = cloneValue(value);
  else cursor[last] = cloneValue(value);
}

export function foundation6OwnedPaths(sourceTrace: unknown): string[] {
  return Object.entries(asObject(sourceTrace))
    .filter(([, trace]) =>
      trace && typeof trace === "object" && !Array.isArray(trace) &&
      (trace as MutableObject).provenance === F6_PROVENANCE
    )
    .map(([path]) => path)
    .sort();
}

/**
 * Compatibility normalization may rebuild legacy/non-IDP data, but a path already
 * promoted by Foundation 6 remains owned by that persisted resolution. Ownership is
 * derived from persisted provenance, never supplier/invoice-specific rules.
 */
export function preserveFoundation6ResolvedPaths(params: {
  currentNormalizedData: unknown;
  currentSourceTrace: unknown;
  rebuiltNormalizedData: unknown;
  rebuiltSourceTrace: unknown;
}): { normalizedData: MutableObject; sourceTrace: DeclarationSourceTrace; preservedPaths: string[] } {
  const normalizedData = asObject(cloneValue(params.rebuiltNormalizedData));
  const sourceTrace = asObject(cloneValue(params.rebuiltSourceTrace)) as DeclarationSourceTrace;
  const preservedPaths: string[] = [];

  const persistedSourceTrace = asObject(params.currentSourceTrace);

  for (const path of foundation6OwnedPaths(params.currentSourceTrace)) {
    const currentValue = readPath(params.currentNormalizedData, path);
    // sourceTrace is a flat path-keyed map (for example "header.invoiceNo"),
    // while normalizedData is nested. Do not traverse sourceTrace by dots.
    const currentTrace = persistedSourceTrace[path];
    if (!currentValue.found || !currentTrace || typeof currentTrace !== "object" || Array.isArray(currentTrace)) continue;
    writePath(normalizedData, path, currentValue.value);
    sourceTrace[path] = cloneValue(currentTrace) as DeclarationSourceTrace[string];
    preservedPaths.push(path);
  }

  return { normalizedData, sourceTrace, preservedPaths };
}
