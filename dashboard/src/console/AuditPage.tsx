import { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Spinner } from "@/components/ui/Skeleton"
import { supabase } from "@/lib/supabase"
import { usePlatformClinics } from "@/console/usePlatform"
import type { AuditLogEntry } from "@/lib/types"

const PAGE = 200

// /console/audit — the append-only trail of operator actions (peek, suspend,
// plan changes…). Read-only; filters run client-side over the newest 200
// entries, which at current scale is everything that matters.
export default function AuditPage() {
  const { clinics } = usePlatformClinics()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [clinicFilter, setClinicFilter] = useState("all")
  const [actorFilter, setActorFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("")

  useEffect(() => {
    void supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (data) setEntries(data as AuditLogEntry[])
        setLoading(false)
      })
  }, [])

  const nameBy = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of clinics) m[c.id] = c.name
    return m
  }, [clinics])

  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries]
  )

  const rows = entries.filter((e) => {
    if (clinicFilter !== "all" && e.clinic_id !== clinicFilter) return false
    if (actorFilter && !e.actor_email.toLowerCase().includes(actorFilter.toLowerCase())) return false
    if (actionFilter && e.action !== actionFilter) return false
    return true
  })

  const refresh = () => {
    setLoading(true)
    void supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (data) setEntries(data as AuditLogEntry[])
        setLoading(false)
      })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight">Audit log</h1>
          <p className="text-[12px] text-muted">
            Newest {PAGE} entries. Opening a conversation, suspending a clinic, or changing a plan are all recorded here.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} className="w-[180px]">
          <option value="all">All clinics</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="w-[170px]">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Filter by actor email…"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="w-[200px]"
        />
      </div>

      <Card>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="size-6" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Clinic</th>
                  <th className="px-4 py-2.5">Target</th>
                  <th className="px-4 py-2.5">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 align-top last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{e.actor_email}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{e.action}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{nameBy[e.clinic_id] ?? e.clinic_id}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {e.target_type ? (
                        <>
                          {e.target_type} {e.target_id ? `· ${String(e.target_id).slice(0, 8)}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {e.detail && Object.keys(e.detail).length > 0 ? (
                        <span className="font-mono text-[10.5px]">{JSON.stringify(e.detail)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      No audit entries match.
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