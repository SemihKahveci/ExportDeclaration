import { apiGetJson, apiPostJson } from "./apiClient";

export interface AuthUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  systemRole: "SUPERADMIN" | "USER";
  role: string;
  capabilities: string[];
  operationTypes: string[];
}

export function login(email: string, password: string): Promise<AuthUser> {
  return apiPostJson<AuthUser>("/api/auth/login", { email, password });
}
export function logout(): Promise<{ loggedOut: boolean }> {
  return apiPostJson<{ loggedOut: boolean }>("/api/auth/logout");
}
export function me(): Promise<AuthUser> {
  return apiGetJson<AuthUser>("/api/auth/me");
}
