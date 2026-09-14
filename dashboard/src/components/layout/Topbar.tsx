import { useMemo, useRef, useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { CalendarDays, Bell, RefreshCw, Menu, LogOut, ChevronDown, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { timeShort, timeAgoFull } from "@/lib/format"
import { requestRefresh } from "@/lib/refresh"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/Button"
import { Avatar } from "@/components/ui/Avatar"
import { EmptyState } from "@/components/ui/EmptyState"
import { useLayoutData } from "./Layout"

const RANGE_LABELS = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
} as const

export type DateRange = keyof typeof RANGE_LABELS

const TITLES: Array<{ match: (p: string) => boolean; title: string }> = [
  { match: (p) => p === "/", title: "Dashboard" },
  { match: (p) => p.startsWith("/conversations"), title: "Messages" },
  { match: (p) => p.startsWith("/appointments"), title: "Bookings" },
  { match: (p) => p.startsWith("/patients"), title: "Patients" },
  { match: (p) => p.startsWith("/escalations"), title: "Escalations" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
]

interface TopbarProps {
  onOpenMobileNav: () => void
}

export default function Topbar({ onOpenMobileNav }: TopbarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { clinic, staff, activities, unreadCount, range, setRange, openActivity } = useLayoutData()
  const [bellOpen, setBellOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [read, setRead] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const title = TITLES.find((t) => t.match(location.pathname))?.title ?? "Dashboard"

  const unreadBadge = read ? 0 : unreadCount

  useEffect(() => {
    setRead(false)
  }, [location.pathname])

  const notifications = useMemo(() => activities.slice(0, 6), [activities])

  const handleRefresh = () => {
    setRefreshing(true)
    requestRefresh()
    window.setTimeout(() => setRefreshing(false), 900)
  }

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
        >
          <Menu size={16} />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display truncate text-[15px] font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="hidden truncate text-[10.5px] text-muted sm:block">
            {clinic?.name ?? "HarbourView Dental Clinic"} · WhatsApp AI Console
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Date range */}
        <div className="relative hidden sm:block">
          <Button variant="outline" size="sm" onClick={() => setRangeOpen((v) => !v)} aria-haspopup="listbox">
            <CalendarDays size={13} />
            {RANGE_LABELS[range]}
            <ChevronDown size={12} className="text-muted-2" />
          </Button>
          {rangeOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setRangeOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-40 rounded-control border border-border bg-card p-1 shadow-pop anim-pop">
                {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRange(r)
                      setRangeOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-surface-2",
                      r === range && "bg-surface-2 text-foreground"
                    )}
                  >
                    {RANGE_LABELS[r]}
                    {r === range && <span className="size-1.5 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          aria-label="Refresh data"
          title="Refresh"
          className={cn(refreshing && "[&_svg]:animate-spin")}
        >
          <RefreshCw size={14} />
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setBellOpen((v) => !v)}
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={14} />
            {unreadBadge > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                {unreadBadge > 9 ? "9+" : unreadBadge}
              </span>
            )}
          </Button>
          {bellOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBellOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-[340px] max-w-[calc(100vw-2rem)] rounded-card border border-border bg-card shadow-pop anim-pop">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                  <p className="font-display text-xs font-bold">Notifications</p>
                  <button
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary hover:underline"
                    onClick={() => setRead(true)}
                  >
                    <CheckCheck size={12} /> Mark all read
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-4">
                    <EmptyState icon={<Bell size={18} />} title="No new activity" description="Franel activity will appear here." />
                  </div>
                ) : (
                  <ul className="max-h-80 overflow-y-auto p-1.5">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                          onClick={() => {
                            setBellOpen(false)
                            navigate(`/conversations/${n.conversationId}`)
                          }}
                        >
                          <Avatar name={n.patientName} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium leading-snug">{n.label}</span>
                            <span className="mt-0.5 block text-[10.5px] text-muted-2">{timeAgoFull(n.at)}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-muted-2">{timeShort(n.at)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-border p-2">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => { setBellOpen(false); openActivity() }}>
                    View full activity log
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile */}
        <div className="relative ml-1">
          <button
            className="flex items-center gap-1 rounded-full p-0.5 pr-1 hover:ring-[var(--shadow-ring)]"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
          >
            <Avatar name={staff?.name ?? "Team"} size="sm" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-card border border-border bg-card p-1.5 shadow-pop anim-pop">
                <div className="px-2.5 py-2">
                  <p className="text-xs font-bold">{staff?.name ?? "Team member"}</p>
                  <p className="text-[10.5px] text-muted-2">{staff?.email ?? ""}</p>
                  <p className="mt-1 text-[10px] font-semibold text-muted">
                    {staff ? cap(staff.role) : ""} · {clinic?.name}
                  </p>
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate("/settings")
                  }}
                >
                  <CalendarDays size={13} className="text-muted-2" /> Settings
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft"
                  onClick={async () => {
                    setMenuOpen(false)
                    await signOut()
                    navigate("/login")
                  }}
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}