import { apiGetJson, apiPatchJson, apiPostJson } from "./apiClient";
import type { AppUser } from "@/types";

export type CreateAppUserPayload = Omit<AppUser, "id" | "systemRole"> & { password?: string };
export type UpdateAppUserPayload = Partial<Omit<AppUser, "id" | "systemRole">> & { password?: string };

export async function listAppUsers(): Promise<AppUser[]> { return apiGetJson<AppUser[]>("/api/users"); }
export async function createAppUser(payload: CreateAppUserPayload): Promise<AppUser> { return apiPostJson<AppUser>("/api/users", payload); }
export async function updateAppUser(id: string, payload: UpdateAppUserPayload): Promise<AppUser> { return apiPatchJson<AppUser>(`/api/users/${encodeURIComponent(id)}`, payload); }
