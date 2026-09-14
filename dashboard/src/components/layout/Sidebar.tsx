import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  MessageCircle,
  CalendarDays,
  Users,
  Siren,
  Settings,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"
import type { Clinic, Staff } from "@/lib/types"

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  tone: string
  end?: boolean
}

const NAV_WORKSPACE: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, tone: "text-primary", end: true },
  { to: "/conversations", label: "Messages", icon: MessageCircle, tone: "text-info" },
  { to: "/appointments", label: "Bookings", icon: CalendarDays, tone: "text-success" },
  { to: "/patients", label: "Patients", icon: Users, tone: "text-violet" },
  { to: "/escalations", label: "Escalations", icon: Siren, tone: "text-danger" },
]

const NAV_MORE: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings, tone: "text-muted-2" },
]

function badgeFor(item: NavItem, unreadCount: number, escalateCount: number): number {
  if (item.to === "/conversations") return unreadCount
  if (item.to === "/escalations") return escalateCount
  return 0
}

export interface SidebarProps {
  unreadCount?: number
  escalateCount?: number
  handledToday?: number
  staff?: Staff | null
  clinic?: Clinic | null
  onNavigate?: () => void
  collapsed?: boolean
  onToggle?: () => void
  className?: string
}

export default function Sidebar({
  unreadCount = 0,
  escalateCount = 0,
  handledToday = 0,
  staff,
  clinic,
  onNavigate,
  collapsed = false,
  onToggle,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-border bg-card text-foreground transition-[width] duration-200 ease-in-out",
        collapsed ? "w-14" : "w-60",
        className
      )}
    >
      {collapsed ? (
        <Rail
          unreadCount={unreadCount}
          escalateCount={escalateCount}
          staff={staff}
          handledToday={handledToday}
          onNavigate={onNavigate}
          onToggle={onToggle}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-1.5 px-2.5 pb-3 pt-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles size={15} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="font-display text-[15px] font-extrabold tracking-tight">
                  Franel{" "}
                  <span className="text-[13px] font-bold text-muted-2">Dental</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-1.5 py-px text-[9px] font-bold text-primary">
                  <span className="size-1 rounded-full bg-primary pulse-dot" />
                  AI · Live
                </span>
              </span>
              <span className="block text-[10px] font-medium text-muted">WhatsApp console</span>
            </span>
            {onToggle && (
              <button
                onClick={onToggle}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy text-white shadow-sm transition-all hover:bg-navy-2 active:scale-95"
              >
                <ChevronLeft size={15} strokeWidth={2.2} />
              </button>
            )}
          </div>

          {/* AI agent summary */}
          <div className="mx-2.5 rounded-card border border-border border-l-2 border-l-primary bg-surface-2/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold">AI Agent</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                <span className="size-1.5 rounded-full bg-success pulse-dot" />
                Active
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="border-l-2 border-border-strong pl-2">
                <p className="text-[13px] font-extrabold leading-none">{handledToday}</p>
                <p className="mt-0.5 text-[9.5px] leading-tight text-muted">handled today</p>
              </div>
              <div className="border-l-2 border-border-strong pl-2">
                <p className="text-[13px] font-extrabold leading-none">42s</p>
                <p className="mt-0.5 text-[9.5px] leading-tight text-muted">avg. response</p>
              </div>
            </div>
          </div>

          {/* Nav groups */}
          <nav className="mt-3 flex-1 space-y-3 overflow-y-auto px-2.5 pt-1">
            <Group
              label="Workspace"
              items={NAV_WORKSPACE}
              unreadCount={unreadCount}
              escalateCount={escalateCount}
              onNavigate={onNavigate}
            />
            <div className="h-px bg-border-strong" />
            <Group
              label="More"
              items={NAV_MORE}
              unreadCount={unreadCount}
              escalateCount={escalateCount}
              onNavigate={onNavigate}
            />
          </nav>

          {/* User chip */}
          <div className="border-t border-border-strong p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-extrabold text-primary">
                {initials(staff?.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">{staff?.name ?? "Team member"}</span>
                <span className="block truncate text-[10px] text-muted">
                  {staff ? cap(staff.role) : "—"} · {clinic?.name ?? "HarbourView Dental"}
                </span>
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}

function Group({
  label,
  items,
  unreadCount,
  escalateCount,
  onNavigate,
}: {
  label: string
  items: NavItem[]
  unreadCount: number
  escalateCount: number
  onNavigate?: () => void
}) {
  return (
    <div>
      <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-2">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const badge = badgeFor(item, unreadCount, escalateCount)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                  isActive ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2/70 hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="relative">
                    <item.icon size={16} strokeWidth={1.9} className={item.tone} />
                    {badge > 0 && (
                      <span
                        className={cn(
                          "absolute -right-1 -top-1 size-1.5 rounded-full",
                          item.to === "/escalations" ? "bg-warning" : "bg-primary"
                        )}
                      />
                    )}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-bold",
                        item.to === "/escalations"
                          ? "bg-warning-soft text-warning"
                          : "bg-primary-soft text-primary"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

function Rail({
  unreadCount,
  escalateCount,
  staff,
  handledToday,
  onNavigate,
  onToggle,
}: {
  unreadCount: number
  escalateCount: number
  staff?: Staff | null
  handledToday: number
  onNavigate?: () => void
  onToggle?: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center border-r border-border py-3">
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy text-white shadow-sm transition-all hover:bg-navy-2 active:scale-95"
        >
          <ChevronRight size={15} strokeWidth={2.2} />
        </button>
      )}
      <span
        className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
        title="Franel · AI live"
      >
        <Sparkles size={15} strokeWidth={2.2} />
      </span>
      <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {NAV_WORKSPACE.map((item) => (
          <RailItem
            key={item.to}
            item={item}
            unreadCount={unreadCount}
            escalateCount={escalateCount}
            onNavigate={onNavigate}
          />
        ))}
        <div className="my-1.5 w-6 shrink-0 border-t border-border-strong" />
        {NAV_MORE.map((item) => (
          <RailItem
            key={item.to}
            item={item}
            unreadCount={unreadCount}
            escalateCount={escalateCount}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <span
        className="mt-2 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-extrabold text-primary"
        title={staff ? `${staff.name} · ${staff.role}` : "Team member"}
      >
        {initials(staff?.name)}
      </span>
      <span
        className="mt-2 size-2 rounded-full bg-success pulse-dot"
        title={`AI agent active · ${handledToday} handled today`}
      />
    </div>
  )
}

function RailItem({
  item,
  unreadCount,
  escalateCount,
  onNavigate,
}: {
  item: NavItem
  unreadCount: number
  escalateCount: number
  onNavigate?: () => void
}) {
  const badge = badgeFor(item, unreadCount, escalateCount)
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={item.label}
      className={({ isActive }) =>
        cn(
          "relative flex size-9 items-center justify-center rounded-lg transition-colors",
          isActive ? "bg-surface-2" : "hover:bg-surface-2/70"
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon size={17} strokeWidth={1.9} className={item.tone} />
          {badge > 0 && (
            <span
              className={cn(
                "absolute right-1 top-1 size-1.5 rounded-full",
                item.to === "/escalations" ? "bg-warning" : "bg-primary"
              )}
            />
          )}
          {isActive && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
        </>
      )}
    </NavLink>
  )
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}