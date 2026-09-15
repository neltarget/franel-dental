import { useState, useEffect, useRef, createContext, useContext } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { enterDemo, exitDemo } from "@/lib/demo/store"
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID } from "@/lib/demo/seed"

const DEMO_USER = { id: DEMO_USER_ID, email: DEMO_EMAIL } as unknown as User

interface AuthContextType {
  user: User | null
  isDemo: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const isDemoRef = useRef(false)
  const [loading, setLoading] = useState(true)

  const setDemo = (v: boolean) => {
    isDemoRef.current = v
    setIsDemo(v)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isDemoRef.current) return
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isDemoRef.current) return
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      enterDemo()
      setDemo(true)
      setUser(DEMO_USER)
      return {}
    }

    if (isDemo) {
      exitDemo()
      setDemo(false)
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return {}
  }

  const signOut = async () => {
    if (isDemo) {
      exitDemo()
      setDemo(false)
      setUser(null)
      return
    }
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, isDemo, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}