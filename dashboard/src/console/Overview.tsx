import { useMemo } from "react"
import { AlertTriangle, Radio, RefreshCw, Users, MessageCircle, CalendarDays, Siren } from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Skeleton"
import { usePlatformClinics, useClinicPulses } from "@/console/usePlatform"
import { ClinicStatusBadge, WaStatusBadge } from "@/console/StatusBadges"
import type { Clinic } from "@/lib/types"

const STALE_HB_MS = 120 * 1000

function ageHuman(iso: string | null | undefined): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return "just now"
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h ago`
  return `${(ms / 86_400_000).toFixed(1)}d ago`
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-9 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="size-4.5" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-muted">{label}</p>
          <p className="font-display text-lg font-bold leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Overview() {
  const { clinics, loading: clinicsLoading, refetch: refetchClinics } = usePlatformClinics()
  const { pulses, loading: pulsesLoading } = useClinicPulses()

  const loading = clinicsLoading || pulsesLoading

  const alerts = useMemo(() => {
    const out: { tone: "danger" | "warning"; text: string }[] = []
    for (const c of clinics) {
      if (c.status === "suspended") continue
      if (c.wa_status === "error") {
        out.push({ tone: "danger", text: `WhatsApp onboarding failed for ${c.name} — open the clinic to retry.` })
      }
      const hbIso = pulses.heartbeats[c.id] ?? null
      const hb = hbIso ? Date.now() - new Date(hbIso).getTime() : null
      if (c.status === "active" && (hb === null || hb > STALE_HB_MS)) {
        out.push({
          tone: "warning",
          text: `Ops worker heartbeat stale for ${c.name} (${ageHuman(hbIso)}).`,
        })
      }
    }
    if (pulses.deadLetters24h > 0) {
      out.push({
        tone: "danger",
        text: `${pulses.deadLetters24h} outbound message(s) dead-lettered in the last 24 h (outbox gave up).`,
      })
    }
    return out
  }, [clinics, pulses.heartbeats, pulses.deadLetters24h])

  const refresh = () => {
    refetchClinics()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight">Platform overview</h1>
          <p className="text-[12px] text-muted">All clinics, live from Supabase. Refreshes every 30 s.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && clinics.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : (
        <>
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2.5 rounded-card border px-3.5 py-2.5 text-[12.5px] ${
                    a.tone === "danger"
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : "border-warning/30 bg-warning-soft text-warning"
                  }`}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {a.text}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Users} label="Patients (all clinics)" value={pulses.totalPatients} tone="bg-violet-soft text-violet" />
            <Kpi icon={MessageCircle} label="Messages · 24 h" value={pulses.msgs24h} tone="bg-info-soft text-info" />
            <Kpi icon={CalendarDays} label="Appointments · 7 d" value={pulses.appointmentsWeek} tone="bg-success-soft text-success" />
            <Kpi icon={Siren} label="Escalations · 7 d" value={pulses.escalationsWeek} tone="bg-danger-soft text-danger" />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">Clinics</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {clinics.map((c) => (
                <ClinicTile key={c.id} clinic={c} msgs24h={pulses.msgs24hByClinic[c.id] ?? 0} heartbeat={pulses.heartbeats[c.id] ?? null} />
              ))}
              {clinics.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-[12.5px] text-muted">
                    No clinics yet. Create the first one from <span className="font-semibold">Clinics</span>.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ClinicTile({ clinic, msgs24h, heartbeat }: { clinic: Clinic; msgs24h: number; heartbeat: string | null }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-[13.5px] font-bold tracking-tight">{clinic.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {clinic.wa_number ?? "no WA number"}
              {heartbeat && (
                <span className="inline-flex items-center gap-1">
                  {" · "}
                  <Radio className="size-3" />
                  {ageHuman(heartbeat)}
                </span>
              )}
            </p>
          </div>
          <ClinicStatusBadge status={clinic.status} />
        </div>
        <div className="flex items-center justify-between">
          <WaStatusBadge status={clinic.wa_status} />
          <p className="text-[11.5px] font-semibold">
            {msgs24h} <span className="font-normal text-muted">msgs · 24 h</span>
          </p>
        </div>
        {clinic.wa_display_name && (
          <p className="text-[10.5px] text-muted">
            WA name: <span className="font-medium text-foreground/80">{clinic.wa_display_name}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}