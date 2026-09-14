import { format, formatDistanceToNowStrict, isToday, isTomorrow, differenceInMinutes, differenceInDays } from 'date-fns'

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function timeShort(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts
  return format(d, 'HH:mm')
}

export function timeAgo(ts: string | Date | null | undefined): string {
  if (!ts) return '—'
  const diff = differenceInMinutes(new Date(), new Date(ts))
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const hours = Math.floor(diff / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return format(new Date(ts), 'd MMM')
}

export function timeAgoFull(ts: string | Date | null | undefined): string {
  if (!ts) return '—'
  return formatDistanceToNowStrict(new Date(ts), { addSuffix: true })
}

export function dateLabel(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00' : '')) : date
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (differenceInDays(d, new Date()) > 0 && differenceInDays(d, new Date()) < 7) {
    return format(d, 'EEE d MMM')
  }
  return format(d, 'd MMM yyyy')
}

export function fullDateLabel(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00' : '')) : date
  return format(d, 'EEE, d MMM yyyy')
}

export function appointmentDateTimeLabel(a: { appointment_date: string; appointment_time: string }): string {
  const date = a.appointment_date.length === 10 ? new Date(a.appointment_date + 'T00:00:00') : new Date(a.appointment_date)
  return `${dateLabel(date)} · ${timeShort(new Date('2000-01-01T' + (a.appointment_time.slice(0, 5) + ':00')))}`
}

export function ghs(amount: number): string {
  return 'GH₵ ' + amount.toLocaleString('en-GH', { maximumFractionDigits: 0 })
}

export function minutesSince(ts: string | null | undefined): number {
  if (!ts) return 0
  return Math.max(0, differenceInMinutes(new Date(), new Date(ts)))
}

export function waitingLabel(ts: string | null | undefined): string {
  const m = minutesSince(ts)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim()
}

export function isTodayStr(dateStr: string): boolean {
  if (dateStr.length !== 10) return false
  return dateStr === format(new Date(), 'yyyy-MM-dd')
}

export const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Tier 1 · Emergency',
  2: 'Tier 2 · Urgent',
  3: 'Tier 3 · Operational',
}