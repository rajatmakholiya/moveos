import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { ComplianceTask } from '@/lib/models/ComplianceTask'
import { SPRINTS } from '@/lib/constants'

export async function GET() {
  await connectDB()

  const [total, done, inProgress, blocked, openP0, allTasks] = await Promise.all([
    ComplianceTask.countDocuments(),
    ComplianceTask.countDocuments({ status: 'done' }),
    ComplianceTask.countDocuments({ status: 'in_progress' }),
    ComplianceTask.countDocuments({ status: 'blocked' }),
    ComplianceTask.countDocuments({ severity: 'P0', status: { $ne: 'done' } }),
    ComplianceTask.find({}, 'sprint status severity').lean(),
  ])

  const sprintStats = SPRINTS.map((s) => {
    const sprintTasks = allTasks.filter((t) => t.sprint === s.id)
    const sprintDone = sprintTasks.filter((t) => t.status === 'done').length
    const sprintBlocked = sprintTasks.filter((t) => t.status === 'blocked').length
    const sprintInProgress = sprintTasks.filter((t) => t.status === 'in_progress').length
    return {
      sprint: s.id,
      label: s.label,
      total: sprintTasks.length,
      done: sprintDone,
      inProgress: sprintInProgress,
      blocked: sprintBlocked,
      pct: sprintTasks.length ? Math.round((sprintDone / sprintTasks.length) * 100) : 0,
    }
  })

  return NextResponse.json({
    total,
    done,
    inProgress,
    blocked,
    openP0,
    pct: total ? Math.round((done / total) * 100) : 0,
    sprints: sprintStats,
  })
}
