import { Badge } from "@/components/ui/Badge"
import type { Clinic } from "@/lib/types"

const WA: Record<Clinic["wa_status"], { variant: "neutral" | "blue" | "green" | "red"; label: string }> = {
  pending: { variant: "neutral", label: "WA pending" },
  linking: { variant: "blue", label: "Linking number" },
  active: { variant: "green", label: "WA live" },
  error: { variant: "red", label: "WA error" },
}

export function WaStatusBadge({ status }: { status: Clinic["wa_status"] }) {
  const c = WA[status] ?? WA.pending
  return (
    <Badge variant={c.variant} dot>
      {c.label}
    </Badge>
  )
}

const LIFECYCLE: Record<Clinic["status"], { variant: "violet" | "green" | "red"; label: string }> = {
  trial: { variant: "violet", label: "Trial" },
  active: { variant: "green", label: "Active" },
  suspended: { variant: "red", label: "Suspended" },
}

export function ClinicStatusBadge({ status }: { status: Clinic["status"] }) {
  const c = LIFECYCLE[status] ?? LIFECYCLE.trial
  return (
    <Badge variant={c.variant} dot>
      {c.label}
    </Badge>
  )
}