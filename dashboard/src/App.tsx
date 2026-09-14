import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "@/hooks/useAuth"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
import Layout from "@/components/layout/Layout"
import { LoginPage } from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import { ConversationsListPage } from "@/pages/ConversationsListPage"
import { ConversationDetailPage } from "@/pages/ConversationDetailPage"
import { EscalationsPage } from "@/pages/EscalationsPage"
import { AppointmentsPage } from "@/pages/AppointmentsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { PatientsPage } from "@/pages/PatientsPage"
import { PatientDetailPage } from "@/pages/PatientDetailPage"
import { ToastProvider } from "@/components/ui/Toast"

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/conversations" element={<ConversationsListPage />} />
                      <Route path="/conversations/:id" element={<ConversationDetailPage />} />
                      <Route path="/escalations" element={<EscalationsPage />} />
                      <Route path="/appointments" element={<AppointmentsPage />} />
                      <Route path="/patients" element={<PatientsPage />} />
                      <Route path="/patients/:id" element={<PatientDetailPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
