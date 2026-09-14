import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, MessageCircle } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Avatar } from "@/components/ui/Avatar"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/Skeleton"
import { StatusBadge, LeadBadge } from "@/components/ui/status-badges"
import { timeAgo } from "@/lib/format"
import type { ConversationStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_TABS: Array<{ key: ConversationStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "qualified", label: "Qualified" },
  { key: "booked", label: "Booked" },
  { key: "escalated", label: "Escalated" },
  { key: "closed", label: "Closed" },
]

export function ConversationsListPage() {
  const { conversations, loading } = useLayoutData()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<ConversationStatus | "all">("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return conversations
      .filter((c) => (status === "all" ? true : c.status === status))
      .filter(
        (c) =>
          !q ||
          (c.patient?.name ?? "").toLowerCase().includes(q) ||
          (c.patient?.phone ?? "").includes(q) ||
          (c.last_message_preview ?? "").toLowerCase().includes(q) ||
          (c.service_interest ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
  }, [conversations, query, status])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of conversations) m.set(c.status, (m.get(c.status) ?? 0) + 1)
    return m
  }, [conversations])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient, phone or message…"
            className="pl-9"
            aria-label="Search conversations"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                status === t.key ? "bg-navy text-white shadow-sm" : "bg-card text-muted hover:text-foreground border border-border"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold",
                  status === t.key ? "bg-white/20" : "bg-surface-2 text-muted-2"
                )}
              >
                {t.key === "all" ? conversations.length : counts.get(t.key) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<MessageCircle size={18} className="text-primary" />}
                title={query || status !== "all" ? "No matching conversations" : "No conversations yet"}
                description={
                  query || status !== "all"
                    ? "Try adjusting your search or filter."
                    : "When a patient messages your WhatsApp number, the conversation appears here automatically."
                }
                actionLabel={query || status !== "all" ? "Clear filters" : undefined}
                onAction={query || status !== "all" ? () => { setQuery(""); setStatus("all") } : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Conversation</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Intent</th>
                    <th className="px-4 py-3 text-right">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/conversations/${c.id}`)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={c.patient?.name} size="sm" online={c.status !== "closed"} />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold">{c.patient?.name ?? "Unknown patient"}</span>
                            <span className="block truncate text-[10.5px] text-muted-2">{c.patient?.phone}</span>
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <span className="block truncate text-xs">{c.last_message_preview ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3">
                        <LeadBadge level={c.lead_level} />
                      </td>
                      <td className="max-w-[180px] px-4 py-3">
                        <span className="block truncate text-[11px] text-muted">{c.service_interest ?? c.intent ?? "—"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-[11px] text-muted">{timeAgo(c.last_message_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-2.5">
            <span className="text-[11px] text-muted-2">
              {filtered.length} conversation{filtered.length === 1 ? "" : "s"}
              {status !== "all" ? ` · ${status}` : ""}
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}