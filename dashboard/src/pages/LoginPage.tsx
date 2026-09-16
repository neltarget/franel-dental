import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/Button"
import { Input, Field } from "@/components/ui/Input"
import { Spinner } from "@/components/ui/Skeleton"
import { LogoLockup } from "@/components/brand/Logo"
import { Eye, EyeOff, MessageCircle, CalendarCheck, Siren, Check } from "lucide-react"
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/seed"

const FEATURES = [
  { icon: MessageCircle, text: "Franel answers and qualifies every WhatsApp enquiry" },
  { icon: CalendarCheck, text: "Appointments booked automatically inside your opening hours" },
  { icon: Siren, text: "Sensitive cases escalated to your team with full conversation context" },
  { icon: Check, text: "Reminders, check-ins and no-show recovery on autopilot" },
]

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn(email, password)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      navigate("/")
    }
  }

  return (
    <div className="flex min-h-dvh">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-navy p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <LogoLockup onDark size={34} />
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
            <span className="pulse-dot size-1.5 rounded-full bg-emerald-400" /> AI · Live
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
            Your front desk never sleeps.<br />
            <span className="text-white/70">Neither do your bookings.</span>
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-white/60">
            Franel runs your clinic's WhatsApp conversations end to end — qualify, book, remind
            and follow up — and hands humans only what needs a human.
          </p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <li key={f.text} className="flex items-start gap-3 text-[12.5px] text-white/80">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Icon size={13} className="text-emerald-300" />
                  </span>
                  {f.text}
                </li>
              )
            })}
          </ul>
        </div>

        <p className="relative text-[10.5px] text-white/40">
          Built for multi-clinic dental chains · Escalation-first AI · Full audit trail
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoLockup size={30} />
          </div>

          <h2 className="font-display text-xl font-extrabold tracking-tight">Sign in to your clinic</h2>
          <p className="mt-1.5 text-xs text-muted-2">Welcome back — your conversations are waiting.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            {error && (
              <div
                className="rounded-control border border-danger-soft bg-danger-soft/60 px-3 py-2.5 text-xs font-semibold text-danger"
                role="alert"
              >
                {error}
              </div>
            )}

            <Field label="Email" hint={`Enter "${DEMO_EMAIL}" to test`}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@clinic.com"
                required
                autoComplete="email"
                aria-describedby={error ? "login-error" : undefined}
              />
            </Field>

            <Field label="Password" hint={`Enter "${DEMO_PASSWORD}" to test`}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2 hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-3.5 border-background/30 border-t-white" />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-[10.5px] leading-relaxed text-muted-2">
            Need access? Ask your clinic owner to invite you as a team member.
            <br />
            Franel only ever acts on your clinic's WhatsApp data.
          </p>
        </div>
      </div>
    </div>
  )
}