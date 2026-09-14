import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Users, ChevronRight } from "lucide-react"
import { useLayoutData } from "@/components/layout/Layout"
import { Card, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Avatar } from "@/components/ui/Avatar"
import { Skeleton } from "@/components/ui/Skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { SourceBadge } from "@/components/ui/status-badges"
import { timeAgo, fullDateLabel } from "@/lib/format"

export function PatientsPage() {
  const { patients, conversations, appointments, loading } = useLayoutData()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patients
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          (p.email ?? "").toLowerCase().includes(q)
      )
      .map((p) => {
        const convs = conversations.filter((c) => c.patient_id === p.id)
        const appts = appointments.filter((a) => a.patient_id === p.id)
        const lastContact = convs
          .map((c) => c.last_message_at ?? c.created_at)
          .sort()
          .at(-1)
        return { patient: p, convCount: convs.length, apptCount: appts.length, lastContact }
      })
      .sort((a, b) => (b.lastContact ?? "").localeCompare(a.lastContact ?? ""))
  }, [patients, conversations, appointments, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone or email…"
            className="pl-9"
            aria-label="Search patients"
          />
        </div>
        <p className="text-[11px] text-muted-2">
          {rows.length} patient{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<Users size={18} className="text-violet" />}
              title={query ? "No matching patients" : "No patients yet"}
              description={
                query
                  ? "Try a different name, phone or email."
                  : "Every WhatsApp conversation creates a patient record automatically."
              }
              actionLabel={query ? "Clear search" : undefined}
              onAction={query ? () => setQuery("") : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3 text-right">Conversations</th>
                    <th className="px-4 py-3 text-right">Visits booked</th>
                    <th className="px-4 py-3">Member since</th>
                    <th className="px-4 py-3 text-right">Last contact</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ patient, convCount, apptCount, lastContact }) => (
                    <tr
                      key={patient.id}
                      onClick={() => navigate(`/patients/${patient.id}`)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={patient.name} size="sm" />
                          <span className="text-xs font-semibold">{patient.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-[11px]">{patient.phone}</span>
                        {patient.email && <span className="block text-[10.5px] text-muted-2">{patient.email}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge source={patient.source} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold">{convCount}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold">{apptCount}</td>
                      <td className="px-4 py-3 text-[11px] text-muted">{fullDateLabel(patient.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                          {timeAgo(lastContact)}
                          <ChevronRight size={12} className="text-muted-2" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}