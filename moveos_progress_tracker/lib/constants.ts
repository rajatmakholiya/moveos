export const SPRINTS = [
  { id: 'Sprint 1', label: 'Sprint 1 — Core Backend & Contracts' },
  { id: 'Sprint 2', label: 'Sprint 2 — Booking, Trip, Route, KYC' },
  { id: 'Sprint 3', label: 'Sprint 3 — Admin Real Data' },
  { id: 'Sprint 4', label: 'Sprint 4 — PWA & Config Stability' },
  { id: 'Sprint 5', label: 'Sprint 5 — Security Before Production' },
  { id: 'Sprint 6', label: 'Sprint 6 — GA Enhancements' },
] as const

export type SprintId = (typeof SPRINTS)[number]['id']

export const SEVERITIES = ['P0', 'P1', 'P2', 'P3'] as const
export const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const

export const STATUS_LABELS: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}
