import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Phone, Mail, StickyNote, CalendarCheck, MessageCircle, Siren, Pencil, Check, X } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { usePatients } from "@/hooks/useData"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Avatar } from "@/components/ui/Avatar"
import { Skeleton } from "@/components/ui/Skeleton"
import { Textarea } from "@/components/ui/Input"
import { useToast } from "@/components/ui/Toast"
import { StatusBadge, SourceBadge, AppointmentStatusBadge, TierBadge, EscalationStatusBadge } from "@/components/ui/status-badges"
import { updatePatient } from "@/lib/actions"
import { fullDateLabel, dateLabel, timeAgo } from "@/lib/format"

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { clinicId, conversations, appointments, escalations } = useLayoutData()
  const { patients, loading, refetch } = usePatients(clinicId)
  const { toast } = useToast()

  const patient = patients.find((p) => p.id === id) ?? null
  const convs = useMemo(() => conversations.filter((c) => c.patient_id === id), [conversations, id])
  const appts = useMemo(
    () =>
      appointments
        .filter((a) => a.patient_id === id)
        .sort((a, b) => (a.appointment_date + a.appointment_time).localeCompare(b.appointment_date + b.appointment_time)),
    [appointments, id]
  )
  const escs = useMemo(() => escalations.filter((e) => e.conversation?.patient_id === id), [escalations, id])

  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [saving, setSaving] = useState(false)

  function startEdit() {
    if (!patient) return
    setNotesDraft(patient.notes ?? "")
    setEditingNotes(true)
  }

  async function saveNotes() {
    if (!patient) return
    setSaving(true)
    const res = await updatePatient(patient.id, { notes: notesDraft.trim() || null })
    setSaving(false)
    if (res.error) toast("Notes failed to save", { description: res.error, variant: "danger" })
    else {
      toast("Patient notes saved")
      setEditingNotes(false)
      refetch()
    }
  }

  if (!patient) {
    if (loading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      )
    }
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <p className="font-display text-sm font-bold">Patient not found</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/patients")}>Back to patients</Button>
        </CardContent>
      </Card>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcomingAppts = appts.filter((a) => a.appointment_date >= today && (a.status === "confirmed" || a.status === "pending"))
  const historyAppts = appts.filter((a) => a.appointment_date < today || a.attendance !== "pending")

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate("/patients")}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> All patients
      </button>

      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3.5">
              <Avatar name={patient.name} size="xl" online={convs.some((c) => c.status !== "closed")} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-extrabold tracking-tight">{patient.name}</h2>
                  <SourceBadge source={patient.source} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-2">Patient since {fullDateLabel(patient.created_at)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  <a href={`tel:${patient.phone}`} className="flex items-center gap-1.5 text-foreground hover:text-primary">
                    <Phone size={12} className="text-muted-2" /> {patient.phone}
                  </a>
                  {patient.email && (
                    <a href={`mailto:${patient.email}`} className="flex items-center gap-1.5 text-foreground hover:text-primary">
                      <Mail size={12} className="text-muted-2" /> {patient.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-2 text-center">
              <div className="rounded-card bg-surface-2/70 px-3 py-2">
                <p className="font-display text-lg font-extrabold">{convs.length}</p>
                <p className="text-[10px] font-semibold text-muted-2">Chats</p>
              </div>
              <div className="rounded-card bg-surface-2/70 px-3 py-2">
                <p className="font-display text-lg font-extrabold">{upcomingAppts.length}</p>
                <p className="text-[10px] font-semibold text-muted-2">Upcoming</p>
              </div>
              <div className="rounded-card bg-surface-2/70 px-3 py-2">
                <p className="font-display text-lg font-extrabold">{escs.length}</p>
                <p className="text-[10px] font-semibold text-muted-2">Escalations</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Conversations */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>Every WhatsApp thread with this patient</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {convs.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted-2">No conversations yet.</p>
            ) : (
              convs
                .slice()
                .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/conversations/${c.id}`)}
                    className="flex w-full items-center gap-3 rounded-card border border-border p-2.5 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <MessageCircle size={15} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{c.service_interest ?? c.intent ?? "General"}</span>
                      <span className="block truncate text-[10.5px] text-muted-2">{c.last_message_preview}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={c.status} />
                      <span className="text-[10px] text-muted-2">{timeAgo(c.last_message_at)}</span>
                    </span>
                  </button>
                ))
            )}
          </CardContent>
        </Card>

        {/* Appointments */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Appointments</CardTitle>
              <CardDescription>Upcoming first, then visit history</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {appts.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted-2">No appointments booked yet.</p>
            ) : (
              <>
                {upcomingAppts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-card border border-border p-2.5">
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1">
                      <span className="text-[9px] font-bold uppercase text-muted">{dateLabel(a.appointment_date)}</span>
                      <span className="text-[11px] font-extrabold">{a.appointment_time.slice(0, 5)}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{a.service}</span>
                    <AppointmentStatusBadge status={a.status} />
                  </div>
                ))}
                {historyAppts.length > 0 && (
                  <p className="pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">History</p>
                )}
                {historyAppts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-card bg-surface-2/40 p-2.5">
                    <span className="flex w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[9px] font-bold text-muted">
                      {dateLabel(a.appointment_date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">{a.service}</span>
                    {a.attendance !== "pending" ? (
                      <span className="text-[10px] font-semibold text-muted-2">{a.attendance === "no-show" ? "No-show" : a.attendance}</span>
                    ) : (
                      <AppointmentStatusBadge status={a.status} />
                    )}
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Escalations */}
      {escs.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Escalation history</CardTitle>
              <CardDescription>Sensitive or urgent moments in this patient's journey</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {escs.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-card border border-border p-2.5">
                <Siren size={13} className="text-danger" />
                <TierBadge tier={e.tier} />
                <EscalationStatusBadge status={e.status} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{e.description ?? "—"}</span>
                <button
                  className="text-[10.5px] font-semibold text-primary hover:underline"
                  onClick={() => navigate(`/conversations/${e.conversation_id}`)}
                >
                  View chat
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Clinical & care notes</CardTitle>
            <CardDescription>Visible to your team only — never sent to the patient</CardDescription>
          </div>
          {!editingNotes ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil size={12} /> Edit
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {editingNotes ? (
            <div className="space-y-2.5">
              <Textarea rows={4} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Allergies, preferred time slots, treatment notes…" aria-label="Patient notes" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}><X size={12} /> Cancel</Button>
                <Button size="sm" onClick={saveNotes} disabled={saving}>{saving ? "Saving…" : (<><Check size={12} /> Save notes</>)}</Button>
              </div>
            </div>
          ) : patient.notes ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{patient.notes}</p>
          ) : (
            <button
              className="flex w-full items-center gap-2 rounded-control border border-dashed border-border-strong p-3 text-[11px] text-muted-2 hover:bg-surface-2"
              onClick={startEdit}
            >
              <StickyNote size={13} /> Add notes about {patient.name.split(" ")[0]}…
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}