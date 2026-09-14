import { useEffect, useState } from "react"
import { Building2, Bot, Users, Save } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Avatar } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Input, Textarea, Field } from "@/components/ui/Input"
import { Skeleton } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { updateClinic, upsertClinicConfig } from "@/lib/actions"
import { cn } from "@/lib/utils"
import type { ClinicConfig, Staff } from "@/lib/types"

type Tab = "clinic" | "automation" | "team"

const TABS: Array<{ key: Tab; label: string; icon: typeof Building2 }> = [
  { key: "clinic", label: "Clinic profile", icon: Building2 },
  { key: "automation", label: "AI automation", icon: Bot },
  { key: "team", label: "Team", icon: Users },
]

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

export function SettingsPage() {
  const { clinic, config, staffList: allStaff, loading, refetch } = useLayoutData()
  const [tab, setTab] = useState<Tab>("clinic")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                tab === t.key ? "bg-navy text-white shadow-sm" : "border border-border bg-card text-muted hover:text-foreground"
              )}
            >
              <Icon size={12} /> {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          {tab === "clinic" && <ClinicTab clin={clinic} refetch={refetch} />}
          {tab === "automation" && <AutomationTab config={config} refetch={refetch} />}
          {tab === "team" && <TeamTab staff={allStaff} />}
        </>
      )}
    </div>
  )
}

function ClinicTab({ clin, refetch }: { clin: { id: string; name: string; address?: string | null; phone?: string | null; email?: string | null; hours?: Record<string, string>; services?: Array<{ name: string; description: string }> } | null; refetch: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(clin?.name ?? "")
  const [address, setAddress] = useState(clin?.address ?? "")
  const [phone, setPhone] = useState(clin?.phone ?? "")
  const [email, setEmail] = useState(clin?.email ?? "")
  const [hours, setHours] = useState<Record<string, string>>(
    Object.fromEntries(DAYS.map((d) => [d, clin?.hours?.[d] ?? "09:00 – 17:00"]))
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (clin) {
      setName(clin.name)
      setAddress(clin.address ?? "")
      setPhone(clin.phone ?? "")
      setEmail(clin.email ?? "")
      setHours(Object.fromEntries(DAYS.map((d) => [d, clin.hours?.[d] ?? "09:00 – 17:00"])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clin?.id])

  async function save() {
    if (!clin) return
    setSaving(true)
    const res = await updateClinic(clin.id, {
      name,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      hours,
    })
    setSaving(false)
    if (res.error) toast("Could not save clinic profile", { description: res.error, variant: "danger" })
    else {
      toast("Clinic profile saved")
      refetch()
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Clinic details</CardTitle>
              <CardDescription>Shown to patients in WhatsApp booking confirmations</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Clinic name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone (WhatsApp number)">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 30 000 0000" />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <Field label="Address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb, city" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Opening hours</CardTitle>
              <CardDescription>Franel offers slots inside your working hours and schedules reminders accordingly</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {DAYS.map((d) => (
                <div key={d} className="flex items-center justify-between gap-3 py-2">
                  <span className="w-24 text-xs font-semibold capitalize">{d}</span>
                  <Input
                    value={hours[d] ?? ""}
                    onChange={(e) => setHours((h) => ({ ...h, [d]: e.target.value }))}
                    className="h-8 max-w-[220px] flex-1"
                    placeholder="09:00 – 17:00"
                    aria-label={`${d} hours`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save size={13} /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Service menu</CardTitle>
            <CardDescription>Used when Franel confirms services</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {(clin?.services ?? []).map((s) => (
            <div key={s.name} className="rounded-control bg-surface-2/50 px-3 py-2">
              <p className="text-xs font-semibold">{s.name}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-2">{s.description}</p>
            </div>
          ))}
          {(clin?.services ?? []).length === 0 && <p className="py-4 text-center text-[11px] text-muted-2">No services configured.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function AutomationTab({ config, refetch }: { config: ClinicConfig | null; refetch: () => void }) {
  const { toast } = useToast()
  const [intervals, setIntervals] = useState<number[]>(config?.follow_up_intervals ?? [1, 3, 7])
  const [reminderHours, setReminderHours] = useState<number>(config?.reminder_hours_before ?? 24)
  const [checkinHours, setCheckinHours] = useState<number>(config?.checkin_hours_after ?? 48)
  const [flagTimeout, setFlagTimeout] = useState<number>(config?.checkin_flag_timeout_hours ?? 48)
  const [templates, setTemplates] = useState<Record<string, string>>(config?.whatsapp_templates ?? {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (config) {
      setIntervals(config.follow_up_intervals?.length ? config.follow_up_intervals : [1, 3, 7])
      setReminderHours(config.reminder_hours_before)
      setCheckinHours(config.checkin_hours_after)
      setFlagTimeout(config.checkin_flag_timeout_hours)
      setTemplates(config.whatsapp_templates ?? {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.id])

  const templateFields: Array<{ key: string; label: string; hint: string }> = [
    { key: "appointment_reminder", label: "Appointment reminder", hint: "Sent before every confirmed visit" },
    { key: "non_booker_follow_up", label: "Non-booker follow-up", hint: "Qualified leads who never booked" },
    { key: "post_visit_checkin", label: "Post-visit check-in", hint: "Sent after attended appointments" },
    { key: "no_show_recovery", label: "No-show recovery", hint: "Patients who missed a slot" },
  ]

  async function save() {
    if (!config) return
    setSaving(true)
    const res = await upsertClinicConfig(config.clinic_id, {
      follow_up_intervals: intervals,
      reminder_hours_before: reminderHours,
      checkin_hours_after: checkinHours,
      checkin_flag_timeout_hours: flagTimeout,
      whatsapp_templates: templates,
    })
    setSaving(false)
    if (res.error) toast("Could not save automation settings", { description: res.error, variant: "danger" })
    else {
      toast("Automation settings saved")
      refetch()
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Follow-up cadence</CardTitle>
              <CardDescription>When Franel re-reaches out to interested but unbooked leads</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {intervals.map((v, i) => (
                <Field key={i} label={`After ${v} day${v === 1 ? "" : "s"}`}>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={v}
                    onChange={(e) =>
                      setIntervals((prev) => prev.map((x, j) => (j === i ? Math.max(1, Number(e.target.value) || 1) : x)))
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
              <Field label="Reminder before visit">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={reminderHours}
                  onChange={(e) => setReminderHours(Number(e.target.value) || 24)}
                />
              </Field>
              <Field label="Check-in after visit">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={checkinHours}
                  onChange={(e) => setCheckinHours(Number(e.target.value) || 48)}
                />
              </Field>
              <Field label="Flag if no reply">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={flagTimeout}
                  onChange={(e) => setFlagTimeout(Number(e.target.value) || 48)}
                />
              </Field>
            </div>
            <p className="text-[10.5px] leading-snug text-muted-2">
              All times are in hours. Franel never messages outside your opening hours.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>WhatsApp templates</CardTitle>
              <CardDescription>Message templates Franel personalises with patient name and slot details</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {templateFields.map((t) => (
              <Field key={t.key} label={t.label} hint={t.hint}>
                <Textarea
                  rows={2}
                  value={templates[t.key] ?? ""}
                  onChange={(e) => setTemplates((prev) => ({ ...prev, [t.key]: e.target.value }))}
                  placeholder={`Hi {{name}}, …`}
                />
              </Field>
            ))}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save size={13} /> {saving ? "Saving…" : "Save automation settings"}
          </Button>
        </div>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Autonomy</CardTitle>
            <CardDescription>What Franel does without asking</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { title: "Auto-qualify and book", desc: "Franel qualifies leads and books slots inside opening hours. You're notified, not interrupted." },
            { title: "Auto-send reminders", desc: "Appointment reminders go out automatically at your configured time." },
            { title: "Escalate sensitive cases", desc: "Pain, medical history, complaints and refund requests always route to a human with full context." },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-control border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{f.title}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-2">{f.desc}</p>
              </div>
              <Badge variant="green" dot>On</Badge>
            </div>
          ))}
          <p className="text-[10px] text-muted-2">These routes are fixed for safety and cannot be disabled.</p>
        </CardContent>
      </Card>
      <p className="text-right">
        <span className="text-[10.5px] text-muted-2">Use the save button on the left to apply changes.</span>
      </p>
    </div>
  )
}

function TeamTab({ staff }: { staff: Staff[] | null }) {
  const { toast } = useToast()
  const list = staff ?? []
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Team members</CardTitle>
            <CardDescription>Who receives escalations and can take over chats</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast("Invites send a WhatsApp + email link", { description: "Invited members join this clinic the first time they sign in.", variant: "info" })}
          >
            Invite teammate
          </Button>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {list.length === 0 && <p className="py-4 text-center text-[11px] text-muted-2">No team members yet.</p>}
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-card border border-border p-3">
              <Avatar name={s.name} size="md" online={s.is_active} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{s.name}</p>
                <p className="truncate text-[10.5px] text-muted-2">{s.email ?? s.phone ?? "No contact details"}</p>
              </div>
              <Badge variant={s.is_active ? "green" : "neutral"} dot>
                {s.is_active ? "Active" : "Inactive"}
              </Badge>
              <Badge variant={s.role === "owner" ? "violet" : "neutral"}>{s.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Roles</CardTitle>
            <CardDescription>Per-role permissions</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-[11px] leading-relaxed">
          <div className="rounded-control bg-surface-2/60 p-3">
            <p className="font-bold">Owner</p>
            <p className="mt-0.5 text-muted-2">Full access — billing, team, automation and clinic settings.</p>
          </div>
          <div className="rounded-control bg-surface-2/60 p-3">
            <p className="font-bold">Manager</p>
            <p className="mt-0.5 text-muted-2">Chats, bookings, escalations and patient notes. No billing or team changes.</p>
          </div>
          <div className="rounded-control bg-surface-2/60 p-3">
            <p className="font-bold">Receptionist</p>
            <p className="mt-0.5 text-muted-2">Day-to-day inbox and booking management only.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}