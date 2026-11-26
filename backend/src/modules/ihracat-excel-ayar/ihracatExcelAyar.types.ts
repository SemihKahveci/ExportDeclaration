export const TASIMA_SEKILLERI = ["Karayolu", "Havayolu", "Denizyolu"] as const;
export type TasimaSekli = (typeof TASIMA_SEKILLERI)[number];

export const KAP_KAYNAKLARI = ["fatura", "sabit"] as const;
export type KapKaynak = (typeof KAP_KAYNAKLARI)[number];

export interface IhracatExcelKuralDto {
  id: string;
  tasimaSekilleri: TasimaSekli[];
  kapKaynak: KapKaynak;
  kapSabit: string;
  ambalaj: string;
}

export interface IhracatExcelMusteriKuralDto extends IhracatExcelKuralDto {
  gonderenNo: number;
  gonderenUnvan: string;
}

export interface IhracatExcelAyarDto {
  genel: IhracatExcelKuralDto[];
  musteri: IhracatExcelMusteriKuralDto[];
}

export interface ResolvedKapAmbalaj {
  kapKaynak: KapKaynak;
  kapSabit: string;
  ambalaj: string;
  source: "musteri" | "genel" | "none";
  sourceLabel: string;
}
