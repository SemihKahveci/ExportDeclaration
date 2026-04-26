import { Link } from "react-router-dom";
import type { Declaration } from "@/types/declaration.types";
import { DeclarationStatusBadge } from "./DeclarationStatusBadge";

function formatAmount(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DeclarationTable({ rows }: { rows: Declaration[] }) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--muted)" }}>Kayıt yok.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Durum</th>
            <th>Fatura no</th>
            <th>Alıcı</th>
            <th>Para birimi</th>
            <th>Toplam tutar</th>
            <th>Oluşturulma</th>
            <th>Id</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d._id}>
              <td>
                <DeclarationStatusBadge status={d.status} />
              </td>
              <td>{d.normalizedData?.header?.invoiceNo ?? "—"}</td>
              <td style={{ maxWidth: 200 }}>{d.normalizedData?.parties?.buyer?.name ?? "—"}</td>
              <td>{d.normalizedData?.header?.currency ?? "—"}</td>
              <td className="mono" style={{ fontSize: 13 }}>
                {formatAmount(d.normalizedData?.header?.totalAmount)}
              </td>
              <td className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
                {d.createdAt ? new Date(d.createdAt).toLocaleString("tr-TR") : "—"}
              </td>
              <td className="mono" style={{ fontSize: 11 }}>
                {d._id}
              </td>
              <td>
                <Link to={`/declarations/${d._id}`}>Aç</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
