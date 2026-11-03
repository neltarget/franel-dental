import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import { Spinner } from "@/components/ui/Skeleton"
import ConsoleLayout from "./ConsoleLayout"

const Overview = lazy(() => import("./Overview"))
const ClinicsPage = lazy(() => import("./ClinicsPage"))
const AuditPage = lazy(() => import("./AuditPage"))

function Fallback() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}

// Single lazy entry for the /console/* world. Vite splits the sidebar shell
// and each screen into their own chunks; the clinic app never imports any of
// this folder, so its users never download console code.
export default function ConsoleRoot() {
  return (
    <ConsoleLayout>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="clinics" element={<ClinicsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Routes>
      </Suspense>
    </ConsoleLayout>
  )
}