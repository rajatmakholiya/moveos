import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { ComplianceTask } from '@/lib/models/ComplianceTask'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)

  const sprint = searchParams.get('sprint')
  const severity = searchParams.get('severity')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  const query: Record<string, unknown> = {}
  if (sprint) query.sprint = sprint
  if (severity) query.severity = severity
  if (status) query.status = status
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { module: { $regex: search, $options: 'i' } },
      { complianceId: { $regex: search, $options: 'i' } },
    ]
  }

  const tasks = await ComplianceTask.find(query).sort({ priorityOrder: 1, createdAt: 1 }).lean()
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const task = await ComplianceTask.create(body)
  return NextResponse.json(task, { status: 201 })
}
