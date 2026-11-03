import { NavLink } from "react-router-dom"
import { LayoutDashboard, Stethoscope, ScrollText, LogOut, type LucideIcon } from "lucide-react"
import { LogoMark } from "@/components/brand/Logo"
import { usePlatformSession } from "@/hooks/usePlatformSession"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV: NavItem[] = [
  { to: "/console", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/console/clinics", label: "Clinics", icon: Stethoscope },
  { to: "/console/audit", label: "Audit log", icon: ScrollText },
]

// The console is its own shell: own sidebar, never the clinic Layout. It is a
// route-level lazy chunk (see App.tsx), so clinic staff never download this
// code at all — RLS + this separation keep the two worlds apart.
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { seat } = usePlatformSession()
  const { signOut } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <LogoMark className="size-7" />
          <div className="leading-tight">
            <p className="font-display text-[13px] font-bold tracking-tight">Franel Console</p>
            <p className="text-[10px] text-muted">platform operator</p>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-border p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-[12px] font-semibold">{seat?.name}</p>
            <p className="truncate text-[10.5px] text-muted">{seat?.email}</p>
            {seat?.role && (
              <span className="mt-1 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted">
                {seat.role.replace("_", " ")}
              </span>
            )}
          </div>
          <a
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Stethoscope className="size-4" />
            Clinic dashboard
          </a>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] p-4 lg:p-6">{children}</div>
      </main>
    </div>
  )
}