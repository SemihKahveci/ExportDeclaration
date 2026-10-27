import type { BeyannameLineItem } from "../../types";

export const BLANK_DECLARATION_TEMPLATE = "/templates/ihracat-beyanname-bos.pdf";

export interface DeclarationSheetData {
  ref: string;
  customer: string;
  fields: Record<string, string>;
  lines: BeyannameLineItem[];
}

function text(fields: Record<string, string>, name: string): string {
  const value = fields[name]?.trim();
  return value ? value : "—";
}

function lineText(value: string | number | undefined): string {
  const raw = value == null ? "" : String(value).trim();
  return raw && raw !== "—" ? raw : "—";
}

function Box({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 border border-neutral-300 px-2 py-1.5 ${className}`}>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-[12px] font-medium text-neutral-900 break-words whitespace-pre-wrap">{value}</div>
    </div>
  );
}

export default function DeclarationSheet({ data }: { data: DeclarationSheetData }) {
  const fields = data.fields;
  return (
    <article className="mx-auto w-full max-w-[760px] bg-white text-neutral-900 shadow-lg border border-neutral-300">
      <header className="px-4 py-3 border-b border-neutral-400 bg-neutral-50">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">İhracat beyannamesi</div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h2 className="text-[16px] font-bold">{data.ref || "Beyanname"}</h2>
          <span className="text-[11px] text-neutral-500">{data.customer}</span>
        </div>
      </header>
      <div className="grid grid-cols-4">
        <Box label="Beyanname no" value={text(fields, "Beyanname No")} />
        <Box label="Referans" value={text(fields, "Referans No")} />
        <Box label="Tescil tarihi" value={text(fields, "Tescil Tarihi")} />
        <Box label="Rejim" value={text(fields, "Rejim")} />
        <Box label="Rejim kodu" value={text(fields, "Rejim Kodu")} />
        <Box label="Gümrük idaresi" value={text(fields, "Gümrük İdaresi")} />
        <Box label="Beyan türü" value={text(fields, "Beyan Türü")} />
        <Box label="Beyan sahibi" value={text(fields, "Beyan Sahibi / Temsilci")} />
      </div>
      <div className="grid grid-cols-2">
        <Box label="Gönderici / ihracatçı" value={`${text(fields, "Gönderici / İhracatçı Ünvanı")}\n${text(fields, "Gönderici / İhracatçı Adresi")}`} />
        <Box label="Alıcı / ithalatçı" value={`${text(fields, "Alıcı / İthalatçı Ünvanı")}\n${text(fields, "Alıcı / İthalatçı Adresi")}`} />
      </div>
      <div className="grid grid-cols-4">
        <Box label="Çıkış ülkesi" value={text(fields, "Çıkış Ülkesi")} />
        <Box label="Gideceği ülke" value={text(fields, "Gideceği Ülke")} />
        <Box label="Ticaret ülkesi" value={text(fields, "Ticaret Yapılan Ülke")} />
        <Box label="Teslim şekli" value={text(fields, "Teslim Şekli")} />
        <Box label="Taşıma şekli" value={text(fields, "Taşıma Şekli")} />
        <Box label="Çıkış aracı" value={text(fields, "Çıkış Aracı")} />
        <Box label="Plaka" value={text(fields, "Plaka")} />
        <Box label="Taşıma senedi" value={text(fields, "Taşıma Senedi No")} />
      </div>
      <div className="grid grid-cols-6">
        <Box label="Fatura no" value={text(fields, "Fatura No")} />
        <Box label="Fatura tarihi" value={text(fields, "Fatura Tarihi")} />
        <Box label="Döviz" value={text(fields, "Döviz Cinsi")} />
        <Box label="Toplam" value={text(fields, "Toplam Fatura Bedeli")} />
        <Box label="Kap" value={`${text(fields, "Kap Adedi")} ${text(fields, "Kap Cinsi")}`} />
        <Box label="Brüt / net kilo" value={`${text(fields, "Brüt Kilo")} / ${text(fields, "Net Kilo")}`} />
      </div>
      <div className="border-t border-neutral-400">
        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Kalemler</div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-y border-neutral-300 text-[9px] uppercase text-neutral-500">
              {["No", "GTİP", "Tanım", "Miktar", "Birim", "Net KG", "Kıymet"].map((column) => (
                <th key={column} className="px-2 py-1 font-semibold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr><td colSpan={7} className="px-2 py-3 text-[12px] text-neutral-500">Kalem yok</td></tr>
            ) : data.lines.map((line, index) => (
              <tr key={`${line.lineNo}-${index}`} className="border-b border-neutral-200 text-[11.5px]">
                <td className="px-2 py-1">{lineText(line.lineNo)}</td>
                <td className="px-2 py-1 font-mono">{lineText(line.gtip)}</td>
                <td className="px-2 py-1">{lineText(line.ticariTanim || line.description)}</td>
                <td className="px-2 py-1">{lineText(line.quantity)}</td>
                <td className="px-2 py-1">{lineText(line.miktarBirimi)}</td>
                <td className="px-2 py-1">{lineText(line.netKg)}</td>
                <td className="px-2 py-1">{lineText(line.kiymet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="px-3 py-2 text-[10px] text-neutral-500 border-t border-neutral-300">
        Yazılı beyanname, boş ihracat beyannamesi şablonunun alanlarına bu dosyanın kayıtlı değerleriyle doldurulur.
      </footer>
    </article>
  );
}
