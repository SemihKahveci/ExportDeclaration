import type { GoodsLine } from "@/types/document.types";

function nextLineNo(lines: GoodsLine[]): number {
  if (lines.length === 0) return 1;
  return Math.max(...lines.map((l) => l.lineNo)) + 1;
}

export function GoodsLinesTable({
  lines,
  onChange
}: {
  lines: GoodsLine[];
  onChange: (next: GoodsLine[]) => void;
}) {
  const update = (idx: number, patch: Partial<GoodsLine>) => {
    const copy = lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(copy);
  };

  const addRow = () => {
    onChange([...lines, { lineNo: nextLineNo(lines) }]);
  };

  const removeRow = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };

  return (
    <div className="panel stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Ürün kalemleri</h3>
        <button type="button" onClick={addRow}>
          Satır ekle
        </button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>GTİP</th>
              <th>Açıklama</th>
              <th>Miktar</th>
              <th>Birim</th>
              <th>Birim fiyat</th>
              <th>Satır tutar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>
                  Kalem yok — “Satır ekle” ile ekleyin.
                </td>
              </tr>
            ) : (
              lines.map((row, idx) => (
                <tr key={`${row.lineNo}-${idx}`}>
                  <td style={{ width: 56 }}>
                    <input
                      style={{ width: 48 }}
                      type="number"
                      value={row.lineNo}
                      onChange={(e) => update(idx, { lineNo: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input value={row.hsCode ?? ""} onChange={(e) => update(idx, { hsCode: e.target.value })} />
                  </td>
                  <td style={{ minWidth: 160 }}>
                    <input value={row.description ?? ""} onChange={(e) => update(idx, { description: e.target.value })} />
                  </td>
                  <td style={{ width: 88 }}>
                    <input
                      type="number"
                      value={row.quantity ?? ""}
                      onChange={(e) =>
                        update(idx, { quantity: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td style={{ width: 72 }}>
                    <input value={row.unit ?? ""} onChange={(e) => update(idx, { unit: e.target.value })} />
                  </td>
                  <td style={{ width: 96 }}>
                    <input
                      type="number"
                      step="0.01"
                      value={row.unitPrice ?? ""}
                      onChange={(e) =>
                        update(idx, { unitPrice: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td style={{ width: 96 }}>
                    <input
                      type="number"
                      step="0.01"
                      value={row.lineTotal ?? ""}
                      onChange={(e) =>
                        update(idx, { lineTotal: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <button type="button" className="ghost" onClick={() => removeRow(idx)}>
                      Sil
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
