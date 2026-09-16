import { useMemo } from "react"
import { TrendingUp, Timer, CalendarCheck2, UserPlus } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Skeleton } from "@/components/ui/Skeleton"
import { InsightsChatBody } from "@/components/insights/InsightsChatBody"
import { computeInsights } from "@/lib/insights"
import { cn } from "@/lib/utils"

export default function InsightsPage() {
  const { clinic, conversations, appointments, patients, loading } = useLayoutData()
  const ins = useMemo(() => computeInsights(conversations, appointments, patients), [conversations, appointments, patients])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-extrabold tracking-tight">Insights</h1>
          <p className="mt-1 max-w-xl text-xs text-muted">
            What's converting, what's stuck, and what to do next — based only on {clinic?.name ?? "your clinic"}'s
            patient pipeline. Franel Analyst below is read-only: it can't send or change anything.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-bold text-muted">
          <span className="size-1.5 rounded-full bg-success" /> Franel Analyst · read-only
        </span>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-44" />
                <Skeleton className="h-44" />
              </div>
              <Skeleton className="h-44" />
            </div>
            <Skeleton className="h-[560px]" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="min-w-0 space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                icon={<TrendingUp size={14} />}
                label="Pipeline"
                value={`${ins.funnel.booked}/${ins.funnel.enquiries}`}
                sub={`${ins.conversion.qualifiedToBookedPct}% of qualified get booked`}
              />
              <StatCard
                icon={<Timer size={14} />}
                label="Avg first reply"
                value={ins.avgFirstReplyMinutes !== null ? `${ins.avgFirstReplyMinutes}m` : "—"}
                sub="patient message → first reply"
              />
              <StatCard
                icon={<CalendarCheck2 size={14} />}
                label="No-show rate"
                value={ins.noShowPct !== null ? `${ins.noShowPct}%` : "—"}
                sub="of decided appointments"
              />
              <StatCard
                icon={<UserPlus size={14} />}
                label="New patients · 7d"
                value={String(ins.newPatientsLast7d)}
                sub={`${ins.upcomingCount} upcoming appointments`}
              />
            </div>

            {/* Source + service demand */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Where patients come from</CardTitle>
                    <CardDescription>Acquisition sources across all patients</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <BarList items={ins.sourceMix} caption={ins.sourceMix.length ? "" : "No source labels yet — add sources to know what to double down on."} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>What they ask for</CardTitle>
                    <CardDescription>Top service interest in conversations</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <BarList items={ins.serviceDemand} caption={ins.serviceDemand.length ? "" : "No service interest captured yet."} />
                </CardContent>
              </Card>
            </div>

            {/* Funnel */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Booking funnel</CardTitle>
                  <CardDescription>Enquiry → qualified → booked → attended</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Funnel
                  steps={[
                    { label: "Enquiries", count: ins.funnel.enquiries },
                    { label: "Qualified", count: ins.funnel.qualified },
                    { label: "Booked", count: ins.funnel.booked },
                    { label: "Attended", count: ins.funnel.attended },
                  ]}
                />
                <p className="mt-3 text-[10.5px] leading-relaxed text-muted-2">
                  {ins.funnel.enquiries - ins.funnel.qualified > 0 &&
                    `${ins.funnel.enquiries - ins.funnel.qualified} enquiries haven't been qualified yet — reply to them with pricing + availability.`}{" "}
                  {ins.funnel.qualified - ins.funnel.booked > 0 &&
                    `${ins.funnel.qualified - ins.funnel.booked} qualified leads dropped before booking — a concrete slot offer usually closes them.`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Analyst chat */}
          <div className="min-w-0">
            <Card className="flex h-[600px] flex-col xl:sticky xl:top-6 xl:h-[calc(100vh-140px)]">
              <InsightsChatBody className="flex-1 min-h-0" />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-2">
          <span className="flex size-5 items-center justify-center rounded-md bg-primary-soft text-primary">{icon}</span>
          {label}
        </span>
        <p className="mt-2 font-display text-[22px] font-extrabold leading-none tracking-tight">{value}</p>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted">{sub}</p>
      </CardContent>
    </Card>
  )
}

function BarList({ items, caption }: { items: { name: string; count: number }[]; caption?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  if (!items.length) return <p className="py-4 text-center text-[11px] text-muted">{caption}</p>
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.name}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11.5px] font-semibold">{i.name}</span>
            <span className="shrink-0 text-[11px] font-bold text-muted">{i.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, (i.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count))
  return (
    <div className="space-y-2">
      {steps.map((s, idx) => {
        const prev = idx > 0 ? steps[idx - 1].count : s.count
        const conv = prev > 0 ? Math.round((s.count / prev) * 100) : 0
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[11px] font-semibold">{s.label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-surface-2">
              <div
                className={cn("flex h-full items-center rounded-md pl-2 text-[10px] font-bold text-white transition-all", idx === steps.length - 1 ? "bg-success" : "bg-primary")}
                style={{ width: `${Math.max(10, (s.count / max) * 100)}%` }}
              >
                {s.count}
              </div>
            </div>
            <span className="w-14 shrink-0 text-right text-[10px] font-semibold text-muted-2">
              {idx === 0 ? "100%" : `${conv}%`}
            </span>
          </div>
        )
      })}
    </div>
  )
}