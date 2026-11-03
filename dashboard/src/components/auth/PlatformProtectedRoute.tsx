import { Navigate } from "react-router-dom"
import { usePlatformSession } from "@/hooks/usePlatformSession"
import { Spinner } from "@/components/ui/Skeleton"

// Entry guard for /console. Sign-in itself stays on the shared /login page
// (platform seats sign in there too); this route only separates platform
// operators from clinic users. A signed-in clinic user hitting /console is
// sent back to their own dashboard, never shown console chrome.
export function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const { seat, checking } = usePlatformSession()

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!seat) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}