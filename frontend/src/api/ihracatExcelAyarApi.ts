import { apiDeleteJson, apiGetJson, apiPutJson } from "./apiClient";

export type TasimaSekli = "Karayolu" | "Havayolu" | "Denizyolu";
export type KapKaynak = "fatura" | "sabit";

export interface IhracatExcelKural {
  id: string;
  tasimaSekilleri: TasimaSekli[];
  kapKaynak: KapKaynak;
  kapSabit: string;
  ambalaj: string;
}

export interface IhracatExcelMusteriKural extends IhracatExcelKural {
  gonderenNo: number;
  gonderenUnvan: string;
}

export interface IhracatExcelAyar {
  genel: IhracatExcelKural[];
  musteri: IhracatExcelMusteriKural[];
}

export async function getIhracatExcelAyar(): Promise<IhracatExcelAyar> {
  return apiGetJson<IhracatExcelAyar>("/api/ihracat-excel-ayar");
}

export async function saveIhracatExcelGenel(
  kurallar: Array<Omit<IhracatExcelKural, "id"> & { id?: string }>
): Promise<IhracatExcelAyar> {
  return apiPutJson<IhracatExcelAyar>("/api/ihracat-excel-ayar/genel", { kurallar });
}

export async function saveIhracatExcelMusteri(
  kural: Partial<IhracatExcelMusteriKural> & {
    gonderenNo: number;
    tasimaSekilleri: TasimaSekli[];
    kapKaynak: KapKaynak;
  }
): Promise<IhracatExcelAyar> {
  return apiPutJson<IhracatExcelAyar>("/api/ihracat-excel-ayar/musteri", kural);
}

export async function deleteIhracatExcelMusteri(id: string): Promise<IhracatExcelAyar> {
  return apiDeleteJson<IhracatExcelAyar>(`/api/ihracat-excel-ayar/musteri/${encodeURIComponent(id)}`);
}
