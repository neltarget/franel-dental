import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Conversation, Message, Appointment, Escalation, Patient, ClinicConfig, Staff, FollowUp } from "@/lib/types"
import {
  demoAppointments,
  demoClinic,
  demoConfig,
  demoConversations,
  demoConversation,
  demoEscalations,
  demoFollowUps,
  demoPatients,
  demoStaffByAuthUser,
  demoStaffList,
  isDemoClinic,
  useDemo,
} from "@/lib/demo/store"

// In demo mode the data lives in the in-memory store (see lib/demo). The
// hook's demo branch re-derives from it on every store change, so any
// manual refetch must be a no-op here — firing the real Supabase query
// would race and overwrite the seeded demo rows with empty results.
function makeDemoSafeRefetch(
  fetcher: () => Promise<void>,
  demo: ReturnType<typeof useDemo>,
  clinicId: string | null
): () => Promise<void> {
  return async () => {
    if (demo && isDemoClinic(clinicId)) return
    await fetcher()
  }
}

export function useConversations(clinicId: string | null) {
  const demo = useDemo()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    if (!clinicId) return
    const { data, error: err } = await supabase
      .from("conversations")
      .select(`
        *,
        patient:patients(id, name, phone, email, source, notes, created_at),
        messages:messages(*, staff:staff(id, name)),
        follow_ups(*, patient:patients(id, name))
      `)
      .eq("clinic_id", clinicId)
      .order("last_message_at", { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      const dataWithTypedFollowUps = (data || []).map((c) => ({
        ...c,
        follow_ups: ((c as unknown as { follow_ups?: FollowUp[] | null }).follow_ups ?? []) as FollowUp[],
      })) as Conversation[]
      setConversations(dataWithTypedFollowUps)
    }
    setError(null)
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setConversations(demoConversations(demo.rows))
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    fetchConversations()

    const channel = supabase
      .channel("conversation-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, fetchConversations)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, fetchConversations)
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, fetchConversations)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchConversations, demo])

  return { conversations, loading, error, refetch: makeDemoSafeRefetch(fetchConversations, demo, clinicId) }
}

export function useConversation(clinicId: string | null, conversationId: string | null) {
  const demo = useDemo()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConversation = useCallback(async () => {
    if (!clinicId || !conversationId) return
    const { data, error: err } = await supabase
      .from("conversations")
      .select(`
        *,
        patient:patients(*),
        messages:messages(*, staff:staff(id, name)),
        appointments(*),
        escalations(*),
        follow_ups(*, patient:patients(id, name))
      `)
      .eq("id", conversationId)
      .eq("clinic_id", clinicId)
      .single()

    if (err) {
      setError(err.message)
      setConversation(null)
    } else {
      const conv = data as Conversation & { appointments?: Appointment[] | null }
      if (conv?.appointments) {
        const first = Array.isArray(conv.appointments) ? conv.appointments[0] : conv.appointments
        conv.appointment = first || null
      }
      setConversation(conv)
    }
    setLoading(false)
  }, [clinicId, conversationId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setConversation(conversationId ? demoConversation(demo.rows, conversationId) : null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setConversation(null)
    fetchConversation()

    const channel = supabase
      .channel("single-conversation")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, fetchConversation)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` }, fetchConversation)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchConversation)
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, fetchConversation)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, conversationId, fetchConversation, demo])

  return { conversation, loading, error, refetch: makeDemoSafeRefetch(fetchConversation, demo, clinicId) }
}

export function useAppointments(clinicId: string | null) {
  const demo = useDemo()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAppointments = useCallback(async () => {
    if (!clinicId) return
    const { data, error: err } = await supabase
      .from("appointments")
      .select("*, patient:patients(id, name, phone, email, source, notes, created_at), conversation:conversations(id, status, patient_id)")
      .eq("clinic_id", clinicId)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setAppointments(data || [])
    }
    setError(null)
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setAppointments(demoAppointments(demo.rows))
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    fetchAppointments()

    const channel = supabase
      .channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchAppointments)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchAppointments, demo])

  return { appointments, loading, error, refetch: makeDemoSafeRefetch(fetchAppointments, demo, clinicId) }
}

export function usePatients(clinicId: string | null) {
  const demo = useDemo()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPatients = useCallback(async () => {
    if (!clinicId) return
    const { data, error: err } = await supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setPatients(data || [])
    }
    setError(null)
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setPatients(demoPatients(demo.rows))
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    fetchPatients()

    const channel = supabase
      .channel("patients-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, fetchPatients)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchPatients, demo])

  return { patients, loading, error, refetch: makeDemoSafeRefetch(fetchPatients, demo, clinicId) }
}

export function useEscalations(clinicId: string | null, status: "active" | "all" = "active") {
  const demo = useDemo()
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEscalations = useCallback(async () => {
    if (!clinicId) return
    let query = supabase
      .from("escalations")
      .select("*, conversation:conversations(*, patient:patients(id, name, phone, email, source, notes, created_at))")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
    if (status === "active") {
      query = query.in("status", ["open", "in-progress"])
    }
    const { data, error: err } = await query

    if (err) {
      setError(err.message)
    } else {
      setEscalations(data || [])
    }
    setError(null)
    setLoading(false)
  }, [clinicId, status])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setEscalations(demoEscalations(demo.rows, status))
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    fetchEscalations()

    const channel = supabase
      .channel("escalation-list-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, fetchEscalations)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, fetchEscalations)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchEscalations, status, demo])

  return { escalations, loading, error, refetch: makeDemoSafeRefetch(fetchEscalations, demo, clinicId) }
}

export function useFollowUps(clinicId: string | null) {
  const demo = useDemo()
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFollowUps = useCallback(async () => {
    if (!clinicId) return
    const { data } = await supabase
      .from("follow_ups")
      .select("*, patient:patients(id, name), conversation:conversations(*, patient:patients(id, name))")
      .eq("clinic_id", clinicId)
      .order("scheduled_at", { ascending: true })

    setFollowUps((data as unknown as FollowUp[]) || [])
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setFollowUps(demoFollowUps(demo.rows))
      setLoading(false)
      return
    }
    setLoading(true)
    fetchFollowUps()

    const channel = supabase
      .channel("follow-ups-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, fetchFollowUps)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchFollowUps, demo])

  return { followUps, loading, refetch: makeDemoSafeRefetch(fetchFollowUps, demo, clinicId) }
}

export function useClinic(clinicId: string | null) {
  const demo = useDemo()
  const [clinic, setClinic] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClinic = useCallback(async () => {
    if (!clinicId) return
    const { data, error: err } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", clinicId)
      .single()

    if (err) setError(err.message)
    else setClinic(data)
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setClinic(demoClinic(demo.rows))
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    fetchClinic()
  }, [clinicId, fetchClinic, demo])

  return { clinic, loading, error, refetch: makeDemoSafeRefetch(fetchClinic, demo, clinicId) }
}

export function useClinicConfig(clinicId: string | null) {
  const demo = useDemo()
  const [config, setConfig] = useState<ClinicConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    if (!clinicId) return
    const { data, error: err } = await supabase
      .from("clinic_config")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle()

    if (err) setError(err.message)
    else setConfig(data)
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setConfig(demoConfig(demo.rows))
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    fetchConfig()

    const channel = supabase
      .channel("clinic-config-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_config" }, fetchConfig)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchConfig, demo])

  return { config, loading, error, refetch: makeDemoSafeRefetch(fetchConfig, demo, clinicId) }
}

export function useStaffClinicId(userId: string | null) {
  const demo = useDemo()
  const [result, setResult] = useState<{ clinicId: string | null; staff: Staff | null }>({
    clinicId: null,
    staff: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (demo) {
      if (!userId) {
        setResult({ clinicId: null, staff: null })
        setLoading(false)
        return
      }
      const staff = demoStaffByAuthUser(demo.rows, userId)
      setResult(staff ? { clinicId: staff.clinic_id, staff: staff } : { clinicId: null, staff: null })
      setLoading(false)
      return
    }

    if (!userId) {
      setLoading(false)
      return
    }

    const fetchStaff = async () => {
      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("auth_user_id", userId)
        .eq("is_active", true)
        .single()

      if (data) {
        setResult({ clinicId: data.clinic_id, staff: data })
      } else {
        setResult({ clinicId: null, staff: null })
      }
      setLoading(false)
    }

    fetchStaff()
  }, [userId, demo])

  return { clinicId: result.clinicId, staff: result.staff, loading }
}

export function useStaffList(clinicId: string | null) {
  const demo = useDemo()
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStaffList = useCallback(async () => {
    if (!clinicId) {
      setStaffList([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from("staff")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
    setStaffList((data as Staff[]) || [])
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (demo && isDemoClinic(clinicId)) {
      setStaffList(demoStaffList(demo.rows))
      setLoading(false)
      return
    }
    setLoading(true)
    fetchStaffList()

    const channel = supabase
      .channel("staff-list-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, fetchStaffList)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchStaffList, demo])

  return { staffList, loading, refetch: makeDemoSafeRefetch(fetchStaffList, demo, clinicId) }
}

export function useMessagesByConversation(conversationIds: string[]) {
  const demo = useDemo()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  const key = [...conversationIds].sort().join(",")

  useEffect(() => {
    if (!conversationIds.length) {
      setLoading(false)
      return
    }
    if (demo) {
      const wanted = new Set(conversationIds)
      const rows: Message[] = demo.rows.messages
        .filter((m) => wanted.has(m.conversation_id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => {
          const s = demo.rows.staff.find((st) => st.id === m.staff_id)
          return { ...m, staff: s ? { id: s.id, name: s.name } : null }
        })
      setMessages(rows)
      setLoading(false)
      return
    }
    let cancelled = false
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })

      if (!cancelled) {
        setMessages(data || [])
        setLoading(false)
      }
    }
    fetchMessages()
    return () => {
      cancelled = true
    }
  }, [key, demo]) // eslint-disable-line react-hooks/exhaustive-deps

  return { messages, loading }
}