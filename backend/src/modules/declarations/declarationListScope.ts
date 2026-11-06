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

/** Kullanıcı ayarlarındaki işlem tipi yoksa ilgili beyanname görünmez. */
export function isOperationTypeVisible(
  operationType: string | null | undefined,
  allowed: Set<string>
): boolean {
  if (allowed.size === 0) return false;
  const key = operationTypeKey(operationType);
  return Boolean(key) && allowed.has(key);
}

export function defaultDeclarationListScope(role: string | null | undefined): DeclarationListScope {
  if (role === "MT" || role === "Operasyon" || role === "Saha") return "mine";
  return "all";
}

/** Query yoksa all; UI rol default'unu açıkça scope=mine|all gönderir. */
export function parseDeclarationListScope(raw: unknown): DeclarationListScope {
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
