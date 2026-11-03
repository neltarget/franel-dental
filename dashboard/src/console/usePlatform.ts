import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Clinic } from "@/lib/types"

// Platform-wide live data. Clinic-scoped hooks in useData.ts are the wrong
// tool here: a platform operator must see EVERY clinic (RLS grants it), so
// these hooks query without a clinic_id filter.

const REFRESH_MS = 30_000

export interface ClinicPulse {
  msgs24h: number
  msgs24hByClinic: Record<string, number>
  heartbeats: Record<string, string | null>
  escalationsWeek: number
  appointmentsWeek: number
  totalPatients: number
  deadLetters24h: number
}

export function usePlatformClinics() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("clinics")
      .select("*")
      .order("name", { ascending: true })
    if (err) setError(err.message)
    else setClinics((data as Clinic[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const t = setInterval(refetch, REFRESH_MS)
    return () => clearInterval(t)
  }, [refetch])

  return { clinics, loading, error, refetch }
}

export function useClinicPulses() {
  const [pulses, setPulses] = useState<ClinicPulse>({
    msgs24h: 0,
    msgs24hByClinic: {},
    heartbeats: {},
    escalationsWeek: 0,
    appointmentsWeek: 0,
    totalPatients: 0,
    deadLetters24h: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const h24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const week = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const [msgs, esc, appts, pats, dead, cfgs] = await Promise.all([
      supabase.from("messages").select("id, conversation:conversations(clinic_id)").gte("created_at", h24),
      supabase.from("escalations").select("id", { count: "exact", head: true }).gte("created_at", week),
      supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", week),
      supabase.from("patients").select("id", { count: "exact", head: true }),
      supabase
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("ref_type", "dead_letter")
        .gte("created_at", h24),
      supabase.from("clinic_config").select("clinic_id, ops_heartbeat_at"),
    ])

    if (msgs.error) setError(msgs.error.message)
    else {
      const byClinic: Record<string, number> = {}
      for (const row of msgs.data ?? []) {
        const conv = (row as unknown as { conversation?: { clinic_id: string } | { clinic_id: string }[] })
          .conversation
        const cid = Array.isArray(conv) ? conv[0]?.clinic_id : conv?.clinic_id
        if (cid) byClinic[cid] = (byClinic[cid] ?? 0) + 1
      }
      const heartbeats: Record<string, string | null> = {}
      for (const c of cfgs.data ?? []) {
        const row = c as { clinic_id: string; ops_heartbeat_at: string | null }
        heartbeats[row.clinic_id] = row.ops_heartbeat_at
      }
      setPulses((p) => ({ ...p, msgs24hByClinic: byClinic, heartbeats, msgs24h: (msgs.data ?? []).length }))
    }
    setPulses((p) => ({
      ...p,
      escalationsWeek: esc.count ?? 0,
      appointmentsWeek: appts.count ?? 0,
      totalPatients: pats.count ?? 0,
      deadLetters24h: dead.count ?? 0,
    }))
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const t = setInterval(refetch, REFRESH_MS)
    return () => clearInterval(t)
  }, [refetch])

  return { pulses, loading, error, refetch }
}