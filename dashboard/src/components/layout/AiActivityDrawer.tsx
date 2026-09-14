import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CalendarCheck,
  BellRing,
  BadgeCheck,
  HeartHandshake,
  Send,
  Siren,
  ShieldCheck,
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  Search,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { timeAgoFull } from "@/lib/format"
import type { AiActivityEvent } from "@/lib/types"
import { Drawer } from "@/components/ui/Drawer"
import { Avatar } from "@/components/ui/Avatar"
import { EmptyState } from "@/components/ui/EmptyState"
import { useLayoutData } from "./Layout"

const EVENT_META: Record<AiActivityEvent["type"], { icon: LucideIcon; tone: string }> = {
  lead_qualified: { icon: BadgeCheck, tone: "bg-primary-soft text-primary" },
  appointment_booked: { icon: CalendarCheck, tone: "bg-info-soft text-info" },
  appointment_reminder: { icon: BellRing, tone: "bg-warning-soft text-warning" },
  post_visit_checkin: { icon: HeartHandshake, tone: "bg-success-soft text-success" },
  follow_up_sent: { icon: Send, tone: "bg-info-soft text-info" },
  escalation_created: { icon: Siren, tone: "bg-danger-soft text-danger" },
  escalation_resolved: { icon: ShieldCheck, tone: "bg-success-soft text-success" },
  no_show_flagged: { icon: AlertTriangle, tone: "bg-warning-soft text-warning" },
  patient_replied: { icon: MessageCircle, tone: "bg-surface-2 text-muted" },
  conversation_closed: { icon: CheckCircle2, tone: "bg-surface-2 text-muted" },
}

type Filter = "all" | "bookings" | "escalations"

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "bookings", label: "Bookings" },
  { key: "escalations", label: "Escalations" },
]

function matchesFilter(e: AiActivityEvent, f: Filter): boolean {
  if (f === "all") return true
  if (f === "bookings")
    return e.type === "appointment_booked" || e.type === "appointment_reminder" || e.type === "post_visit_checkin"
  return e.type === "escalation_created" || e.type === "escalation_resolved" || e.type === "no_show_flagged"
}

export default function AiActivityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activities } = useLayoutData()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activities.filter((e) => matchesFilter(e, filter)).filter(
      (e) => !q || e.label.toLowerCase().includes(q) || (e.patientName ?? "").toLowerCase().includes(q)
    )
  }, [activities, filter, query])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={420}
      title="AI Activity Log"
      subtitle="Every action Franel took across your WhatsApp chats"
    >
      <div className="space-y-2.5 border-b border-border px-4 py-3">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient or action…"
            className="w-full rounded-control border border-border bg-surface-2/50 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-2 focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                filter === f.key ? "bg-navy text-white" : "bg-surface-2 text-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {items.length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon={<Search size={18} />}
              title="No activity found"
              description={query ? "Try a different search term." : "Franel actions will appear here."}
            />
          </div>
        ) : (
          <ol className="space-y-1">
            {items.map((e) => {
              const meta = EVENT_META[e.type]
              const Icon = meta.icon
              return (
                <li key={e.id}>
                  <button
                    className="flex w-full items-start gap-2.5 rounded-card p-2.5 text-left transition-colors hover:bg-surface-2/70 anim-fade"
                    onClick={() => {
                      onClose()
                      navigate(`/conversations/${e.conversationId}`)
                    }}
                  >
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", meta.tone)}>
                      <Icon size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium leading-snug">{e.label}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-2">
                        <Avatar name={e.patientName ?? "?"} size="xs" />
                        <span className="truncate">{e.patientName}</span>
                        <span>· {timeAgoFull(e.at)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Drawer>
  )
}