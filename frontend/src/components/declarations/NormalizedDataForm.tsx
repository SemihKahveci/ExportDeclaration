import type { NormalizedDeclaration } from "@/types/document.types";

function patch<K extends keyof NormalizedDeclaration>(
  prev: NormalizedDeclaration,
  key: K,
  val: NormalizedDeclaration[K]
): NormalizedDeclaration {
  return { ...prev, [key]: val };
}

export function NormalizedDataForm({
  value,
  onChange
}: {
  value: NormalizedDeclaration;
  onChange: (next: NormalizedDeclaration) => void;
}) {
  const h = value.header;
  const seller = value.parties.seller ?? {};
  const buyer = value.parties.buyer ?? {};
  const t = value.trade;
  const tr = value.transport;
  const p = value.packageInfo;

  return (
    <div className="panel stack">
      <h3>Normalize beyanname</h3>

      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: 13, color: "var(--muted)" }}>Fatura başlığı</h4>
        <div className="grid-form">
          <div>
            <label>Fatura no</label>
            <input
              value={h.invoiceNo ?? ""}
              onChange={(e) => onChange(patch(value, "header", { ...h, invoiceNo: e.target.value }))}
            />
          </div>
          <div>
            <label>Fatura tarihi</label>
            <input
              type="date"
              value={h.invoiceDate?.slice(0, 10) ?? ""}
              onChange={(e) => onChange(patch(value, "header", { ...h, invoiceDate: e.target.value }))}
            />
          </div>
          <div>
            <label>Para birimi</label>
            <input
              value={h.currency ?? ""}
              onChange={(e) => onChange(patch(value, "header", { ...h, currency: e.target.value }))}
            />
          </div>
          <div>
            <label>Toplam tutar</label>
            <input
              type="number"
              step="0.01"
              value={h.totalAmount ?? ""}
              onChange={(e) =>
                onChange(
                  patch(value, "header", {
                    ...h,
                    totalAmount: e.target.value === "" ? undefined : Number(e.target.value)
                  })
                )
              }
            />
          </div>
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: 13, color: "var(--muted)" }}>Taraflar</h4>
        <div className="grid-form">
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Gönderici (ad)</label>
            <input
              value={seller.name ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, seller: { ...seller, name: e.target.value } } })
              }
            />
          </div>
          <div>
            <label>Gönderici vergi no</label>
            <input
              value={seller.taxNo ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, seller: { ...seller, taxNo: e.target.value } } })
              }
            />
          </div>
          <div>
            <label>Gönderici ülke</label>
            <input
              value={seller.country ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, seller: { ...seller, country: e.target.value } } })
              }
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Gönderici adres</label>
            <textarea
              rows={2}
              value={seller.address ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, seller: { ...seller, address: e.target.value } } })
              }
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Alıcı (ad)</label>
            <input
              value={buyer.name ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, buyer: { ...buyer, name: e.target.value } } })
              }
            />
          </div>
          <div>
            <label>Alıcı vergi no</label>
            <input
              value={buyer.taxNo ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, buyer: { ...buyer, taxNo: e.target.value } } })
              }
            />
          </div>
          <div>
            <label>Alıcı ülke</label>
            <input
              value={buyer.country ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, buyer: { ...buyer, country: e.target.value } } })
              }
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Alıcı adres</label>
            <textarea
              rows={2}
              value={buyer.address ?? ""}
              onChange={(e) =>
                onChange({ ...value, parties: { ...value.parties, buyer: { ...buyer, address: e.target.value } } })
              }
            />
          </div>
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: 13, color: "var(--muted)" }}>Ticaret</h4>
        <div className="grid-form">
          <div>
            <label>Teslim şekli</label>
            <input
              value={t.deliveryTerm ?? ""}
              onChange={(e) => onChange({ ...value, trade: { ...t, deliveryTerm: e.target.value } })}
            />
          </div>
          <div>
            <label>Ödeme şekli</label>
            <input
              value={t.paymentType ?? ""}
              onChange={(e) => onChange({ ...value, trade: { ...t, paymentType: e.target.value } })}
            />
          </div>
          <div>
            <label>Menşe</label>
            <input value={t.origin ?? ""} onChange={(e) => onChange({ ...value, trade: { ...t, origin: e.target.value } })} />
          </div>
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: 13, color: "var(--muted)" }}>Taşıma</h4>
        <div className="grid-form">
          <div>
            <label>Mod</label>
            <input value={tr.mode ?? ""} onChange={(e) => onChange({ ...value, transport: { ...tr, mode: e.target.value } })} />
          </div>
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: 13, color: "var(--muted)" }}>Kap / kilo</h4>
        <div className="grid-form">
          <div>
            <label>Toplam kap</label>
            <input
              type="number"
              value={p.totalPackage ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  packageInfo: { ...p, totalPackage: e.target.value === "" ? undefined : Number(e.target.value) }
                })
              }
            />
          </div>
          <div>
            <label>Kap cinsi</label>
            <input
              value={p.packageType ?? ""}
              onChange={(e) => onChange({ ...value, packageInfo: { ...p, packageType: e.target.value } })}
            />
          </div>
          <div>
            <label>Brüt kg</label>
            <input
              type="number"
              step="0.01"
              value={p.grossKg ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  packageInfo: { ...p, grossKg: e.target.value === "" ? undefined : Number(e.target.value) }
                })
              }
            />
          </div>
          <div>
            <label>Net kg</label>
            <input
              type="number"
              step="0.01"
              value={p.netKg ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  packageInfo: { ...p, netKg: e.target.value === "" ? undefined : Number(e.target.value) }
                })
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}
