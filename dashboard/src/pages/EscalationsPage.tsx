import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Siren, Play, ShieldCheck, ChevronRight } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Avatar } from "@/components/ui/Avatar"
import { Skeleton } from "@/components/ui/Skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { useToast } from "@/components/ui/Toast"
import { TierBadge, EscalationStatusBadge, TierLabel } from "@/components/ui/status-badges"
import { setEscalationStatus } from "@/lib/actions"
import { timeAgoFull, dateLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { EscalationStatus } from "@/lib/types"

type Filter = "active" | EscalationStatus | "all"

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "active", label: "Needs action" },
  { key: "open", label: "Open" },
  { key: "in-progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
]

export function EscalationsPage() {
  const { escalations, loading, refetch } = useLayoutData()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [filter, setFilter] = useState<Filter>("active")
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(() => {
    return {
      active: escalations.filter((e) => e.status === "open" || e.status === "in-progress").length,
      open: escalations.filter((e) => e.status === "open").length,
      "in-progress": escalations.filter((e) => e.status === "in-progress").length,
      resolved: escalations.filter((e) => e.status === "resolved").length,
      all: escalations.length,
    } as Record<Filter, number>
  }, [escalations])

  const filtered = useMemo(
    () => escalations.filter((e) => filter === "all" || (filter === "active" ? e.status !== "resolved" : e.status === filter)),
    [escalations, filter]
  )

  async function handleClick(e: { id: string; status: EscalationStatus }, action: "in-progress" | "resolved") {
    setBusy(e.id)
    const res = await setEscalationStatus(e.id, action)
    setBusy(null)
    if (res.error) toast("Update failed", { description: res.error, variant: "danger" })
    else toast(action === "resolved" ? "Escalation resolved" : "Marked in progress")
    refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
              filter === f.key ? "bg-navy text-white shadow-sm" : "border border-border bg-card text-muted hover:text-foreground"
            )}
          >
            {f.label}
            <span className={cn("rounded-full px-1.5 text-[10px] font-bold", filter === f.key ? "bg-white/20" : "bg-surface-2 text-muted-2")}>
              {counts[f.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<ShieldCheck size={18} />}
              title={filter === "active" || filter === "all" ? "No escalations" : `No ${filter} escalations`}
              description="When Franel can't handle something, or a case is sensitive, it escalates here with full context."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((e) => {
                const patient = e.conversation?.patient
                return (
                  <div key={e.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-3 lg:w-64">
                      <Avatar name={patient?.name} size="md" />
                      <button
                        className="min-w-0 text-left"
                        onClick={() => navigate(`/conversations/${e.conversation_id}`)}
                        title="Open conversation"
                      >
                        <span className="block truncate text-xs font-bold hover:text-primary">{patient?.name ?? "Unknown patient"}</span>
                        <span className="block text-[10.5px] text-muted-2">
                          {dateLabel(e.created_at)} · {timeAgoFull(e.created_at)}
                        </span>
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TierBadge tier={e.tier} />
                        <TierLabel tier={e.tier} />
                        <EscalationStatusBadge status={e.status} />
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
                        {e.description ?? e.conversation?.last_message_preview ?? "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/conversations/${e.conversation_id}`)}>
                        Open chat <ChevronRight size={12} />
                      </Button>
                      {e.status === "open" && (
                        <Button variant="outline" size="sm" disabled={busy === e.id} onClick={() => handleClick(e, "in-progress")}>
                          <Play size={11} /> Start
                        </Button>
                      )}
                      {e.status !== "resolved" && (
                        <Button size="sm" disabled={busy === e.id} onClick={() => handleClick(e, "resolved")}>
                          <ShieldCheck size={11} /> Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-2">
          <Siren size={11} className="text-danger" />
          Tier 1 = emergency (call now) · Tier 2 = urgent (today) · Tier 3 = operational (within 48h)
        </p>
      )}
    </div>
  )
}