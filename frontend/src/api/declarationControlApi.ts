import { apiGetJson } from "./apiClient";
import type { EvidenceBBox } from "../components/documents/DocumentEvidenceViewer";
export type ControlAuthority="NORMALIZED_DECLARATION"|"MASTER_DATA"|"PERSISTENT_HUMAN";
export interface ControlEvidence {uploadedFileId:string;processingRunId:string;pageNumber:number;bbox?:EvidenceBBox;text?:string;contentSource?:"NATIVE_TEXT"|"OCR"|"DERIVED";candidateId?:string;extractor?:string;}
export interface ControlProvenanceEntry {path:string;value:unknown;authority:ControlAuthority;label:string;masterData?:{masterDataId:string;scope:string;key:string;customerId?:string};human?:{decisionId:string;actorEmail?:string;reason?:string;createdAt?:string};evidence?:ControlEvidence;}
export interface DeclarationControlProjection {declarationId:string;contract:unknown;entries:ControlProvenanceEntry[];}
export function getDeclarationControlProjection(declarationId:string){return apiGetJson<DeclarationControlProjection>(`/api/declarations/${encodeURIComponent(declarationId)}/control-provenance`);}
