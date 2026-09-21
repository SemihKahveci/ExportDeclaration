import { apiGetJson, apiPostJson } from './apiClient';

export type CustomsSupplementAction = 'SET' | 'CLEAR';
export interface CustomsSupplementDecision {
  id: string;
  declarationId: string;
  fieldPath: string;
  action: CustomsSupplementAction;
  value?: string;
  actorUserId?: string;
  actorEmail?: string;
  reason?: string;
  createdAt: string;
}
export interface AppendCustomsSupplementInput {
  fieldPath: string;
  action: CustomsSupplementAction;
  value?: string;
  reason?: string;
}
export function appendCustomsSupplementDecision(declarationId: string, input: AppendCustomsSupplementInput) {
  return apiPostJson<CustomsSupplementDecision>(`/api/declarations/${encodeURIComponent(declarationId)}/customs-supplements/decisions`, input);
}
export function listCustomsSupplementDecisions(declarationId: string) {
  return apiGetJson<CustomsSupplementDecision[]>(`/api/declarations/${encodeURIComponent(declarationId)}/customs-supplements`);
}
