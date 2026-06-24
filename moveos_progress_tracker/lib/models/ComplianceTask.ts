import mongoose, { Document, Model, Schema } from 'mongoose'

export interface IComplianceTask extends Document {
  complianceId: string
  sprint: string
  severity: 'P0' | 'P1' | 'P2' | 'P3'
  module: string
  title: string
  currentProblem: string
  expectedFix: string
  owner: string
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  priorityOrder: number
  codexPrompt: string
  notes: string
  filesChanged: string[]
  testCommand: string
  testResult: string
  manualQaSteps: string[]
  createdAt: Date
  updatedAt: Date
}

const ComplianceTaskSchema = new Schema<IComplianceTask>(
  {
    complianceId: { type: String, required: true, unique: true, index: true },
    sprint: { type: String, required: true, index: true },
    severity: { type: String, enum: ['P0', 'P1', 'P2', 'P3'], required: true },
    module: { type: String, required: true },
    title: { type: String, required: true },
    currentProblem: { type: String, default: '' },
    expectedFix: { type: String, default: '' },
    owner: { type: String, default: '' },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'blocked', 'done'],
      default: 'todo',
    },
    priorityOrder: { type: Number, default: 99 },
    codexPrompt: { type: String, default: '' },
    notes: { type: String, default: '' },
    filesChanged: { type: [String], default: [] },
    testCommand: { type: String, default: '' },
    testResult: { type: String, default: '' },
    manualQaSteps: { type: [String], default: [] },
  },
  { timestamps: true }
)

export const ComplianceTask: Model<IComplianceTask> =
  mongoose.models.ComplianceTask ??
  mongoose.model<IComplianceTask>('ComplianceTask', ComplianceTaskSchema)
