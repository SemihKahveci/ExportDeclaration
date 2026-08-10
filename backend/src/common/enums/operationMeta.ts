export const FILE_STATUSES = [
  "yeni-talep",
  "gtip-hazirlik",
  "evrak-bekleniyor",
  "beyanname-yazim",
  "ic-kontrol",
  "tescil",
  "kapanis-bekleyen"
] as const;

export const OPERATION_TYPES = ["ithalat", "ihracat", "transit", "antrepo"] as const;

export const TRANSPORT_MODES = ["karayolu", "denizyolu", "havayolu"] as const;

export const HAT_COLORS = ["Kırmızı", "Sarı", "Mavi", "Yeşil"] as const;

export const TESCIL_STATUSES = ["started", "completed"] as const;

export const KAPANIS_STATUSES = [
  "kontrol-bekliyor",
  "mutabakat-hazir",
  "maliyet-bekliyor",
  "kapandi"
] as const;

export type FileStatusValue = (typeof FILE_STATUSES)[number];
export type OperationTypeValue = (typeof OPERATION_TYPES)[number];
