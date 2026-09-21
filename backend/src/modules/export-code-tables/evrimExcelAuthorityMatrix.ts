export type ExportAuthority =
  | "IDP_CANONICAL"
  | "MASTER_DATA"
  | "HUMAN_INPUT"
  | "FORMAT_MAPPING"
  | "UNRESOLVED";

export interface EvrimColumnAuthority {
  index: number;
  header: string;
  authority: readonly ExportAuthority[];
  currentSource: string;
  status: "ACTIVE" | "PARTIAL" | "UNRESOLVED";
  note?: string;
}

/**
 * Exact 24-column CHROMYSSTEMS/Sayfa1 authority inventory.
 * UNRESOLVED means we intentionally do not invent semantics yet.
 */
export const EVRIM_EXCEL_AUTHORITY_MATRIX: readonly EvrimColumnAuthority[] = [
  {index:1,header:"MODEL",authority:["IDP_CANONICAL"],currentSource:"goodsLines.productCode",status:"ACTIVE"},
  {index:2,header:"MİKTAR",authority:["IDP_CANONICAL"],currentSource:"goodsLines.quantity",status:"ACTIVE"},
  {index:3,header:"MİKTAR CİNSİ",authority:["IDP_CANONICAL","FORMAT_MAPPING"],currentSource:"goodsLines.unit -> Evrim unit code",status:"ACTIVE"},
  {index:4,header:"KIYMET",authority:["IDP_CANONICAL"],currentSource:"goodsLines.lineTotal",status:"ACTIVE"},
  {index:5,header:"GTİP",authority:["IDP_CANONICAL"],currentSource:"goodsLines.hsCode",status:"ACTIVE"},
  {index:6,header:"MENŞE",authority:["IDP_CANONICAL","HUMAN_INPUT"],currentSource:"goodsLines.origin / supplement.origin",status:"ACTIVE"},
  {index:7,header:"TİCARİ TANIM",authority:["HUMAN_INPUT"],currentSource:"Evrim line override customsDescription",status:"PARTIAL",note:"Invoice description is MAL KODU in the supplied workbook; customs description semantics are not inferred."},
  {index:8,header:"KAP ADETİ",authority:["IDP_CANONICAL"],currentSource:"package.totalPackage",status:"ACTIVE"},
  {index:9,header:"KAP CİNSİ",authority:["IDP_CANONICAL","FORMAT_MAPPING"],currentSource:"package.packageType -> Evrim package code",status:"ACTIVE"},
  {index:10,header:"ÜTS NO",authority:["MASTER_DATA","HUMAN_INPUT"],currentSource:"line.utsNo",status:"ACTIVE"},
  {index:11,header:"MAL KODU",authority:["IDP_CANONICAL"],currentSource:"goodsLines.description",status:"ACTIVE"},
  {index:12,header:"MUAFİYET",authority:["MASTER_DATA","HUMAN_INPUT"],currentSource:"line.exemptionCode",status:"ACTIVE"},
  {index:13,header:"MUAFİYET 2",authority:["UNRESOLVED"],currentSource:"format-specific override only",status:"UNRESOLVED"},
  {index:14,header:"TESLİM ŞEKLİ",authority:["IDP_CANONICAL"],currentSource:"trade.deliveryTerm",status:"ACTIVE"},
  {index:15,header:"MARKA ADI",authority:["UNRESOLVED"],currentSource:"format-specific override or line.brand fallback",status:"PARTIAL",note:"Separate semantics from MARKA are not proven."},
  {index:16,header:"ÜRETİCİ NO",authority:["UNRESOLVED"],currentSource:"format-specific override only",status:"UNRESOLVED"},
  {index:17,header:"FATURA NO",authority:["IDP_CANONICAL"],currentSource:"header.invoiceNo",status:"ACTIVE"},
  {index:18,header:"FATURA TARİH",authority:["IDP_CANONICAL"],currentSource:"header.invoiceDate",status:"ACTIVE"},
  {index:19,header:"MARKA",authority:["MASTER_DATA","HUMAN_INPUT"],currentSource:"line.brand",status:"ACTIVE"},
  {index:20,header:"KULLANILMIŞ",authority:["MASTER_DATA","HUMAN_INPUT"],currentSource:"line.usedFlag",status:"ACTIVE"},
  {index:21,header:"SİPARİŞ NO",authority:["UNRESOLVED"],currentSource:"format-specific override orderType",status:"UNRESOLVED"},
  {index:22,header:"SİPARİŞ NO",authority:["UNRESOLVED"],currentSource:"format-specific override orderRegistration",status:"UNRESOLVED"},
  {index:23,header:"ÖN İZİN",authority:["MASTER_DATA","HUMAN_INPUT"],currentSource:"line.permitCode",status:"ACTIVE"},
  {index:24,header:"İSKONTO",authority:["UNRESOLVED"],currentSource:"format-specific override only",status:"UNRESOLVED"},
] as const;
