import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/hooks/useAuth"

export interface PlatformSeat {
  id: string
  auth_user_id: string
  name: string
  email: string
  role: "platform_admin" | "platform_support"
  is_active: boolean
}

export interface PlatformSession {
  seat: PlatformSeat | null
  checking: boolean
}

// Mirrors useAuth, but answers "is THIS signed-in user a Franel platform
// operator (Frank & Nelson) rather than a clinic staffer?" The answer comes
// from platform_users (RLS: readable only by platform users), so a clinic
// staff token gets an empty result and is bounced out of /console.
export function usePlatformSession(): PlatformSession {
  const { user, loading: authLoading, isDemo } = useAuth()
  const [seat, setSeat] = useState<PlatformSeat | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (authLoading || !user || isDemo) {
      setSeat(null)
      setChecking(false)
      return
    }
    let active = true
    supabase
      .from("platform_users")
      .select("id, auth_user_id, name, email, role, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) {
          setSeat(null)
        } else {
          setSeat(data as PlatformSeat)
        }
        setChecking(false)
      })
    return () => {
      active = false
    }
  }, [user, authLoading, isDemo])

  return { seat, checking: authLoading || checking }
}