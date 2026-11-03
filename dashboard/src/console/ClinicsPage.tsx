import { useEffect, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Skeleton"
import { supabase } from "@/lib/supabase"
import { usePlatformClinics } from "@/console/usePlatform"
import { ClinicStatusBadge, WaStatusBadge } from "@/console/StatusBadges"
import type { Clinic, Plan } from "@/lib/types"

type Row = Clinic & { plan: Pick<Plan, "code" | "name"> | null }

// /console/clinics — the operator's fleet table. The create wizard (Stage 2)
// lands on this page alongside the `create-clinic` Edge Function; the button
// is present but disabled until then so the screen shape is already final.
export default function ClinicsPage() {
  const { clinics, loading, refetch } = usePlatformClinics()
  const [plans, setPlans] = useState<Plan[]>([])

  useEffect(() => {
    void supabase.from("plans").select("*").order("sort_order").then(({ data }) => {
      if (data) setPlans(data as Plan[])
    })
  }, [])

  const planBy = (id: string | null) => plans.find((p) => p.id === id) ?? null

  const rows: Row[] = clinics.map((c) => ({ ...c, plan: planBy(c.plan_id) }))

  const rerender = () => refetch()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight">Clinics</h1>
          <p className="text-[12px] text-muted">{clinics.length} clinic(s) on the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={rerender} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" disabled title="The create-clinic wizard ships with the create-clinic Edge Function (Stage 2)">
            <Plus className="size-3.5" />
            Create clinic
          </Button>
        </div>
      </div>

      <Card>
        {loading && clinics.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="size-6" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <th className="px-4 py-2.5">Clinic</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">WhatsApp</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5">Renews</th>
                  <th className="px-4 py-2.5">Settings v</th>
                  <th className="px-4 py-2.5">Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{c.name}</p>
                      <p className="truncate text-[11px] text-muted max-w-[220px]">{c.address ?? c.phone ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ClinicStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <WaStatusBadge status={c.wa_status} />
                        <span className="text-[11px] text-muted">{c.wa_number ?? "no number"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.plan ? (
                        <span className="font-medium">{c.plan.name}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {c.renews_at ? new Date(c.renews_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted">{c.settings_version}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.onboarded_at ? new Date(c.onboarded_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      No clinics yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}