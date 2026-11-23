export type DeclarationListScope = "all" | "mine";

export function operationTypeKey(value: string | null | undefined): string {
  const text = (value ?? "").trim().toLocaleLowerCase("tr-TR");
  if (text.startsWith("ihracat") || text === "export") return "ihracat";
  if (text.startsWith("ithalat") || text === "import") return "ithalat";
  if (text.startsWith("transit")) return "transit";
  if (text.startsWith("antrepo")) return "antrepo";
  return text;
}

export function allowedOperationTypeKeys(operationTypes: string[] | null | undefined): Set<string> {
  return new Set((operationTypes ?? []).map((item) => operationTypeKey(item)).filter(Boolean));
}

/**
 * Kullanıcı ayarlarındaki işlem tipi whitelist.
 * Hiç tip seçilmemişse ihracat varsayılır (yeni kullanıcı boş listeye düşmesin).
 * İthalat seçili değilse ithalat dosyası görünmez.
 */
export function isOperationTypeVisible(
  operationType: string | null | undefined,
  allowed: Set<string>
): boolean {
  const key = operationTypeKey(operationType);
  if (!key) return false;
  if (allowed.size === 0) return key === "ihracat";
  return allowed.has(key);
}

export function defaultDeclarationListScope(role: string | null | undefined): DeclarationListScope {
  if (role === "MT" || role === "Operasyon" || role === "Saha") return "mine";
  return "all";
}

/** MT / Operasyon / Saha yalnız kendi müşterilerini görür; istemci scope=all gönderemez. */
export function canUseDeclarationListAll(
  role: string | null | undefined,
  systemRole?: string | null
): boolean {
  if (systemRole === "SUPERADMIN") return true;
  return defaultDeclarationListScope(role) === "all";
}

/** Query yoksa rol default'u; kısıtlı roller her zaman mine. */
export function parseDeclarationListScope(
  raw: unknown,
  role?: string | null,
  systemRole?: string | null
): DeclarationListScope {
  if (role !== undefined || systemRole !== undefined) {
    if (!canUseDeclarationListAll(role, systemRole)) return "mine";
    const value = String(raw ?? "").trim().toLowerCase();
    if (value === "mine" || value === "all") return value;
    return defaultDeclarationListScope(role);
  }
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "mine") return "mine";
  return "all";
}

export function matchesMineScope(params: {
  customerId?: string | null;
  assigneeName?: string | null;
  myCustomerIds: Set<string>;
  userName: string;
}): boolean {
  const customerId = (params.customerId ?? "").trim();
  if (customerId && params.myCustomerIds.has(customerId)) return true;
  const assignee = (params.assigneeName ?? "").trim().toLocaleLowerCase("tr-TR");
  const me = params.userName.trim().toLocaleLowerCase("tr-TR");
  return Boolean(me) && Boolean(assignee) && assignee === me;
}
