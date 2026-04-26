function companyPreview(): string {
  try {
    const id = import.meta.env.VITE_COMPANY_ID?.trim();
    if (!id) return "VITE_COMPANY_ID yok";
    return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
  } catch {
    return "—";
  }
}

export function Header() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "0.65rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "var(--surface)"
      }}
    >
      <span style={{ fontWeight: 600 }}>İhracat operasyon merkezi</span>
      <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
        Firma: {companyPreview()}
      </span>
    </header>
  );
}
