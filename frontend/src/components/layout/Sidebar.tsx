import { NavLink } from "react-router-dom";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "0.55rem 0.75rem",
  borderRadius: 8,
  color: isActive ? "#fff" : "var(--muted)",
  background: isActive ? "var(--surface2)" : "transparent",
  fontWeight: isActive ? 600 : 400,
  textDecoration: "none"
});

export function Sidebar() {
  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "1rem 0.75rem"
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: "1rem", paddingLeft: 8, letterSpacing: 0.3 }}>
        Beyanname
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <NavLink to="/" end style={linkStyle}>
          Özet
        </NavLink>
        <NavLink to="/declarations" style={linkStyle}>
          Beyannameler
        </NavLink>
        <NavLink to="/declarations/new" style={linkStyle}>
          Yeni beyanname
        </NavLink>
      </nav>
    </aside>
  );
}
