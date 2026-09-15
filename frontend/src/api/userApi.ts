import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./apiClient";
import type { AppUser } from "@/types";

export type CreateAppUserPayload = Omit<AppUser, "id" | "systemRole"> & { password?: string };
export type UpdateAppUserPayload = Partial<Omit<AppUser, "id" | "systemRole" | "email">> & { password?: string };

export type AssignableUser = Pick<AppUser, "id" | "name" | "role" | "status">;

export async function listAppUsers(): Promise<AppUser[]> { return apiGetJson<AppUser[]>("/api/users"); }
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  return apiGetJson<AssignableUser[]>("/api/users/assignable");
}
export async function createAppUser(payload: CreateAppUserPayload): Promise<AppUser> { return apiPostJson<AppUser>("/api/users", payload); }
export async function updateAppUser(id: string, payload: UpdateAppUserPayload): Promise<AppUser> { return apiPatchJson<AppUser>(`/api/users/${encodeURIComponent(id)}`, payload); }
export async function deleteAppUser(id: string): Promise<void> {
  await apiDeleteJson<null>(`/api/users/${encodeURIComponent(id)}`);
}
