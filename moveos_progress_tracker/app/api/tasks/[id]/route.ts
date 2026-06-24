import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { ComplianceTask } from '@/lib/models/ComplianceTask'

type Ctx = { params: { id: string } }

export async function GET(_: NextRequest, { params }: Ctx) {
  await connectDB()
  const task = await ComplianceTask.findById(params.id).lean()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  await connectDB()
  const body = await req.json()
  const task = await ComplianceTask.findByIdAndUpdate(params.id, body, {
    new: true,
    runValidators: true,
  }).lean()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  await connectDB()
  await ComplianceTask.findByIdAndDelete(params.id)
  return NextResponse.json({ ok: true })
}
