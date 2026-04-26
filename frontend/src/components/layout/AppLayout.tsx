import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100%" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header />
        <main style={{ padding: "1rem 1.25rem 2rem", flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
