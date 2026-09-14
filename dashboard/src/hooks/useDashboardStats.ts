import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { AI_DEFAULT_STATS, type DashboardStats } from "@/lib/types"

function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function useDashboardStats(clinicId: string | null) {
  const [stats, setStats] = useState<DashboardStats>({ ...AI_DEFAULT_STATS })
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!clinicId) return
    const today = startOfDay()
    const todayStr = dateStr(today)
    const weekAgo = new Date(today.getTime() - 6 * 24 * 3600 * 1000)

    const [conversationsRes, appointmentsRes, escalationsRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, status, created_at, last_message_at")
        .eq("clinic_id", clinicId),
      supabase
        .from("appointments")
        .select("appointment_date, appointment_time, attendance, conversation_id")
        .eq("clinic_id", clinicId),
      supabase
        .from("escalations")
        .select("id, status")
        .eq("clinic_id", clinicId),
    ])

    const conversations = conversationsRes.data || []
    const appointments = appointmentsRes.data || []
    const escalations = escalationsRes.data || []

    // messages has no clinic_id — scope through this clinic's conversations
    const conversationIds = conversations.map((c) => c.id)
    const messagesRes = conversationIds.length
      ? await supabase
          .from("messages")
          .select("conversation_id, sender, message_type, created_at")
          .in("conversation_id", conversationIds)
      : { data: [] as Array<{ message_type: string; created_at: string }> }
    const messages = messagesRes.data || []

    const todayMessages = messages.filter(
      (m) => m.message_type === "text" && new Date(m.created_at) >= today
    )
    const todayConversations = conversations.filter(
      (c) => new Date(c.created_at) >= today
    )

    // Conversations Franel carried to a completed outcome
    const resolved = conversations.filter((c) =>
      ["booked", "closed", "qualified"].includes(c.status)
    ).length
    const aiResolutionRate = conversations.length
      ? Math.round((resolved / conversations.length) * 100)
      : 0

    const todayAppointments = appointments.filter((a) => a.appointment_date === todayStr)
    const aiBooked = todayAppointments.filter((a) => a.conversation_id).length

    const active = escalations.filter((e) => e.status === "open" || e.status === "in-progress")

    const weekAppointments = appointments.filter(
      (a) => new Date(a.appointment_date + "T00:00:00") >= weekAgo
    )

    setStats({
      messagesToday: todayMessages.length,
      conversationsToday: todayConversations.length,
      aiResolutionRate,
      bookingsToday: todayAppointments.length,
      aiBooked,
      awaitingHuman: active.length,
      openEscalations: active.length,
      qualifiedThisWeek: conversations.filter(
        (c) =>
          new Date(c.created_at) >= weekAgo &&
          ["qualified", "booked", "closed"].includes(c.status)
      ).length,
      attendedThisWeek: weekAppointments.filter((a) => a.attendance === "attended").length,
      noShowsThisWeek: weekAppointments.filter((a) => a.attendance === "no-show").length,
    })
    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    if (!clinicId) return
    setLoading(true)
    fetchStats()

    const channel = supabase
      .channel("stats-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, fetchStats)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, fetchStats)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, fetchStats)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, fetchStats])

  return { stats, loading, refetch: fetchStats }
}