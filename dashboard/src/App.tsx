import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "@/hooks/useAuth"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
import { PlatformProtectedRoute } from "@/components/auth/PlatformProtectedRoute"
import { Spinner } from "@/components/ui/Skeleton"
import Layout from "@/components/layout/Layout"
import { LoginPage } from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import InsightsPage from "@/pages/InsightsPage"
import { ConversationsListPage } from "@/pages/ConversationsListPage"
import { ConversationDetailPage } from "@/pages/ConversationDetailPage"
import { EscalationsPage } from "@/pages/EscalationsPage"
import { AppointmentsPage } from "@/pages/AppointmentsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { PatientsPage } from "@/pages/PatientsPage"
import { PatientDetailPage } from "@/pages/PatientDetailPage"
import { ToastProvider } from "@/components/ui/Toast"

const ConsoleRoot = lazy(() => import("@/console/ConsoleRoot"))

function ConsoleFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Spinner className="size-6" />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/console/*"
              element={
                <PlatformProtectedRoute>
                  <Suspense fallback={<ConsoleFallback />}>
                    <ConsoleRoot />
                  </Suspense>
                </PlatformProtectedRoute>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/insights" element={<InsightsPage />} />
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
