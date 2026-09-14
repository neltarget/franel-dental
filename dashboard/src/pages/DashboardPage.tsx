import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  MessageCircle,
  UserPlus,
  CalendarCheck,
  Siren,
  Sparkles,
  ArrowRight,
  CheckCheck,
  Clock,
  type LucideIcon,
} from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Avatar } from "@/components/ui/Avatar"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton, Spinner } from "@/components/ui/Skeleton"
import { StatusBadge, TierBadge, AppointmentStatusBadge } from "@/components/ui/status-badges"
import { timeAgo, isTodayStr } from "@/lib/format"
import { cn } from "@/lib/utils"

interface StatCardDef {
  key: string
  label: string
  value: string | number
  sub: string
  icon: LucideIcon
  iconClass: string
  to: string
}

export default function DashboardPage() {
  const { stats, conversations, appointments, loading, openActivity, handledToday } = useLayoutData()
  const navigate = useNavigate()

  const statCards: StatCardDef[] = useMemo(
    () => [
      {
        key: "messages",
        label: "Messages today",
        value: stats.messagesToday,
        sub: "handled automatically by Franel",
        icon: MessageCircle,
        iconClass: "bg-primary-soft text-primary",
        to: "/conversations",
      },
      {
        key: "conversations",
        label: "New conversations",
        value: stats.conversationsToday,
        sub: `${stats.qualifiedThisWeek} qualified this week`,
        icon: UserPlus,
        iconClass: "bg-info-soft text-info",
        to: "/conversations",
      },
      {
        key: "bookings",
        label: "Bookings today",
        value: stats.bookingsToday,
        sub: `${stats.aiBooked} booked by Franel`,
        icon: CalendarCheck,
        iconClass: "bg-success-soft text-success",
        to: "/appointments",
      },
      {
        key: "awaiting",
        label: "Awaiting human",
        value: stats.awaitingHuman,
        sub: `${stats.openEscalations} open escalation${stats.openEscalations === 1 ? "" : "s"}`,
        icon: Siren,
        iconClass: "bg-warning-soft text-warning",
        to: "/escalations",
      },
    ],
    [stats]
  )

  const attention = useMemo(() => {
    const escalated = conversations.filter(
      (c) => c.status === "escalated" && c.escalations?.some((e) => e.status !== "resolved")
    )
    const staleNew = conversations.filter(
      (c) => c.status === "new" && c.last_message_at && Date.now() - new Date(c.last_message_at).getTime() > 30 * 60 * 1000
    )
    return { escalated, staleNew }
  }, [conversations])

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => (a.status === "confirmed" || a.status === "pending") && a.appointment_date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => (a.appointment_date + a.appointment_time).localeCompare(b.appointment_date + b.appointment_time))
        .slice(0, 5),
    [appointments]
  )

  const recent = useMemo(
    () => [...conversations].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "")).slice(0, 8),
    [conversations]
  )

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      {/* AI hero */}
      <section className="relative overflow-hidden rounded-card border border-navy-2 bg-gradient-to-br from-[#0a1c33] via-navy to-navy-2 p-4 text-white shadow-card sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-[#2fd8c2]/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 size-36 rounded-full bg-[#2fd8c2]/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#2fd8c2] ring-1 ring-inset ring-white/15">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 font-display text-sm font-bold tracking-tight">
                Franel AI is active
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2fd8c2]/15 px-2 py-0.5 text-[10px] font-bold text-[#2fd8c2] ring-1 ring-inset ring-[#2fd8c2]/30">
                  <span className="size-1.5 rounded-full bg-[#2fd8c2] pulse-dot" />
                  LIVE
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <HeroStat value={`${handledToday}`} label="managed today" />
                <HeroStat value="42s" label="avg response" />
                <HeroStat value={`${stats.aiResolutionRate}%`} label="auto-resolved" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:shrink-0">
            <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-inset ring-white/10">
              <div>
                <p className="font-display text-lg font-extrabold leading-none text-white">{stats.bookingsToday}</p>
                <p className="mt-1 flex items-center gap-1 text-[9.5px] font-semibold text-white/60">
                  <CalendarCheck size={10} className="text-[#2fd8c2]" />
                  Booked today
                </p>
              </div>
              <span className="h-8 w-px bg-white/15" />
              <div>
                <p className="font-display text-lg font-extrabold leading-none text-white">{stats.awaitingHuman}</p>
                <p className="mt-1 flex items-center gap-1 text-[9.5px] font-semibold text-white/60">
                  <Siren size={10} className="text-amber-300" />
                  Awaiting human
                </p>
              </div>
            </div>
            <button
              onClick={openActivity}
              title="Open the AI activity log"
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-navy shadow-sm transition-all hover:bg-white/90 active:scale-95"
            >
              AI Activity Log
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.to)}
              className="rounded-card border border-border bg-card p-4 text-left shadow-card transition-all duration-150 hover:border-border-strong hover:shadow-pop"
            >
              <div className="flex items-center justify-between">
                <span className={`flex size-8 items-center justify-center rounded-lg ${s.iconClass}`}>
                  <Icon size={15} />
                </span>
                <ArrowRight size={13} className="text-muted-2" />
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <p className="font-display text-2xl font-extrabold tracking-tight">{s.value}</p>
                {s.key === "awaiting" && stats.openEscalations > 0 && (
                  <Badge variant="gold">
                    <Siren size={10} strokeWidth={2.5} /> Urgent
                  </Badge>
                )}
              </div>
              <p className="text-xs font-semibold">{s.label}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-2">{s.sub}</p>
            </button>
          )
        })}
      </section>

      {/* Needs attention + upcoming bookings */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Conversations where Franel needs a person</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/escalations")}>
              All escalations
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {attention.escalated.length === 0 && attention.staleNew.length === 0 ? (
              <EmptyState
                icon={<CheckCheck size={18} className="text-success" />}
                title="All clear"
                description="Nothing needs a human right now — Franel is handling everything."
              />
            ) : (
              <>
                {attention.escalated.slice(0, 4).map((c) => {
                  const esc = (c.escalations ?? []).find((e) => e.status !== "resolved")
                  return (
                    <div
                      key={c.id}
                      className="flex w-full items-center gap-3 rounded-card border border-danger/15 bg-danger-soft/40 p-3 transition-colors hover:bg-danger-soft/70"
                    >
                      <button
                        onClick={() => navigate(`/conversations/${c.id}`)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Avatar name={c.patient?.name} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-bold">{c.patient?.name ?? "Unknown patient"}</span>
                            {esc && <TierBadge tier={esc.tier} />}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted">{c.last_message_preview ?? c.intent}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-danger">
                          <Clock size={11} />
                          {timeAgo(c.last_message_at)}
                        </span>
                      </button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/conversations/${c.id}`)}>
                        Reply
                      </Button>
                    </div>
                  )
                })}
                {attention.staleNew.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="flex w-full items-center gap-3 rounded-card border border-border bg-surface-2/40 p-3 transition-colors hover:bg-surface-2"
                  >
                    <button
                      onClick={() => navigate(`/conversations/${c.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Avatar name={c.patient?.name} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-bold">{c.patient?.name ?? "Unknown patient"}</span>
                          <StatusBadge status={c.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted">{c.last_message_preview}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-warning">
                        <Clock size={11} />
                        {timeAgo(c.last_message_at)}
                      </span>
                    </button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/conversations/${c.id}`)}>
                      Reply
                    </Button>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Upcoming bookings</CardTitle>
                <Badge variant="neutral">{upcoming.length}</Badge>
              </div>
              <CardDescription>Next on the schedule</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/appointments")}>
              Full schedule
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck size={18} className="text-success" />}
                title="No upcoming bookings"
                description="New bookings made by Franel or your team will appear here."
              />
            ) : (
              upcoming.map((a) => (
                <button
                  key={a.id}
                  onClick={() => a.conversation_id && navigate(`/conversations/${a.conversation_id}`)}
                  className="flex w-full items-center gap-3 rounded-card px-2 py-2 text-left transition-colors hover:bg-surface-2/60"
                >
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1.5">
                    <span className="text-[10px] font-bold uppercase text-muted">
                      {isTodayStr(a.appointment_date)
                        ? "Today"
                        : new Date(a.appointment_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" })}
                    </span>
                    <span className="text-[11px] font-extrabold">{a.appointment_time.slice(0, 5)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{a.patient?.name ?? "Patient"}</span>
                    <span className="block truncate text-[11px] text-muted">{a.service}</span>
                  </span>
                  <AppointmentStatusBadge status={a.status} />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Conversations */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Conversations</CardTitle>
            <CardDescription>Latest WhatsApp activity across all patients</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/conversations")}>
            View all
            <ArrowRight size={13} />
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">
                <th className="px-4 py-2.5">Patient</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Last message</th>
                <th className="px-4 py-2.5">Wait</th>
                <th className="px-4 py-2.5">Handler</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8">
                    <EmptyState
                      icon={<MessageCircle size={18} className="text-primary" />}
                      title="No conversations yet"
                      description="When patients message your clinic number, they'll show up here."
                    />
                  </td>
                </tr>
              ) : (
                recent.map((c) => {
                  const last = c.messages?.[c.messages.length - 1]
                  const waitMin = c.last_message_at
                    ? Math.floor((Date.now() - new Date(c.last_message_at).getTime()) / 60000)
                    : null
                  const stale = waitMin !== null && waitMin > 30
                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/conversations/${c.id}`)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={c.patient?.name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold">{c.patient?.name ?? "Unknown patient"}</span>
                            <span className="block truncate text-[10.5px] text-muted-2">{c.patient?.phone}</span>
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[180px] px-4 py-3">
                        <span className="block truncate text-xs">{c.service_interest ?? c.intent ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-col items-start gap-1">
                          <StatusBadge status={c.status} />
                        </span>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <span className="block truncate text-xs">{c.last_message_preview ?? "—"}</span>
                        {last && (
                          <span className="mt-0.5 block truncate text-[10.5px] text-muted-2">
                            {last.sender === "patient" ? "Patient" : last.sender === "staff" ? "Staff" : "Franel"}
                            {" · "}
                            {timeAgo(last.created_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] font-semibold", stale ? "text-danger" : "text-muted")}>
                          {waitMin === null ? "—" : timeAgo(c.last_message_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {last?.sender === "staff" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                            Staff
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <Sparkles size={10} /> Franel
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/conversations/${c.id}`)
                          }}
                        >
                          Reply
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 ring-1 ring-inset ring-white/10">
      <span className="font-display text-xs font-extrabold leading-none text-white">{value}</span>
      <span className="text-[9.5px] font-semibold leading-none text-white/55">{label}</span>
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-64" />
      <div className="flex justify-center py-2 text-muted-2">
        <Spinner className="size-4" />
      </div>
    </div>
  )
}