import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarPlus, CheckCircle2, XCircle, Sparkles, MessageSquare, ChevronRight } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Input, Field } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Drawer } from "@/components/ui/Drawer"
import { Skeleton } from "@/components/ui/Skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { useToast } from "@/components/ui/Toast"
import { AppointmentStatusBadge, AttendanceBadge } from "@/components/ui/status-badges"
import { cancelAppointment, createAppointment, markAttendance } from "@/lib/actions"
import { dateLabel, fullDateLabel, isTodayStr } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Appointment } from "@/lib/types"

type Scope = "today" | "upcoming" | "past" | "all"

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
]

export function AppointmentsPage() {
  const { appointments, clinic, loading, refetch, patients } = useLayoutData()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [scope, setScope] = useState<Scope>("upcoming")
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  const filtered = useMemo(() => {
    return appointments
      .filter((a) => {
        if (scope === "today") return a.appointment_date === todayStr
        if (scope === "upcoming") return a.appointment_date >= todayStr && a.status !== "cancelled" && a.status !== "no-show"
        if (scope === "past") return a.appointment_date < todayStr
        return true
      })
      .sort((a, b) => {
        const ka = a.appointment_date + a.appointment_time
        const kb = b.appointment_date + b.appointment_time
        return scope === "past" || scope === "all" ? kb.localeCompare(ka) : ka.localeCompare(kb)
      })
  }, [appointments, scope, todayStr])

  const groups = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const a of filtered) {
      const list = m.get(a.appointment_date) ?? []
      list.push(a)
      m.set(a.appointment_date, list)
    }
    return [...m.entries()]
  }, [filtered])

  async function handleAttendance(a: Appointment, attendance: "attended" | "no-show") {
    setBusy(a.id)
    const res = await markAttendance(a.id, attendance)
    setBusy(null)
    if (res.error) toast("Update failed", { description: res.error, variant: "danger" })
    else toast(attendance === "attended" ? `Marked ${a.patient?.name ?? "patient"} as attended` : "Marked as no-show")
    refetch()
  }

  async function handleCancel() {
    if (!cancelTarget) return
    setCancelBusy(true)
    const res = await cancelAppointment(cancelTarget.id)
    setCancelBusy(false)
    setCancelTarget(null)
    if (res.error) toast("Cancel failed", { description: res.error, variant: "danger" })
    else toast("Appointment cancelled")
    refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                scope === s.key ? "bg-navy text-white shadow-sm" : "border border-border bg-card text-muted hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <CalendarPlus size={14} /> New appointment
        </Button>
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
              icon={<CalendarPlus size={18} className="text-success" />}
              title="No appointments in this view"
              description="Franel books from WhatsApp conversations; you can also add bookings manually."
              actionLabel="New appointment"
              onAction={() => setCreateOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        groups.map(([date, list]) => (
          <Card key={date}>
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="font-display text-xs font-bold">
                {isTodayStr(date) ? "Today" : fullDateLabel(date)}
              </p>
              <Badge variant="neutral">{list.length} booking{list.length === 1 ? "" : "s"}</Badge>
            </div>
            <div className="divide-y divide-border">
              {list.map((a) => {
                const isUpcoming = a.appointment_date >= todayStr && (a.status === "confirmed" || a.status === "pending")
                return (
                  <div key={a.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-3 lg:w-56">
                      <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1.5">
                        <span className="text-[10px] font-bold text-muted">{a.appointment_time.slice(0, 5)}</span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{a.patient?.name ?? "Patient"}</p>
                        <p className="truncate text-[11px] text-muted-2">{a.service}</p>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      {a.conversation_id ? (
                        <Badge variant="teal">
                          <Sparkles size={10} /> Franel
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Manual</Badge>
                      )}
                      <AppointmentStatusBadge status={a.status} />
                      {a.attendance !== "pending" && <AttendanceBadge attendance={a.attendance} />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isUpcoming && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === a.id}
                            onClick={() => handleAttendance(a, "attended")}
                            className="border-success bg-success text-white shadow-sm hover:bg-success/90"
                          >
                            <CheckCircle2 size={12} strokeWidth={2.5} /> Attended
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === a.id}
                            onClick={() => handleAttendance(a, "no-show")}
                            className="border-warning bg-warning text-white shadow-sm hover:bg-warning/90"
                          >
                            <XCircle size={12} strokeWidth={2.5} /> No-show
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setCancelTarget(a)}>
                            Cancel
                          </Button>
                        </>
                      )}
                      {a.conversation_id && (
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/conversations/${a.conversation_id}`)}>
                          <MessageSquare size={12} /> Chat
                          <ChevronRight size={12} />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ))
      )}

      {/* Cancel confirmation */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel this appointment?"
        description={`${cancelTarget?.patient?.name ?? "Patient"} · ${cancelTarget ? dateLabel(cancelTarget.appointment_date) : ""} ${cancelTarget?.appointment_time?.slice(0, 5) ?? ""} · ${cancelTarget?.service ?? ""}`}
      >
        <p className="text-[11px] leading-relaxed text-muted">
          The patient stays in your patient list. You can book a new slot anytime — Franel can also re-engage them via WhatsApp.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCancelTarget(null)}>Keep booking</Button>
          <Button
            variant="danger"
            disabled={cancelBusy}
            onClick={handleCancel}
            className="border-danger bg-danger text-white hover:bg-danger/90"
          >
            {cancelBusy ? "Cancelling…" : "Cancel appointment"}
          </Button>
        </div>
      </Modal>

      <NewAppointmentDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        patients={patients}
        services={(clinic?.services ?? []).map((s) => s.name)}
        defaultDate={todayStr}
      />
    </div>
  )
}

function NewAppointmentDrawer({
  open,
  onClose,
  patients,
  services,
  defaultDate,
}: {
  open: boolean
  onClose: () => void
  patients: Array<{ id: string; name: string }>
  services: string[]
  defaultDate: string
}) {
  const { clinicId, refetch } = useLayoutData()
  const { toast } = useToast()
  const [patientId, setPatientId] = useState("")
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState("10:00")
  const [service, setService] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!patientId || !date || !time || !service) {
      toast("Missing details", { description: "Pick a patient, date, time and service.", variant: "warning" })
      return
    }
    setSaving(true)
    const res = await createAppointment({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_date: date,
      appointment_time: time,
      service,
      status: "confirmed",
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (res.error) toast("Could not save booking", { description: res.error, variant: "danger" })
    else {
      toast("Appointment booked", { description: `${dateLabel(date)} at ${time.slice(0, 5)}` })
      onClose()
      setNotes("")
      refetch()
    }
  }

  return (
    <Drawer open={open} onClose={onClose} width={440} title="New appointment" subtitle="Book a patient directly — no WhatsApp chat needed.">
      <div className="space-y-3.5 p-4">
        <Field label="Patient">
          <Select value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label="Patient">
            <option value="">Select a patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Service">
          <Select value={service} onChange={(e) => setService(e.target.value)} aria-label="Service">
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Internal note" hint="Visible to your team only">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. bring x-rays from last visit" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Booking…" : "Book appointment"}
        </Button>
      </div>
    </Drawer>
  )
}