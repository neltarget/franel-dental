import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Send,
  Siren,
  ShieldCheck,
  Play,
  CheckCircle2,
  Phone,
  Mail,
  Calendar,
  X,
  Sparkles,
  UserRound,
  StickyNote,
} from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { useConversation } from "@/hooks/useData"
import { useToast } from "@/components/ui/Toast"
import { updateConversationStatus, sendStaffMessage, createEscalation, setEscalationStatus, updatePatient } from "@/lib/actions"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Avatar } from "@/components/ui/Avatar"
import { Input, Textarea, Field } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Spinner, Skeleton } from "@/components/ui/Skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { StatusBadge, LeadBadge, TierBadge, EscalationStatusBadge, AppointmentStatusBadge, FollowUpTypeBadge, SourceBadge } from "@/components/ui/status-badges"
import { timeShort, timeAgoFull, fullDateLabel, dateLabel, appointmentDateTimeLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ConversationStatus, EscalationTier, Message } from "@/lib/types"

const SYSTEM_EVENT_LABELS: Record<string, string> = {
  lead_qualified: "Lead qualified by Franel",
  appointment_booked: "Appointment confirmed by Franel",
  appointment_reminder: "Appointment reminder sent",
  post_visit_checkin: "Post-visit check-in sent",
  follow_up_sent: "Follow-up sent by Franel",
  escalation_created: "Escalated to a human",
  escalation_resolved: "Escalation resolved",
  no_show_flagged: "No-show flagged — recovery flow started",
  conversation_closed: "Conversation closed",
}

function MessageRow({ msg }: { msg: Message }) {
  if (msg.message_type === "system") {
    return (
      <div className="my-1 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-muted">
          <Sparkles size={10} className="text-primary" />
          {SYSTEM_EVENT_LABELS[String(msg.metadata?.event ?? "")] ?? "System event"}
          <span className="text-muted-2">· {timeShort(msg.created_at)}</span>
        </span>
      </div>
    )
  }

  const isPatient = msg.sender === "patient"
  const isStaff = msg.sender === "staff"

  if (isPatient) {
    return (
      <div className="flex items-end gap-2">
        <Avatar name="Patient" size="sm" className="mb-0.5" />
        <div className="max-w-[78%] rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 shadow-sm">
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{msg.content}</p>
          <p className="mt-0.5 text-right text-[9.5px] text-muted-2">{timeShort(msg.created_at)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end">
      <span className="mb-0.5 flex items-center gap-1 text-[9.5px] font-semibold text-muted-2">
        {isStaff ? <UserRound size={10} /> : <Sparkles size={10} className="text-primary" />}
        {isStaff ? `${msg.staff?.name ?? "Staff"} · You` : "Franel AI"}
      </span>
      <div className={cn("max-w-[78%] rounded-2xl rounded-br-md px-3 py-2 shadow-sm", isStaff ? "bg-accent text-white" : "bg-primary text-white")}>
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{msg.content}</p>
        <p className={cn("mt-0.5 text-right text-[9.5px]", isStaff ? "text-white/70" : "text-white/60")}>{timeShort(msg.created_at)}</p>
      </div>
    </div>
  )
}

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { clinicId, staff, appointments } = useLayoutData()
  const { conversation, loading, error, refetch } = useConversation(clinicId, id ?? null)
  const { toast } = useToast()

  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [escalateTier, setEscalateTier] = useState<EscalationTier>(2)
  const [escalateDesc, setEscalateDesc] = useState("")
  const [escalating, setEscalating] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)

  const chatEnd = useRef<HTMLDivElement>(null)
  const messageCount = conversation?.messages?.length ?? 0

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messageCount])

  useEffect(() => {
    if (conversation?.patient?.notes) setNotesDraft(conversation.patient.notes)
  }, [conversation?.patient?.notes, editingNotes])

  const appointment = conversation?.appointment ?? appointments.find((a) => a.conversation_id === id)

  async function handleSend() {
    const text = reply.trim()
    if (!text || !id) return
    setSending(true)
    const res = await sendStaffMessage(id, text, staff?.id ?? null)
    setSending(false)
    if (res.error) toast("Message failed", { description: res.error, variant: "danger" })
    else {
      setReply("")
      toast("Reply sent to WhatsApp")
    }
    refetch()
  }

  async function handleEscalate() {
    if (!id) return
    setEscalating(true)
    const created = await createEscalation(id, clinicId, escalateTier, escalateDesc.trim() || `Manual escalation (Tier ${escalateTier})`)
    if (created.error) {
      toast("Escalation failed", { description: created.error, variant: "danger" })
      setEscalating(false)
      return
    }
    await updateConversationStatus(id, "escalated")
    setEscalating(false)
    setEscalateOpen(false)
    setEscalateDesc("")
    toast(`Escalated to Tier ${escalateTier} team`, { variant: "success" })
    refetch()
  }

  async function handleStatusChange(status: ConversationStatus) {
    if (!id) return
    const res = await updateConversationStatus(id, status)
    if (res.error) toast("Status update failed", { description: res.error, variant: "danger" })
    else toast(`Conversation marked ${status}`)
    refetch()
  }

  async function handleEscalationAction(escalationId: string, action: "in-progress" | "resolved") {
    const res = await setEscalationStatus(escalationId, action)
    if (res.error) toast("Update failed", { description: res.error, variant: "danger" })
    else toast(action === "resolved" ? "Escalation resolved" : "Marked in progress")
    refetch()
  }

  async function handleSaveNotes() {
    const patientId = conversation?.patient_id
    if (!patientId) return
    setSavingNotes(true)
    const res = await updatePatient(patientId, { notes: notesDraft.trim() || null })
    setSavingNotes(false)
    if (res.error) toast("Notes failed to save", { description: res.error, variant: "danger" })
    else toast("Patient notes saved")
    refetch()
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-[calc(100vh-120px)] min-h-[420px]" />
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    )
  }

  if (error || !conversation) {
    return (
      <EmptyState
        icon={<X size={18} />}
        title="Conversation not found"
        description={error ?? "It may have been deleted."}
        actionLabel="Back to messages"
        onAction={() => navigate("/conversations")}
      />
    )
  }

  const patient = conversation.patient
  const openEscalation = (conversation.escalations ?? []).find((e) => e.status !== "resolved")
  const statusOptions: Array<{ value: ConversationStatus; label: string }> = [
    { value: "new", label: "New" },
    { value: "qualified", label: "Qualified" },
    { value: "booked", label: "Booked" },
    { value: "escalated", label: "Escalated" },
    { value: "closed", label: "Closed" },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      {/* Chat pane */}
      <Card className="flex min-h-[calc(100dvh-140px)] flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <button
            onClick={() => navigate("/conversations")}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground"
          >
            <ArrowLeft size={14} /> Messages
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={patient?.name} size="sm" online />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">{patient?.name ?? "Unknown patient"}</p>
              <p className="truncate text-[10.5px] text-muted-2">{patient?.phone}</p>
            </div>
            <StatusBadge status={conversation.status} />
          </div>
          {!openEscalation && conversation.status !== "closed" && (
            <Button variant="outline" size="sm" onClick={() => setEscalateOpen(true)}>
              <Siren size={12} />
              Escalate
            </Button>
          )}
        </div>

        {openEscalation && (
          <div className="flex items-center gap-2.5 border-b border-danger/20 bg-danger-soft/60 px-4 py-2.5">
            <Siren size={14} className="shrink-0 text-danger" />
            <p className="flex-1 text-[11px] font-medium text-danger">
              {`Tier ${openEscalation.tier} escalation ${openEscalation.status} — ${openEscalation.description ?? "no description"}`}
            </p>
            <Button variant="secondary" size="sm" onClick={() => handleEscalationAction(openEscalation.id, "resolved")}>
              <ShieldCheck size={12} /> Resolve
            </Button>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2/40 p-4">
          {(conversation.messages ?? []).map((m) => (
            <MessageRow key={m.id} msg={m} />
          ))}
          <div ref={chatEnd} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                openEscalation
                  ? "Reply as staff — patient sees your name on WhatsApp…"
                  : "Type a reply… (Enter to send)"
              }
              rows={2}
              aria-label="Reply message"
            />
            <Button onClick={handleSend} disabled={!reply.trim() || sending} className="h-11 shrink-0">
              {sending ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : <Send size={14} />}
              Reply
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-2">
            Replies are delivered to {patient?.phone} via your clinic WhatsApp number.
          </p>
        </div>
      </Card>

      {/* Detail pane */}
      <div className="space-y-4">
        {/* Patient */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Avatar name={patient?.name} size="lg" online />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-sm font-bold">{patient?.name ?? "Unknown patient"}</p>
                <p className="text-[11px] text-muted-2">Patient since {patient ? fullDateLabel(patient.created_at) : "—"}</p>
              </div>
              <SourceBadge source={patient?.source} />
            </div>
            <div className="mt-3 space-y-1.5 text-[11px]">
              <a href={`tel:${patient?.phone ?? ""}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                <Phone size={12} className="text-muted-2" /> {patient?.phone ?? "—"}
              </a>
              {patient?.email && (
                <a href={`mailto:${patient.email}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Mail size={12} className="text-muted-2" /> {patient.email}
                </a>
              )}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} placeholder="Internal notes about this patient…" aria-label="Patient notes" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                      {savingNotes ? "Saving…" : "Save notes"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex w-full items-start gap-2 rounded-control bg-surface-2/60 p-2.5 text-left text-[11px] leading-relaxed text-muted hover:bg-surface-2"
                  onClick={() => setEditingNotes(true)}
                >
                  <StickyNote size={13} className="mt-px shrink-0 text-muted-2" />
                  {patient?.notes ? patient.notes : "Add internal notes about this patient…"}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Conversation */}
        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Status">
              <Select value={conversation.status} onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)} aria-label="Conversation status">
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold">Lead level</span>
                <div className="flex items-center gap-2">
                  <LeadBadge level={conversation.lead_level} />
                  <span className="text-[10px] text-muted-2">Set automatically by Franel</span>
                </div>
              </div>
            </div>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-2">Intent</dt>
                <dd className="font-medium capitalize">{conversation.intent ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-2">Service interest</dt>
                <dd className="truncate font-medium">{conversation.service_interest ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-2">Started</dt>
                <dd className="font-medium">{fullDateLabel(conversation.created_at)} · {timeShort(conversation.created_at)}</dd>
              </div>
            </dl>
            {conversation.status !== "closed" && (
              <Button variant="danger" size="sm" className="w-full" onClick={() => handleStatusChange("closed")}>
                <CheckCircle2 size={12} /> Close conversation
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Appointment */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment</CardTitle>
            {appointment && <AppointmentStatusBadge status={appointment.status} />}
          </CardHeader>
          <CardContent>
            {appointment ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-control bg-surface-2/60 p-2.5 text-[11px] font-semibold">
                  <Calendar size={13} className="shrink-0 text-primary" />
                  {appointmentDateTimeLabel(appointment)}
                </div>
                <p className="text-[11px] text-muted">{appointment.service}</p>
                <p className="text-[10px] text-muted-2">Booked by Franel from this chat</p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-2">No appointment booked from this conversation yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Escalations */}
        <Card>
          <CardHeader>
            <CardTitle>Escalations</CardTitle>
            <Badge variant="neutral">{(conversation.escalations ?? []).length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {(conversation.escalations ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-2">No escalations for this conversation.</p>
            ) : (
              (conversation.escalations ?? [])
                .slice()
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((esc) => (
                  <div key={esc.id} className="rounded-card border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <TierBadge tier={esc.tier} />
                        <EscalationStatusBadge status={esc.status} />
                      </div>
                      <span className="text-[10px] text-muted-2">{timeAgoFull(esc.created_at)}</span>
                    </div>
                    {esc.description && <p className="mt-1.5 text-[11px] leading-snug text-muted">{esc.description}</p>}
                    {esc.status !== "resolved" && (
                      <div className="mt-2 flex gap-2">
                        {esc.status === "open" && (
                          <Button variant="outline" size="sm" onClick={() => handleEscalationAction(esc.id, "in-progress")}>
                            <Play size={11} /> Start
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleEscalationAction(esc.id, "resolved")}>
                          <ShieldCheck size={11} /> Mark resolved
                        </Button>
                      </div>
                    )}
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader>
            <CardTitle>Automated follow-ups</CardTitle>
            <Badge variant="neutral">{(conversation.follow_ups ?? []).length}</Badge>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(conversation.follow_ups ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-2">No follow-ups scheduled for this conversation yet.</p>
            ) : (
              (conversation.follow_ups ?? [])
                .slice()
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((fu) => (
                  <div key={fu.id} className="flex items-center justify-between gap-2 rounded-control bg-surface-2/50 px-2.5 py-2">
                    <div className="min-w-0">
                      <FollowUpTypeBadge followUp={fu} />
                      <p className="mt-1 text-[10px] text-muted-2">
                        {fu.status === "sent" ? `Sent ${timeAgoFull(fu.sent_at ?? fu.scheduled_at)}` : fu.status === "blocked" ? `Blocked · was due ${dateLabel(fu.scheduled_at)}` : `Scheduled ${dateLabel(fu.scheduled_at)}`}
                      </p>
                    </div>
                    <Badge
                      variant={
                        fu.status === "sent" ? "green" : fu.status === "blocked" ? "gold" : fu.status === "cancelled" ? "neutral" : "blue"
                      }
                    >
                      {fu.status}
                    </Badge>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Escalate modal */}
      <Modal
        open={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        title="Escalate to a human"
        description="Franel pauses on this conversation and flags it to your team."
      >
        <div className="space-y-3">
          <Field label="Severity">
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as EscalationTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setEscalateTier(tier)}
                  className={cn(
                    "rounded-control border p-2.5 text-left transition-colors",
                    escalateTier === tier
                      ? "border-primary bg-primary-soft/60 ring-[var(--shadow-ring)]"
                      : "border-border-strong bg-surface hover:bg-surface-2"
                  )}
                >
                  <p className="text-xs font-bold">{`Tier ${tier}`}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-2">
                    {tier === 1 ? "Emergency — call now" : tier === 2 ? "Urgent — today" : "Operational — within 48h"}
                  </p>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Reason" hint="Optional context for the team">
            <Textarea
              rows={3}
              value={escalateDesc}
              onChange={(e) => setEscalateDesc(e.target.value)}
              placeholder="e.g. patient reports severe pain, needs a dentist's review"
              aria-label="Escalation reason"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEscalateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEscalate} disabled={escalating}>
              {escalating ? "Escalating…" : (
                <>
                  <Siren size={13} /> Escalate conversation
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}