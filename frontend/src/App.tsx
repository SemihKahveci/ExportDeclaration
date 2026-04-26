import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { DeclarationsPage } from "@/pages/DeclarationsPage";
import { NewDeclarationPage } from "@/pages/NewDeclarationPage";
import { DeclarationDetailPage } from "@/pages/DeclarationDetailPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/declarations" element={<DeclarationsPage />} />
        <Route path="/declarations/new" element={<NewDeclarationPage />} />
        <Route path="/declarations/:id" element={<DeclarationDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
