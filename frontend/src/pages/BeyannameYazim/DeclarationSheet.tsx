import type { CSSProperties } from "react";
import type { BeyannameLineItem } from "../../types";

export const BLANK_DECLARATION_TEMPLATE = "/templates/ihracat-beyanname-bos.pdf";
const FORM_IMAGE = "/templates/ihracat-beyanname-bos.png";
const PAGE_W = 595.5;
const PAGE_H = 842.25;

export interface DeclarationSheetData {
  ref: string;
  customer: string;
  fields: Record<string, string>;
  lines: BeyannameLineItem[];
}

function clean(value: string | number | undefined): string {
  const text = value == null ? "" : String(value).trim();
  return text === "—" || text === "–" || text === "-" ? "" : text;
}

function field(fields: Record<string, string>, name: string): string {
  return clean(fields[name]);
}

function block(...parts: Array<string | undefined>): string {
  return parts.map((part) => clean(part)).filter(Boolean).join("\n");
}

function placed(x: number, y: number, w: number, h: number): CSSProperties {
  return {
    left: `${(x / PAGE_W) * 100}%`,
    top: `${(y / PAGE_H) * 100}%`,
    width: `${(w / PAGE_W) * 100}%`,
    height: `${(h / PAGE_H) * 100}%`,
  };
}

function Ink({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: string }) {
  if (!children.trim()) return null;
  return (
    <div className="absolute overflow-hidden whitespace-pre-wrap break-words text-black" style={placed(x, y, w, h)}>
      {children}
    </div>
  );
}

function lineText(value: string | number | undefined): string {
  return clean(value);
}

export default function DeclarationSheet({ data }: { data: DeclarationSheetData }) {
  const fields = data.fields;
  const currency = field(fields, "Döviz Cinsi");
  const total = field(fields, "Toplam Fatura Bedeli");
  const amount = currency && total.endsWith(currency) ? total.slice(0, -currency.length).trim() : total;
  const single = data.lines.length === 1 ? data.lines[0] : null;
  const itemText = single
    ? block(
        [lineText(single.quantity), lineText(single.miktarBirimi), field(fields, "Kap Cinsi")].filter(Boolean).join(" "),
        lineText(single.ticariTanim || single.description),
        lineText(single.malzemeNo),
      )
    : block(
        [field(fields, "Kap Adedi"), field(fields, "Kap Cinsi")].filter(Boolean).join(" "),
        data.lines.length > 1 ? `${data.lines.length} kalem ekli listededir` : "",
      );

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <article
        className="relative w-full bg-white shadow-lg [container-type:size]"
        style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
      >
        <img src={FORM_IMAGE} alt="İhracat beyannamesi formu" className="absolute inset-0 h-full w-full" draggable={false} />
        <div className="absolute inset-0 font-sans leading-[1.35] text-black [font-size:1.32cqw]">
          <Ink x={157} y={28} w={130} h={12} children={field(fields, "Gönderici Vergi No")} />
          <Ink x={46} y={44} w={245} h={26} children={block(field(fields, "Gönderici / İhracatçı Ünvanı"), field(fields, "Gönderici / İhracatçı Adresi"), field(fields, "Gönderici Ülke"))} />
          <Ink x={310} y={33} w={26} h={14} children={field(fields, "Beyan Türü")} />
          <Ink x={337} y={33} w={22} h={14} children={field(fields, "Rejim")} />
          <Ink x={392} y={30} w={175} h={12} children={field(fields, "Beyanname No")} />
          <Ink x={392} y={41} w={175} h={12} children={field(fields, "Gümrük İdaresi")} />
          <Ink x={392} y={52} w={90} h={12} children={field(fields, "Tescil Tarihi")} />
          <Ink x={368} y={80} w={40} h={14} children={field(fields, "Kap Adedi")} />
          <Ink x={400} y={84} w={150} h={12} children={field(fields, "Referans No")} />
          <Ink x={300} y={108} w={250} h={28} children={field(fields, "Mali Müşavir / Temsilci Bilgisi")} />
          <Ink x={44} y={107} w={245} h={34} children={block(field(fields, "Alıcı / İthalatçı Ünvanı"), field(fields, "Alıcı / İthalatçı Adresi"), field(fields, "Alıcı Ülke"))} />
          <Ink x={38} y={174} w={110} h={12} children={field(fields, "Referans No")} />
          <Ink x={38} y={185} w={250} h={30} children={field(fields, "Beyan Sahibi / Temsilci")} />
          <Ink x={304} y={182} w={120} h={12} children={field(fields, "Çıkış Ülkesi")} />
          <Ink x={304} y={206} w={120} h={12} children={field(fields, "Menşe Ülke")} />
          <Ink x={436} y={206} w={130} h={12} children={field(fields, "Gideceği Ülke")} />
          <Ink x={46} y={234} w={190} h={12} children={field(fields, "Taşıma Şekli")} />
          <Ink x={306} y={234} w={50} h={12} children={field(fields, "Teslim Şekli")} />
          <Ink x={46} y={258} w={240} h={12} children={[field(fields, "Çıkış Aracı"), field(fields, "Plaka")].filter(Boolean).join("  ")} />
          <Ink x={306} y={258} w={24} h={12} children={currency} />
          <Ink x={336} y={258} w={90} h={12} children={amount} />
          <Ink x={438} y={258} w={52} h={12} children={field(fields, "Döviz Kuru")} />
          <Ink x={500} y={258} w={24} h={12} children={field(fields, "İşlem Niteliği")} />
          <Ink x={38} y={278} w={120} h={14} children={field(fields, "Sınır Geçiş Aracı")} />
          <Ink x={299} y={276} w={260} h={16} children={field(fields, "Finansal / Banka Bilgisi")} />
          <Ink x={38} y={300} w={150} h={16} children={field(fields, "Gümrük İdaresi")} />
          <Ink x={299} y={300} w={120} h={14} children={field(fields, "Ödeme Şekli")} />
          <Ink x={42} y={342} w={310} h={68} children={itemText} />
          <Ink x={376} y={326} w={20} h={12} children={single ? lineText(single.lineNo) : ""} />
          <Ink x={400} y={326} w={85} h={12} children={single ? lineText(single.gtip) : ""} />
          <Ink x={386} y={350} w={40} h={12} children={single ? lineText(single.mense) : ""} />
          <Ink x={440} y={350} w={70} h={12} children={field(fields, "Brüt Kilo")} />
          <Ink x={440} y={376} w={70} h={12} children={field(fields, "Net Kilo")} />
          <Ink x={376} y={420} w={70} h={12} children={single ? [lineText(single.quantity), lineText(single.miktarBirimi)].filter(Boolean).join(" ") : ""} />
          <Ink x={460} y={420} w={60} h={12} children={single ? lineText(single.kiymet) : ""} />
          <Ink x={462} y={468} w={60} h={12} children={field(fields, "İstatistiki Kıymet")} />
          <Ink
            x={42}
            y={446}
            w={300}
            h={36}
            children={block(
              [field(fields, "Fatura No"), field(fields, "Fatura Tarihi")].filter(Boolean).join("  "),
              field(fields, "Önceki Belge No"),
              field(fields, "Taşıma Senedi No"),
            )}
          />
        </div>
      </article>

      {data.lines.length > 0 && (
        <section className="mt-3 border border-[#2f8f3a] bg-white shadow-lg">
          <header className="border-b border-[#2f8f3a] bg-[#e7f6e4] px-3 py-2">
            <div className="text-[11px] font-bold tracking-wide text-[#1d6b28]">T.C. GÜMRÜK BEYANNAMESİ EKLİ LİSTESİ</div>
            <div className="mt-0.5 text-[10px] text-[#2d7a38]">
              {[field(fields, "Beyanname No") || data.ref, field(fields, "Referans No"), data.customer].filter(Boolean).join(" · ")}
            </div>
          </header>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#2f8f3a] text-[9px] uppercase text-[#1d6b28]">
                {["No", "GTİP", "Tanım", "Miktar", "Birim", "Net KG", "Kıymet"].map((column) => (
                  <th key={column} className="px-2 py-1 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line, index) => (
                <tr key={`${line.lineNo}-${index}`} className="border-b border-[#b7dfb4] align-top text-[11.5px] text-neutral-900">
                  <td className="px-2 py-1">{lineText(line.lineNo) || index + 1}</td>
                  <td className="px-2 py-1 font-mono whitespace-nowrap">{lineText(line.gtip)}</td>
                  <td className="px-2 py-1">{lineText(line.ticariTanim || line.description)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{lineText(line.quantity)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{lineText(line.miktarBirimi)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{lineText(line.netKg)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{lineText(line.kiymet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
